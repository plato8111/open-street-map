// WeWeb Supabase Plugin Integration
// Access Supabase through WeWeb's plugin system

/**
 * Debug function to help identify available Supabase access points
 */
function debugSupabaseAccess() {
  console.group('🔍 Supabase Plugin Debug Information');

  // Check wwLib availability and properties
  console.log('wwLib available:', typeof wwLib !== 'undefined');
  if (typeof wwLib !== 'undefined') {
    console.log('Available wwLib properties:', Object.keys(wwLib));

    // Check wwPlugins (MOST IMPORTANT for Supabase)
    console.log('wwLib.wwPlugins available:', typeof wwLib.wwPlugins !== 'undefined');
    if (wwLib.wwPlugins) {
      console.log('Available wwLib plugins:', Object.keys(wwLib.wwPlugins));

      // Check specific Supabase plugin
      if (wwLib.wwPlugins.supabase) {
        const plugin = wwLib.wwPlugins.supabase;
        console.log('✅ wwLib.wwPlugins.supabase found!');
        console.log('Plugin properties:', Object.keys(plugin));
        console.log('Plugin has instance:', !!plugin.instance);
        console.log('Plugin has callPostgresFunction:', typeof plugin.callPostgresFunction === 'function');
        console.log('Plugin has settings:', !!plugin.settings);

        if (plugin.settings) {
          console.log('Plugin publicData:', !!plugin.settings.publicData);
          console.log('Plugin privateData:', !!plugin.settings.privateData);
          if (plugin.settings.publicData) {
            console.log('Project URL configured:', !!plugin.settings.publicData.projectUrl);
            console.log('API Key configured:', !!plugin.settings.publicData.apiKey);
          }
        }

        if (plugin.instance) {
          console.log('Instance properties:', Object.keys(plugin.instance));
          console.log('Instance has rpc method:', typeof plugin.instance.rpc === 'function');
        }
      } else {
        console.log('❌ wwLib.wwPlugins.supabase not found');
      }
    }

    // Check store
    console.log('wwLib.$store available:', typeof wwLib.$store !== 'undefined');
    if (wwLib.$store) {
      console.log('Store state available:', !!wwLib.$store.state);
      if (wwLib.$store.state && wwLib.$store.state.data) {
        console.log('Store data available:', !!wwLib.$store.state.data);
        if (wwLib.$store.state.data.plugins) {
          console.log('Available plugins in store:', Object.keys(wwLib.$store.state.data.plugins));
        }
      }
    }

    // Check wwVariable
    console.log('wwLib.wwVariable available:', typeof wwLib.wwVariable !== 'undefined');
    if (wwLib.wwVariable) {
      try {
        const supabaseVar = wwLib.wwVariable.getValue('supabase');
        console.log('wwLib.wwVariable.getValue("supabase"):', !!supabaseVar);
      } catch (err) {
        console.log('Error accessing wwVariable supabase:', err.message);
      }
    }
  }

  // Check window global
  console.log('window.wwPlugins available:', typeof window !== 'undefined' && !!window.wwPlugins);
  if (typeof window !== 'undefined' && window.wwPlugins) {
    console.log('Available window plugins:', Object.keys(window.wwPlugins));
  }

  console.log('window.supabase available:', typeof window !== 'undefined' && !!window.supabase);

  console.groupEnd();
}

