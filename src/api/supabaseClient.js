// WeWeb Supabase Plugin Integration
// Access Supabase through WeWeb's plugin system

// =============================================================================
// ERROR HANDLING CONTRACT
// =============================================================================
//
// This module uses two error handling patterns:
//
// 1. RETURN ERROR OBJECTS (for validation and connection checks):
//    - validateCoordinates() -> Returns {valid: boolean, error?: string}
//    - validateBounds() -> Returns {valid: boolean, error?: string}
//    - testSupabaseConnection() -> Returns {success: boolean, error?: string}
//    - validateGISSetup() -> Returns {valid: boolean, errors: string[], warnings: string[]}
//    - getSupabaseClient() -> Returns null when client unavailable (never throws)
//
//    These functions are designed for graceful degradation. Callers should check
//    the returned object's validity/success flags before proceeding.
//
// 2. THROW ERRORS (for API operations that use retry logic):
//    - boundaryAPI.getCountriesInBounds() -> Throws after retry failures
//    - boundaryAPI.getStatesInBounds() -> Throws after retry failures
//
//    These functions throw errors with a `type` property from GISErrorTypes.
//    Recoverable errors (network issues) are retried automatically.
//    Permanent errors (missing schema, permissions) fail immediately.
//
// GISErrorTypes ENUM:
//    - NO_CLIENT: Supabase client not available (permanent)
//    - SCHEMA_NOT_FOUND: GIS schema missing (permanent)
//    - TABLE_NOT_FOUND: Required table missing (permanent)
//    - FUNCTION_NOT_FOUND: Required RPC function missing (permanent)
//    - PERMISSION_DENIED: RLS policy blocking access (permanent)
//    - INVALID_COORDINATES: Bad coordinate values (permanent)
//    - NETWORK_ERROR: Network/timeout issues (recoverable - will retry)
//    - UNKNOWN: Unclassified errors (recoverable - will retry)
//
// Use parseGISError() to convert any error into a structured {type, message, recoverable} object.
//
// =============================================================================

import {
  CACHE_LIMITS,
  RETRY_CONFIG,
  COORDINATE_BOUNDS
} from '../config/constants.js';
import { apiLogger } from '../config/debug.js';

// =============================================================================
// RETRY UTILITIES (inline to avoid circular dependency with useRetry.js)
// =============================================================================

/**
 * Calculate delay with exponential backoff and jitter
 *
 * ALGORITHM: Exponential Backoff with Decorrelated Jitter
 *
 * Formula: delay = min(baseDelay * 2^attempt, maxDelay) ± (jitter * jitterFactor)
 *
 * Example with baseDelay=1000ms, maxDelay=30000ms, jitterFactor=0.3:
 *   Attempt 0: 1000ms * 2^0 = 1000ms ± 300ms → 700-1300ms
 *   Attempt 1: 1000ms * 2^1 = 2000ms ± 600ms → 1400-2600ms
 *   Attempt 2: 1000ms * 2^2 = 4000ms ± 1200ms → 2800-5200ms
 *   Attempt 3: 1000ms * 2^3 = 8000ms ± 2400ms → 5600-10400ms
 *   Attempt 4+: capped at maxDelay (30000ms) ± jitter
 *
 * WHY JITTER? Without jitter, multiple clients that fail simultaneously will
 * all retry at exactly the same times, creating "retry storms" that overwhelm
 * the server. Jitter spreads retries across a time window, reducing peak load.
 *
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
function calculateRetryDelay(attempt, baseDelay = RETRY_CONFIG.BASE_DELAY_MS, maxDelay = RETRY_CONFIG.MAX_DELAY_MS) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // Add jitter based on config
  const jitter = cappedDelay * RETRY_CONFIG.JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic (for API calls)
 *
 * ALGORITHM: Retry with Selective Error Handling
 *
 * Execution Flow:
 *   1. Execute fn()
 *   2. If success → return result immediately
 *   3. If error:
 *      a. Parse error via parseGISError() to determine type and recoverability
 *      b. If NOT recoverable (schema missing, permission denied) → throw immediately
 *      c. If recoverable (network error) AND attempts remaining → wait and retry
 *      d. If max retries exhausted → throw the last error
 *
 * Error Classification (from parseGISError):
 *   RECOVERABLE (will retry):
 *     - NETWORK_ERROR: fetch/timeout issues
 *     - UNKNOWN: unclassified errors
 *   PERMANENT (throws immediately):
 *     - NO_CLIENT, SCHEMA_NOT_FOUND, TABLE_NOT_FOUND
 *     - FUNCTION_NOT_FOUND, PERMISSION_DENIED, INVALID_COORDINATES
 *
 * This selective approach prevents wasting retries on errors that will never succeed
 * (like missing database schema) while being resilient to transient failures.
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = RETRY_CONFIG.MAX_RETRIES,
    baseDelay = RETRY_CONFIG.BASE_DELAY_MS,
    maxDelay = RETRY_CONFIG.MAX_DELAY_MS,
    shouldRetry = (error) => {
      const parsed = parseGISError(error);
      return parsed.recoverable;
    },
    onRetry = null
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!shouldRetry(error) || attempt === maxRetries) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateRetryDelay(attempt, baseDelay, maxDelay);

      // Call onRetry callback if provided
      if (onRetry && typeof onRetry === 'function') {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: parseGISError(error)
        });
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

// =============================================================================
// COORDINATE VALIDATION
// =============================================================================

/**
 * Validate coordinate values
 *
 * This function does NOT throw - it returns an error object for graceful handling.
 *
 * @param {number} lat - Latitude value
 * @param {number} lng - Longitude value
 * @returns {{valid: boolean, error?: string, lat?: number, lng?: number}} Validation result
 *          - valid: true with parsed lat/lng if coordinates are valid
 *          - valid: false with error message if validation fails
 * @example
 * const result = validateCoordinates(40.7128, -74.0060);
 * if (!result.valid) {
 *   console.error(result.error); // Handle validation error
 *   return;
 * }
 * // Use result.lat and result.lng
 */
