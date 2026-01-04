/**
 * API clients barrel export
 *
 * This module provides a centralized export point for all API-related
 * functionality including Supabase GIS integration and vector tile support.
 *
 * @module api
 */

// =============================================================================
// SUPABASE CLIENT EXPORTS
// =============================================================================

/**
 * Get the WeWeb Supabase plugin client instance.
 * Tries multiple methods to access Supabase through WeWeb's plugin system.
 * @see supabaseClient.js
 */
export { getSupabaseClient } from './supabaseClient.js';

/**
 * Validate that the GIS schema is properly set up in Supabase.
 * Checks for required tables, functions, and permissions.
 * @see supabaseClient.js
 */
export { validateGISSetup } from './supabaseClient.js';

/**
 * Parse Supabase/GIS errors into a structured format with error types.
 * Useful for determining if errors are recoverable.
 * @see supabaseClient.js
 */
export { parseGISError } from './supabaseClient.js';

/**
 * Enumeration of GIS error types for structured error handling.
 * Includes: NO_CLIENT, SCHEMA_NOT_FOUND, TABLE_NOT_FOUND,
 * FUNCTION_NOT_FOUND, PERMISSION_DENIED, INVALID_COORDINATES,
 * NETWORK_ERROR, UNKNOWN
 * @see supabaseClient.js
 */
export { GISErrorTypes } from './supabaseClient.js';

/**
 * API object containing methods for fetching boundary data from GIS schema.
 * Includes: getCountriesInBounds, getStatesInBounds, toGeoJSON
 * @see supabaseClient.js
 */
export { boundaryAPI } from './supabaseClient.js';

/**
 * Cache class for storing boundary data with configurable TTL.
 * @see supabaseClient.js
 */
export { BoundaryCache } from './supabaseClient.js';

/**
 * Default boundary cache instance with standard TTL.
 * @see supabaseClient.js
 */
export { boundaryCache } from './supabaseClient.js';

/**
 * Validate latitude and longitude coordinate values.
 * Returns { valid: boolean, lat?: number, lng?: number, error?: string }
 * @see supabaseClient.js
 */
export { validateCoordinates } from './supabaseClient.js';

/**
 * Validate Leaflet bounds objects.
 * Returns { valid: boolean, south?: number, north?: number, west?: number, east?: number, error?: string }
 * @see supabaseClient.js
 */
export { validateBounds } from './supabaseClient.js';

/**
 * Test the Supabase connection to the GIS schema.
 * Returns { success: boolean, error?: string, dataCount?: number }
 * @see supabaseClient.js
 */
export { testSupabaseConnection } from './supabaseClient.js';

// =============================================================================
// VECTOR TILE CLIENT EXPORTS
// =============================================================================

/**
 * Vector tile client class for MVT-based boundary rendering.
 * Provides efficient tile-based boundary loading with caching.
 * @see vectorTileClient.js
 */
export { VectorTileClient } from './vectorTileClient.js';

/**
 * Singleton vector tile client instance.
 * Pre-configured for use with Leaflet maps.
 * @see vectorTileClient.js
 */
export { vectorTileClient } from './vectorTileClient.js';