function getSupabaseClient() {
  try {
    // Debug mode for development - only run once
    if (typeof console !== 'undefined' && !getSupabaseClient._debugRun) {
      debugSupabaseAccess();
      getSupabaseClient._debugRun = true;
    }

    // Method 1: Direct WeWeb Supabase plugin access (CORRECT METHOD based on source code)
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins && wwLib.wwPlugins.supabase) {
      const supabasePlugin = wwLib.wwPlugins.supabase;

      // The plugin stores the Supabase client in the 'instance' property
      if (supabasePlugin.instance) {
        console.log('✅ Found Supabase client via wwLib.wwPlugins.supabase.instance');
        
        // Configure the client to use gis schema by default for table queries
        const client = supabasePlugin.instance;
        if (client && client.from && !client._gisSchemaConfigured) {
          // Store original from method
          const originalFrom = client.from;
          
          // Override from method to use gis schema by default
          client.from = function(tableName) {
            console.log('🔄 Supabase.from() called with table:', tableName);
            // If table name doesn't contain a dot, assume it's in gis schema
            if (!tableName.includes('.')) {
              const gisTableName = `gis.${tableName}`;
              console.log('🎯 Converting to gis schema:', gisTableName);
              return originalFrom.call(this, gisTableName);
            }
            // If table name already starts with gis., use it as-is
            if (tableName.startsWith('gis.')) {
              console.log('📋 Using gis table as-is:', tableName);
              return originalFrom.call(this, tableName);
            }
            console.log('📋 Using table as-is:', tableName);
            return originalFrom.call(this, tableName);
          };
          
          client._gisSchemaConfigured = true;
          console.log('✅ Configured Supabase client to use gis schema by default');
        }
        
        return client;
      }

      // Fallback: try to access the whole plugin (it has RPC methods)
      if (supabasePlugin.callPostgresFunction) {
        console.log('✅ Found Supabase plugin via wwLib.wwPlugins.supabase (using plugin methods)');
        return supabasePlugin;
      }
    }

    // Method 2: Check if plugin is available but not yet loaded
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins) {
      console.log('Available wwLib plugins:', Object.keys(wwLib.wwPlugins));

      // Try alternative plugin names
      const possiblePaths = ['plugin-supabase', 'Supabase', 'supabasePlugin'];
      for (const path of possiblePaths) {
        if (wwLib.wwPlugins[path] && wwLib.wwPlugins[path].instance) {
          console.log(`✅ Found Supabase via wwLib.wwPlugins.${path}.instance`);
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
            console.log('✅ Found Supabase via wwLib.$store.state.data.plugins');
            return supabasePlugin.instance;
          }
        }
      } catch (err) {
        console.log('❌ Failed to access via wwLib.$store:', err.message);
      }
    }

    // Method 4: WeWeb variable access
    if (typeof wwLib !== 'undefined' && wwLib.wwVariable) {
      try {
        const possibleVariables = ['supabase', 'plugin-supabase', 'supabaseClient'];
        for (const varName of possibleVariables) {
          const supabaseVar = wwLib.wwVariable.getValue(varName);
          if (supabaseVar && (supabaseVar.instance || supabaseVar.rpc)) {
            console.log(`✅ Found Supabase via wwLib.wwVariable.getValue('${varName}')`);
            return supabaseVar.instance || supabaseVar;
          }
        }
      } catch (err) {
        console.log('❌ Failed to access via wwLib.wwVariable:', err.message);
      }
    }

    // Method 5: Global window fallbacks
    if (typeof window !== 'undefined' && window.wwPlugins && window.wwPlugins.supabase) {
      console.log('✅ Found Supabase via window.wwPlugins.supabase');
      return window.wwPlugins.supabase.instance || window.wwPlugins.supabase;
    }

    if (typeof window !== 'undefined' && window.supabase) {
      console.log('✅ Found Supabase via window.supabase');
      return window.supabase;
    }

    // All methods failed
    console.error('❌ WeWeb Supabase plugin not found in any location');
    console.error('Available wwLib properties:', typeof wwLib !== 'undefined' ? Object.keys(wwLib) : 'wwLib not available');
    console.error('Please ensure:');
    console.error('1. WeWeb Supabase plugin is installed and configured');
    console.error('2. Plugin has valid projectUrl and apiKey settings');
    console.error('3. Plugin has been initialized (check wwLib.wwPlugins.supabase.instance)');

    throw new Error('Supabase plugin not available - please ensure WeWeb Supabase plugin is installed and configured');

  } catch (error) {
    console.error('Error accessing Supabase client:', error);
    throw error;
  }
}

/**
 * Test Supabase connection with GIS schema
 */