export function validateCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return { valid: false, error: 'Coordinates are required' };
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    return { valid: false, error: 'Coordinates must be valid numbers' };
  }

  if (parsedLat < COORDINATE_BOUNDS.LAT_MIN || parsedLat > COORDINATE_BOUNDS.LAT_MAX) {
    return { valid: false, error: `Latitude must be between ${COORDINATE_BOUNDS.LAT_MIN} and ${COORDINATE_BOUNDS.LAT_MAX} (got ${parsedLat})` };
  }

  if (parsedLng < COORDINATE_BOUNDS.LNG_MIN || parsedLng > COORDINATE_BOUNDS.LNG_MAX) {
    return { valid: false, error: `Longitude must be between ${COORDINATE_BOUNDS.LNG_MIN} and ${COORDINATE_BOUNDS.LNG_MAX} (got ${parsedLng})` };
  }

  return { valid: true, lat: parsedLat, lng: parsedLng };
}

/**
 * Validate bounding box values
 *
 * This function does NOT throw - it returns an error object for graceful handling.
 *
 * @param {Object} bounds - Leaflet bounds object with getSouth/getNorth/getWest/getEast methods
 * @returns {{valid: boolean, error?: string, south?: number, north?: number, west?: number, east?: number}} Validation result
 *          - valid: true with extracted bounds if valid
 *          - valid: false with error message if validation fails
 * @example
 * const result = validateBounds(map.getBounds());
 * if (!result.valid) {
 *   console.error(result.error); // Handle validation error
 *   return;
 * }
 * // Use result.south, result.north, result.west, result.east
 */
export function validateBounds(bounds) {
  if (!bounds) {
    return { valid: false, error: 'Bounds object is required' };
  }

  if (typeof bounds.getSouth !== 'function' ||
      typeof bounds.getNorth !== 'function' ||
      typeof bounds.getWest !== 'function' ||
      typeof bounds.getEast !== 'function') {
    return { valid: false, error: 'Invalid bounds object - missing required methods' };
  }

  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  if (isNaN(south) || isNaN(north) || isNaN(west) || isNaN(east)) {
    return { valid: false, error: 'Bounds contain invalid coordinate values' };
  }

  return { valid: true, south, north, west, east };
}

/**
 * Get Supabase client from WeWeb plugin system
 *
 * This function NEVER throws - it returns null when the client is unavailable.
 * This allows components to gracefully degrade when Supabase is not configured.
 *
 * @returns {Object|null} Supabase client instance or null if not available
 *
 * The function tries multiple methods to locate the Supabase client:
 * 1. Direct WeWeb Supabase plugin access (wwLib.wwPlugins.supabase)
 * 2. Alternative plugin names (plugin-supabase, Supabase, supabasePlugin)
 * 3. WeWeb $store access (store.state.data.plugins.supabase)
 * 4. WeWeb variable access (wwLib.wwVariable.getValue)
 * 5. Global window fallbacks (window.wwPlugins.supabase, window.supabase)
 *
 * @example
 * const supabase = getSupabaseClient();
 * if (!supabase) {
 *   // Handle missing client - show user-friendly message or disable features
 *   return;
 * }
 * // Use supabase client
 */
