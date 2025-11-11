// WeWeb Supabase Plugin Integration
// Access Supabase through WeWeb's plugin system

function getSupabaseClient() {
  try {
    // Method 1: Direct WeWeb Supabase plugin access (CORRECT METHOD based on source code)
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins && wwLib.wwPlugins.supabase) {
      const supabasePlugin = wwLib.wwPlugins.supabase;

      // The plugin stores the Supabase client in the 'instance' property
      if (supabasePlugin.instance) {
        // Configure the client to use gis schema by default for table queries
        const client = supabasePlugin.instance;
        if (client && client.from && !client._gisSchemaConfigured) {
          // Store original from method
          const originalFrom = client.from;

          // Override from method to use gis schema by default
          client.from = function(tableName) {
            // If table name doesn't contain a dot, assume it's in gis schema
            if (!tableName.includes('.')) {
              const gisTableName = `gis.${tableName}`;
              return originalFrom.call(this, gisTableName);
            }
            // If table name already starts with gis., use it as-is
            if (tableName.startsWith('gis.')) {
              return originalFrom.call(this, tableName);
            }
            return originalFrom.call(this, tableName);
          };

          client._gisSchemaConfigured = true;
        }

        return client;
      }

      // Fallback: try to access the whole plugin (it has RPC methods)
      if (supabasePlugin.callPostgresFunction) {
        return supabasePlugin;
      }
    }

    // Method 2: Check if plugin is available but not yet loaded
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins) {
      // Try alternative plugin names
      const possiblePaths = ['plugin-supabase', 'Supabase', 'supabasePlugin'];
      for (const path of possiblePaths) {
        if (wwLib.wwPlugins[path] && wwLib.wwPlugins[path].instance) {
          return wwLib.wwPlugins[path].instance;
        }
      }
    }

    // Method 3: WeWeb $store access (for plugin data)
    if (typeof wwLib !== 'undefined' && wwLib.$store) {
      try {
        const store = wwLib.$store;
        if (store.state && store.state.data && store.state.data.plugins) {
          const supabasePlugin = store.state.data.plugins.supabase || store.state.data.plugins['plugin-supabase'];
          if (supabasePlugin && supabasePlugin.instance) {
            return supabasePlugin.instance;
          }
        }
      } catch (err) {
        // Silent fail - try next method
      }
    }

    // Method 4: WeWeb variable access
    if (typeof wwLib !== 'undefined' && wwLib.wwVariable) {
      try {
        const possibleVariables = ['supabase', 'plugin-supabase', 'supabaseClient'];
        for (const varName of possibleVariables) {
          const supabaseVar = wwLib.wwVariable.getValue(varName);
          if (supabaseVar && (supabaseVar.instance || supabaseVar.rpc)) {
            return supabaseVar.instance || supabaseVar;
          }
        }
      } catch (err) {
        // Silent fail - try next method
      }
    }

    // Method 5: Global window fallbacks
    if (typeof window !== 'undefined' && window.wwPlugins && window.wwPlugins.supabase) {
      return window.wwPlugins.supabase.instance || window.wwPlugins.supabase;
    }

    if (typeof window !== 'undefined' && window.supabase) {
      return window.supabase;
    }

    // All methods failed - return null
    return null;

  } catch (error) {
    console.error('Error accessing Supabase client:', error);
    return null;
  }
}

/**
 * Boundary API functions - Updated for GIS schema only
 */