export async function testSupabaseConnection() {
  try {
    console.group('🧪 Testing Supabase GIS Connection');

    const supabase = getSupabaseClient();
    console.log('Supabase client obtained:', !!supabase);

    // Test direct table access to gis.countries
    const { data, error } = await supabase
      .schema('gis')
      .from('countries')
      .select('id, name')
      .limit(1);

    if (error) {
      console.error('GIS schema access failed:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ GIS schema access successful');
    return { success: true, dataCount: data?.length || 0 };

  } catch (error) {
    console.error('❌ Supabase GIS connection test failed:', error);
    return { success: false, error: error.message };
  } finally {
    console.groupEnd();
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
          console.log('🎯 Calling get_simplified_boundaries_in_bbox for countries with spatial filter');

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
            console.error('❌ Spatial RPC failed for countries:', error);
          } else if (data && data.length > 0) {
            console.log('✅ Spatial RPC successful, returned', data.length, 'countries (simplified + filtered)');
            return data.map(country => ({
              id: country.id,
              name: country.name,
              iso_a2: country.properties?.iso_a2 || null,
              iso_a3: country.properties?.iso_a3 || null,
              geometry_geojson: country.geometry_geojson,
              properties: country.properties
            }));
          } else {
            console.log('⚠️ Spatial RPC returned no countries for current bounds');
            return [];
          }
        } catch (rpcError) {
          console.error('❌ Spatial RPC call failed for countries:', rpcError);
        }
      }

      // Fallback to direct table query if RPC fails
      console.log('🔄 Falling back to RPC function for gis.countries');

      // Call gis.get_countries_as_geojson() to convert geometry to GeoJSON format
      const { data, error } = await supabase
        .schema('gis')
        .rpc('get_countries_as_geojson', {});

      if (error) {
        console.error('❌ Error fetching countries via RPC:', error);

        // Try basic select as last resort
        console.log('🔄 Trying basic select with raw geometry');
        const { data: rawData, error: rawError } = await supabase
          .schema('gis')
          .from('countries')
          .select('id, name, iso3166_1_alpha_2, iso3166_1_alpha_3')
          .limit(1000);

        if (rawError) {
          console.error('❌ Error fetching countries from gis schema:', rawError);
          return [];
        }

        console.warn('⚠️ No geometry data available - countries will not render');
        return [];
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ No countries data returned from gis schema');
        return [];
      }

      console.log('✅ Direct table query successful, returned', data.length, 'countries');
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
          console.log('🎯 Calling get_simplified_boundaries_in_bbox for states with spatial filter');

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
            console.error('❌ Spatial RPC failed for states:', error);
          } else if (data && data.length > 0) {
            console.log('✅ Spatial RPC successful, returned', data.length, 'states (simplified + filtered)');
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
            console.log('⚠️ Spatial RPC returned no states for current bounds');
            return [];
          }
        } catch (rpcError) {
          console.error('❌ Spatial RPC call failed:', rpcError);
        }
      }

      // Fallback to direct table query (without spatial filtering)
      console.log('🔄 Falling back to RPC function for states');

      // Call gis.get_states_as_geojson() to convert geometry to GeoJSON format
      const { data, error } = await supabase
        .schema('gis')
        .rpc('get_states_as_geojson', {
          country_code: countryFilter
        });

      if (error) {
        console.error('❌ Error fetching states via RPC:', error);

        // Try basic select as last resort
        console.log('🔄 Trying basic select with raw geometry');
        let query = supabase.schema('gis')
          .from('states_provinces')
          .select('id, name, name_en, iso_a2, adm1_code, type, type_en')
          .limit(5000);

        if (countryFilter) {
          query = query.eq('iso_a2', countryFilter);
          console.log('🔍 Filtering states by country:', countryFilter);
        }

        const { data: rawData, error: rawError } = await query;

        if (rawError) {
          console.error('❌ Error fetching states from gis schema:', rawError);
          return [];
        }

        console.warn('⚠️ No geometry data available - states will not render');
        return [];
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ No states data returned from gis schema');
        return [];
      }

      console.log('✅ GIS schema query successful, returned', data.length, 'states');
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
    console.log('🔄 Converting boundaries to GeoJSON:', boundaries?.length || 0, 'boundaries');

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

    console.log('✅ GeoJSON created with', geoJsonData.features.length, 'valid features');
    return geoJsonData;
  }
};

/**
 * Cache for boundary data to improve performance
 */
export class BoundaryCache {
  constructor(maxAge = 5 * 60 * 1000) { // 5 minutes default
    this.cache = new Map();
    this.maxAge = maxAge;
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