function getSupabaseClient() {
  try {
    // Method 1: Direct WeWeb Supabase plugin access (primary method)
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins && wwLib.wwPlugins.supabase) {
      const supabasePlugin = wwLib.wwPlugins.supabase;

      if (supabasePlugin.instance) {
        return supabasePlugin.instance;
      }

      if (supabasePlugin.callPostgresFunction) {
        return supabasePlugin;
      }
    }

    // Method 2: Alternative plugin names
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins) {
      const possiblePaths = ['plugin-supabase', 'Supabase', 'supabasePlugin'];
      for (const path of possiblePaths) {
        if (wwLib.wwPlugins[path] && wwLib.wwPlugins[path].instance) {
          return wwLib.wwPlugins[path].instance;
        }
      }
    }

    // Method 3: WeWeb $store access
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

    // All methods failed - return null (component will work without Supabase)
    return null;

  } catch (error) {
    return null;
  }
}

/**
 * Test Supabase connection with GIS schema
 *
 * This function does NOT throw - it returns an error object for graceful handling.
 * It attempts to query the gis.countries table to verify connectivity.
 *
 * @returns {Promise<{success: boolean, error?: string, dataCount?: number}>} Connection test result
 *          - success: true with dataCount if connection works
 *          - success: false with error message if connection fails
 *
 * Possible error conditions (returned, not thrown):
 * - 'Supabase client not available': Plugin not configured in WeWeb
 * - Schema/table errors: GIS schema not set up correctly
 * - Permission errors: RLS policies blocking access
 * - Network errors: Connection issues
 *
 * @example
 * const result = await testSupabaseConnection();
 * if (!result.success) {
 *   console.error('Connection failed:', result.error);
 *   return;
 * }
 * console.log('Connected! Found', result.dataCount, 'records');
 */
export async function testSupabaseConnection() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Supabase client not available' };
    }

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
    return { success: false, error: error.message };
  }
}

/**
 * Boundary API functions for GIS schema
 */
