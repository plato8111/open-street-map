// WeWeb Supabase Plugin Integration
// Access Supabase through WeWeb's plugin system

// Development-only logging (disabled in production)
const DEV_MODE = false; // Set to true only during development
const devLog = DEV_MODE ? console.log.bind(console) : () => {};
const devGroup = DEV_MODE ? console.group.bind(console) : () => {};
const devGroupEnd = DEV_MODE ? console.groupEnd.bind(console) : () => {};

function getSupabaseClient() {
  try {
    // Method 1: Direct WeWeb Supabase plugin access
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins && wwLib.wwPlugins.supabase) {
      const supabasePlugin = wwLib.wwPlugins.supabase;

      // The plugin stores the Supabase client in the 'instance' property
      if (supabasePlugin.instance) {
        const client = supabasePlugin.instance;

        // Configure the client to use gis schema by default for table queries
        if (client && client.from && !client._gisSchemaConfigured) {
          const originalFrom = client.from;

          // Override from method to use gis schema by default
          client.from = function(tableName) {
            // If table name doesn't contain a dot, assume it's in gis schema
            if (!tableName.includes('.')) {
              return originalFrom.call(this, `gis.${tableName}`);
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

    // All methods failed
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
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .schema('gis')
      .from('countries')
      .select('id, name')
      .limit(1);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, dataCount: data?.length || 0 };

  } catch (error) {
    console.error('Supabase GIS connection test failed:', error);
    return { success: false, error: error.message };
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

      const { data, error } = await supabase
        .schema('gis')
        .from('countries')
        .select('id, name, iso_a2, iso_a3, geometry')
        .gte('bbox_west', bounds.west - 0.1)
        .lte('bbox_east', bounds.east + 0.1)
        .gte('bbox_south', bounds.south - 0.1)
        .lte('bbox_north', bounds.north + 0.1);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Failed to fetch countries:', error);
      return [];
    }
  },

  /**
   * Get states from GIS schema
   */
  async getStatesInBounds(bounds, zoomLevel = 5) {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .schema('gis')
        .from('states')
        .select('id, name, iso_3166_2, country_code, geometry')
        .gte('bbox_west', bounds.west - 0.1)
        .lte('bbox_east', bounds.east + 0.1)
        .gte('bbox_south', bounds.south - 0.1)
        .lte('bbox_north', bounds.north + 0.1);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Failed to fetch states:', error);
      return [];
    }
  },

  /**
   * Convert boundary data to GeoJSON format
   */
  toGeoJSON(boundaries) {
    if (!boundaries || !boundaries.length) {
      return {
        type: 'FeatureCollection',
        features: []
      };
    }

    return {
      type: 'FeatureCollection',
      features: boundaries.map(boundary => ({
        type: 'Feature',
        id: boundary.id,
        properties: {
          name: boundary.name,
          iso_a2: boundary.iso_a2,
          iso_a3: boundary.iso_a3,
          iso_3166_2: boundary.iso_3166_2,
          country_code: boundary.country_code
        },
        geometry: boundary.geometry
      }))
    };
  }
};

/**
 * Simple in-memory cache for boundary data
 */
export const boundaryCache = {
  _cache: new Map(),
  _cacheExpiry: 5 * 60 * 1000, // 5 minutes

  _getCacheKey(type, bounds) {
    return `${type}:${bounds.north.toFixed(2)},${bounds.south.toFixed(2)},${bounds.east.toFixed(2)},${bounds.west.toFixed(2)}`;
  },

  get(type, bounds) {
    const key = this._getCacheKey(type, bounds);
    const cached = this._cache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this._cacheExpiry) {
      this._cache.delete(key);
      return null;
    }

    return cached.data;
  },

  set(type, bounds, data) {
    const key = this._getCacheKey(type, bounds);
    this._cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Simple cache size management - keep last 50 entries
    if (this._cache.size > 50) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
  },

  clear() {
    this._cache.clear();
  }
};

export { getSupabaseClient };