export const boundaryAPI = {
  /**
   * Get countries from GIS schema
   */
  async getCountriesInBounds(bounds, zoomLevel = 1) {
    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        console.error('Supabase client not available');
        return [];
      }

      // Try using the gis.get_simplified_boundaries_in_bbox function with spatial filtering
      if (typeof supabase.rpc === 'function' && bounds) {
        try {
          // Call public wrapper function (Supabase JS uses public schema by default)
          const { data, error } = await supabase
            .rpc('get_simplified_boundaries_in_bbox', {
              boundary_type: 'countries',
              zoom_level: zoomLevel,
              bbox_west: bounds.getWest(),
              bbox_south: bounds.getSouth(),
              bbox_east: bounds.getEast(),
              bbox_north: bounds.getNorth(),
              country_filter: null
            });

          if (error) {
            console.error('Spatial RPC failed for countries:', error);
          } else if (data && data.length > 0) {
            return data.map(country => ({
              id: country.id,
              name: country.name,
              iso_a2: country.properties?.iso_a2 || null,
              iso_a3: country.properties?.iso_a3 || null,
              geometry_geojson: country.geometry_geojson,
              properties: country.properties
            }));
          } else {
            return [];
          }
        } catch (rpcError) {
          console.error('Spatial RPC call failed for countries:', rpcError);
        }
      }

      // Fallback to direct table query if RPC fails
      // Call gis.get_countries_as_geojson() to convert geometry to GeoJSON format
      const { data, error } = await supabase
        .schema('gis')
        .rpc('get_countries_as_geojson', {});

      if (error) {
        console.error('Error fetching countries via RPC:', error);

        // Try basic select as last resort
        const { data: rawData, error: rawError } = await supabase
          .schema('gis')
          .from('countries')
          .select('id, name, iso3166_1_alpha_2, iso3166_1_alpha_3')
          .limit(1000);

        if (rawError) {
          console.error('Error fetching countries from gis schema:', rawError);
          return [];
        }

        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map(country => ({
        id: country.id,
        name: country.name,
        iso_a2: country.iso_a2,
        iso_a3: country.iso_a3,
        geometry_geojson: country.geometry_geojson
      }));

    } catch (err) {
      console.error('Boundary API error (getCountriesInBounds):', err);
      return [];
    }
  },

  /**
   * Get states/provinces from GIS schema with spatial filtering
   */
  async getStatesInBounds(bounds, zoomLevel = 6, countryFilter = null) {
    try {
      const supabase = getSupabaseClient();

      if (!supabase) {
        console.error('Supabase client not available');
        return [];
      }

      // Try RPC function with bounds filtering and simplification first
      if (typeof supabase.rpc === 'function' && bounds) {
        try {
          const { data, error} = await supabase
            .rpc('get_simplified_boundaries_in_bbox', {
              boundary_type: 'states',
              zoom_level: zoomLevel,
              bbox_west: bounds.getWest(),
              bbox_south: bounds.getSouth(),
              bbox_east: bounds.getEast(),
              bbox_north: bounds.getNorth(),
              country_filter: countryFilter
            });

          if (error) {
            console.error('Spatial RPC failed for states:', error);
          } else if (data && data.length > 0) {
            return data.map(state => ({
              id: state.id,
              name: state.name,
              name_en: state.properties?.name_en || state.name,
              iso_a2: state.properties?.iso_a2 || null,
              adm1_code: state.properties?.adm1_code || null,
              admin: state.properties?.admin || null,
              geometry_geojson: state.geometry_geojson,
              properties: state.properties
            }));
          } else {
            return [];
          }
        } catch (rpcError) {
          console.error('Spatial RPC call failed:', rpcError);
        }
      }

      // Fallback to direct table query (without spatial filtering)
      // Call gis.get_states_as_geojson() to convert geometry to GeoJSON format
      const { data, error } = await supabase
        .schema('gis')
        .rpc('get_states_as_geojson', {
          country_code: countryFilter
        });

      if (error) {
        console.error('Error fetching states via RPC:', error);

        // Try basic select as last resort
        let query = supabase.schema('gis')
          .from('states_provinces')
          .select('id, name, name_en, iso_a2, adm1_code, type, type_en')
          .limit(5000);

        if (countryFilter) {
          query = query.eq('iso_a2', countryFilter);
        }

        const { data: rawData, error: rawError } = await query;

        if (rawError) {
          console.error('Error fetching states from gis schema:', rawError);
          return [];
        }

        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map(state => ({
        id: state.id,
        name: state.name,
        name_en: state.name_en,
        iso_a2: state.iso_a2,
        adm1_code: state.adm1_code,
        type: state.type,
        type_en: state.type_en,
        geometry_geojson: state.geometry_geojson
      }));

    } catch (err) {
      console.error('Boundary API error (getStatesInBounds):', err);
      return [];
    }
  },


  /**
   * Convert Supabase boundary data to GeoJSON for Leaflet
   */
  toGeoJSON(boundaries) {
    const geoJsonData = {
      type: 'FeatureCollection',
      features: boundaries.map(boundary => {
        try {
          // Handle both string (JSON) and object geometry
          let geometry;
          if (typeof boundary.geometry_geojson === 'string') {
            geometry = JSON.parse(boundary.geometry_geojson);
          } else if (typeof boundary.geometry_geojson === 'object') {
            geometry = boundary.geometry_geojson;
          } else {
            throw new Error('Invalid geometry format');
          }

          const feature = {
            type: 'Feature',
            properties: {
              id: boundary.id,
              code: boundary.code || boundary.iso_a2 || boundary.adm1_code,
              name: boundary.name,
              name_en: boundary.name_en,
              ...(boundary.properties || {})
            },
            geometry: geometry
          };
          return feature;
        } catch (error) {
          console.error('Error parsing geometry for boundary:', boundary.name, error);
          return null;
        }
      }).filter(f => f !== null)
    };

    return geoJsonData;
  }
};

/**
 * Cache for boundary data to improve performance
 */
export class BoundaryCache {
  constructor(maxAge = 5 * 60 * 1000, maxSize = 100) { // 5 minutes default, 100 entries max
    this.cache = new Map();
    this.maxAge = maxAge;
    this.maxSize = maxSize;
  }

  generateKey(type, bounds, zoomLevel, extra = '') {
    const b = bounds;
    return `${type}_${b.getSouth()}_${b.getWest()}_${b.getNorth()}_${b.getEast()}_${zoomLevel}_${extra}`;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  set(key, data) {
    // Evict oldest entry if cache is at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }
}

// Export default cache instance
export const boundaryCache = new BoundaryCache();

// Export the getSupabaseClient function
export { getSupabaseClient };