export const boundaryAPI = {
  /**
   * Get countries from GIS schema within bounds
   * Uses retry logic for network resilience
   * @param {Object} bounds - Leaflet bounds object
   * @param {number} zoomLevel - Current zoom level
   * @param {Object} options - Optional configuration
   * @param {Function} options.onRetry - Callback for retry events
   * @returns {Promise<Array>} Array of country boundary objects
   * @throws {Error} When Supabase client is unavailable or query fails after retries
   */
  async getCountriesInBounds(bounds, zoomLevel = 1, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      const error = new Error('Supabase client not available - country boundaries will not load');
      error.type = GISErrorTypes.NO_CLIENT;
      throw error;
    }

    // Validate bounds
    const boundsValidation = validateBounds(bounds);
    if (!boundsValidation.valid) {
      const error = new Error(boundsValidation.error);
      error.type = GISErrorTypes.INVALID_COORDINATES;
      throw error;
    }

    // Wrap the API call with retry logic
    return withRetry(async () => {
      let lastError = null;

      // Try spatial RPC function with bounds filtering
      if (typeof supabase.rpc === 'function') {
        try {
          const { data, error } = await supabase
            .rpc('get_simplified_boundaries_in_bbox', {
              boundary_type: 'countries',
              zoom_level: zoomLevel,
              bbox_west: boundsValidation.west,
              bbox_south: boundsValidation.south,
              bbox_east: boundsValidation.east,
              bbox_north: boundsValidation.north,
              country_filter: null
            });

          if (error) {
            lastError = error;
            apiLogger.debug('Spatial RPC failed, trying fallback:', error.message);
          } else if (data && data.length > 0) {
            return data.map(country => ({
              id: country.id,
              name: country.name,
              iso_a2: country.properties?.iso_a2 || null,
              iso_a3: country.properties?.iso_a3 || null,
              geometry_geojson: country.geometry_geojson,
              properties: country.properties
            }));
          }
        } catch (rpcError) {
          lastError = rpcError;
          apiLogger.debug('Spatial RPC exception, trying fallback:', rpcError.message);
        }
      }

      // Fallback: RPC function without spatial filtering
      const { data, error } = await supabase
        .schema('gis')
        .rpc('get_countries_as_geojson', {});

      if (error) {
        throw lastError || error;
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
    }, {
      maxRetries: RETRY_CONFIG.MAX_RETRIES,
      onRetry: options.onRetry
    });
  },

  /**
   * Get states/provinces from GIS schema within bounds
   * Uses retry logic for network resilience
   * @param {Object} bounds - Leaflet bounds object
   * @param {number} zoomLevel - Current zoom level
   * @param {string|null} countryFilter - Optional country code filter
   * @param {Object} options - Optional configuration
   * @param {Function} options.onRetry - Callback for retry events
   * @returns {Promise<Array>} Array of state boundary objects
   * @throws {Error} When Supabase client is unavailable or query fails after retries
   */
  async getStatesInBounds(bounds, zoomLevel = 6, countryFilter = null, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      const error = new Error('Supabase client not available - state boundaries will not load');
      error.type = GISErrorTypes.NO_CLIENT;
      throw error;
    }

    // Validate bounds
    const boundsValidation = validateBounds(bounds);
    if (!boundsValidation.valid) {
      const error = new Error(boundsValidation.error);
      error.type = GISErrorTypes.INVALID_COORDINATES;
      throw error;
    }

    // Wrap the API call with retry logic
    return withRetry(async () => {
      let lastError = null;

      // Try spatial RPC function with bounds filtering
      if (typeof supabase.rpc === 'function') {
        try {
          const { data, error } = await supabase
            .rpc('get_simplified_boundaries_in_bbox', {
              boundary_type: 'states',
              zoom_level: zoomLevel,
              bbox_west: boundsValidation.west,
              bbox_south: boundsValidation.south,
              bbox_east: boundsValidation.east,
              bbox_north: boundsValidation.north,
              country_filter: countryFilter
            });

          if (error) {
            lastError = error;
            apiLogger.debug('Spatial RPC for states failed, trying fallback:', error.message);
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
          }
        } catch (rpcError) {
          lastError = rpcError;
          apiLogger.debug('Spatial RPC for states exception, trying fallback:', rpcError.message);
        }
      }

      // Fallback: RPC function without spatial filtering
      const { data, error } = await supabase
        .schema('gis')
        .rpc('get_states_as_geojson', {
          country_code: countryFilter
        });

      if (error) {
        throw lastError || error;
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
    }, {
      maxRetries: RETRY_CONFIG.MAX_RETRIES,
      onRetry: options.onRetry
    });
  },

  /**
   * Convert Supabase boundary data to GeoJSON for Leaflet
   * @param {Array} boundaries - Array of boundary objects
   * @returns {Object} GeoJSON FeatureCollection
   */
  toGeoJSON(boundaries) {
    return {
      type: 'FeatureCollection',
      features: (boundaries || []).map(boundary => {
        try {
          let geometry;
          if (typeof boundary.geometry_geojson === 'string') {
            geometry = JSON.parse(boundary.geometry_geojson);
          } else if (typeof boundary.geometry_geojson === 'object') {
            geometry = boundary.geometry_geojson;
          } else {
            return null;
          }

          return {
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
        } catch (error) {
          return null;
        }
      }).filter(f => f !== null)
    };
  }
};

/**
 * Cache for boundary data to improve performance
 */
export class BoundaryCache {
  constructor(maxAge = CACHE_LIMITS.BOUNDARY_CACHE_AGE_MS) {
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

/**
 * Validate GIS schema setup in Supabase
 * Checks if required tables and functions exist
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateGISSetup() {
  const errors = [];
  const warnings = [];

  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      errors.push('Supabase client not available - ensure the Supabase plugin is configured in WeWeb');
      return { valid: false, errors, warnings };
    }

    // Check if gis schema exists by trying to query countries
    try {
      const { data: countryTest, error: countryError } = await supabase
        .schema('gis')
        .from('countries')
        .select('id')
        .limit(1);

      if (countryError) {
        if (countryError.message.includes('does not exist') || countryError.code === '42P01') {
          errors.push('GIS schema or countries table not found. Please run the SQL migrations.');
        } else if (countryError.message.includes('permission denied')) {
          errors.push('Permission denied accessing gis.countries. Check RLS policies.');
        } else {
          errors.push(`Countries table error: ${countryError.message}`);
        }
      } else if (!countryTest || countryTest.length === 0) {
        warnings.push('Countries table is empty. Load geographic data to enable boundary features.');
      }
    } catch (e) {
      errors.push(`Failed to test countries table: ${e.message}`);
    }

    // Check required RPC functions
    const requiredFunctions = [
      { name: 'find_country_at_point', params: { point_lat: 0, point_lng: 0 } },
      { name: 'find_state_at_point', params: { point_lat: 0, point_lng: 0 } }
    ];

    for (const fn of requiredFunctions) {
      try {
        const { error } = await supabase.schema('gis').rpc(fn.name, fn.params);

        if (error) {
          if (error.message.includes('does not exist')) {
            errors.push(`RPC function gis.${fn.name} not found. Run migration 002_create_rpc_functions.sql`);
          }
          // Other errors are OK (empty results, etc.)
        }
      } catch (e) {
        // Function call failed but that's OK for validation
      }
    }

    // Check optional MVT functions (for vector tile support)
    const mvtFunctions = [
      { name: 'get_country_mvt_tile', params: { z: 0, x: 0, y: 0 } },
      { name: 'get_states_mvt_tile', params: { z: 0, x: 0, y: 0 } },
      { name: 'tile_has_data', params: { table_name: 'countries', z: 0, x: 0, y: 0 } }
    ];

    for (const fn of mvtFunctions) {
      try {
        const { error } = await supabase.schema('gis').rpc(fn.name, fn.params);

        if (error) {
          if (error.message.includes('does not exist')) {
            warnings.push(`MVT function gis.${fn.name} not found. Run migration 003_create_mvt_functions.sql for vector tile support.`);
          }
        }
      } catch (e) {
        // MVT functions are optional, just add a warning
        warnings.push(`Could not verify MVT function gis.${fn.name}: ${e.message}`);
      }
    }

    // Check if simplified geometry columns exist
    try {
      const { data: simplifiedTest, error: simplifiedError } = await supabase
        .schema('gis')
        .from('countries')
        .select('geometry_simplified_low')
        .limit(1);

      if (simplifiedError && simplifiedError.message.includes('column')) {
        warnings.push('Pre-simplified geometry columns not found. Run migration 005_add_simplified_geometry.sql for better performance.');
      }
    } catch (e) {
      // Non-critical, just log
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };

  } catch (error) {
    errors.push(`GIS validation failed: ${error.message}`);
    return { valid: false, errors, warnings };
  }
}

/**
 * Error types for structured error handling
 */
export const GISErrorTypes = {
  NO_CLIENT: 'NO_CLIENT',
  SCHEMA_NOT_FOUND: 'SCHEMA_NOT_FOUND',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  FUNCTION_NOT_FOUND: 'FUNCTION_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_COORDINATES: 'INVALID_COORDINATES',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Parse Supabase error into structured format
 * @param {Error|Object} error - The error to parse
 * @returns {{type: string, message: string, recoverable: boolean}}
 */
export function parseGISError(error) {
  if (!error) {
    return { type: GISErrorTypes.UNKNOWN, message: 'Unknown error', recoverable: false };
  }

  const message = error.message || String(error);

  if (message.includes('does not exist') && message.includes('schema')) {
    return {
      type: GISErrorTypes.SCHEMA_NOT_FOUND,
      message: 'GIS schema not found. Run the SQL migrations to set up the database.',
      recoverable: false
    };
  }

  if (message.includes('does not exist') && message.includes('relation')) {
    return {
      type: GISErrorTypes.TABLE_NOT_FOUND,
      message: 'Required table not found. Check that all migrations have been applied.',
      recoverable: false
    };
  }

  if (message.includes('does not exist') && message.includes('function')) {
    return {
      type: GISErrorTypes.FUNCTION_NOT_FOUND,
      message: 'Required database function not found. Run migration 002_create_rpc_functions.sql',
      recoverable: false
    };
  }

  if (message.includes('permission denied')) {
    return {
      type: GISErrorTypes.PERMISSION_DENIED,
      message: 'Permission denied. Check RLS policies allow public read access.',
      recoverable: false
    };
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
    return {
      type: GISErrorTypes.NETWORK_ERROR,
      message: 'Network error connecting to database. Check your internet connection.',
      recoverable: true
    };
  }

  return {
    type: GISErrorTypes.UNKNOWN,
    message: message,
    recoverable: true
  };
}

// Export the getSupabaseClient function
export { getSupabaseClient };
