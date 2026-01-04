// Vector Tile Client for Supabase MVT integration
import { getSupabaseClient } from './supabaseClient.js';
import { CACHE_LIMITS, ZOOM_THRESHOLDS } from '../config/constants.js';
import { tileLogger } from '../config/debug.js';

/**
 * Vector Tile API for efficient boundary rendering
 */
export class VectorTileClient {
  constructor() {
    this.supabase = null;
    this.cache = new Map();
    this.maxCacheSize = CACHE_LIMITS.VECTOR_TILES;
  }

  /**
   * Initialize the Supabase client
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    try {
      this.supabase = getSupabaseClient();
      if (!this.supabase) {
        tileLogger.warn('Supabase client not available - MVT features disabled');
      }
      return !!this.supabase;
    } catch (error) {
      tileLogger.error('Failed to initialize:', error.message);
      return false;
    }
  }

  /**
   * Generate cache key for tiles
   * @param {number} z - Zoom level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @param {string} type - Boundary type
   * @returns {string} Cache key
   */
  getCacheKey(z, x, y, type = 'auto') {
    return `${type}_${z}_${x}_${y}`;
  }

  /**
   * Get MVT tile from Supabase GIS schema
   * @param {number} z - Zoom level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @param {string} boundaryType - Type of boundary ('auto', 'countries', 'states')
   * @returns {Promise<Object|null>} Tile data or null
   */
  async getTile(z, x, y, boundaryType = 'auto') {
    const cacheKey = this.getCacheKey(z, x, y, boundaryType);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      if (!this.supabase) {
        const initialized = await this.init();
        if (!initialized) {
          return null;
        }
      }

      // Call MVT functions from GIS schema
      if (typeof this.supabase.rpc === 'function') {
        // Determine which GIS schema function to use based on zoom level threshold
        let functionName;
        if (boundaryType === 'countries' || (boundaryType === 'auto' && z <= ZOOM_THRESHOLDS.COUNTRY_TO_STATE)) {
          functionName = 'get_country_mvt_tile';
        } else if (boundaryType === 'states' || (boundaryType === 'auto' && z > ZOOM_THRESHOLDS.COUNTRY_TO_STATE)) {
          functionName = 'get_states_mvt_tile';
        } else {
          functionName = 'get_country_mvt_tile';
        }

        const { data, error } = await this.supabase
          .schema('gis')
          .rpc(functionName, { z, x, y });

        if (error) {
          tileLogger.warn(`RPC error for ${functionName}:`, error.message);
          return null;
        }

        if (data) {
          this.setCacheItem(cacheKey, data);
        }

        return data;
      }

      tileLogger.debug('Supabase client does not support RPC');
      return null;
    } catch (err) {
      tileLogger.error(`Failed to get tile z=${z} x=${x} y=${y}:`, err.message);
      return null;
    }
  }

  /**
   * Check if tile has data (for optimization)
   * @param {number} z - Zoom level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @param {string} boundaryType - Type of boundary
   * @returns {Promise<boolean>} Whether tile has data
   */
  async tileHasData(z, x, y, boundaryType = 'auto') {
    try {
      if (!this.supabase) {
        await this.init();
      }

      const tableName = (boundaryType === 'countries' || (boundaryType === 'auto' && z <= ZOOM_THRESHOLDS.COUNTRY_TO_STATE))
        ? 'countries'
        : 'states';

      const { data, error } = await this.supabase
        .schema('gis')
        .rpc('tile_has_data', { table_name: tableName, z, x, y });

      if (error) {
        tileLogger.warn(`tile_has_data check failed for ${tableName}:`, error.message);
        return false;
      }

      return data === true;
    } catch (err) {
      tileLogger.error(`Exception checking tile data z=${z} x=${x} y=${y}:`, err.message);
      return false;
    }
  }

  /**
   * Set cache item with size limit
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   */
  setCacheItem(key, data) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, data);
  }

  /**
   * Clear tile cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get tile URL template for Leaflet.VectorGrid
   * @param {string} boundaryType - Type of boundary
   * @returns {string} URL template
   */
  getTileUrlTemplate(boundaryType = 'auto') {
    return `mvt://${boundaryType}/{z}/{x}/{y}`;
  }

  /**
   * Create a custom tile loading function for Leaflet
   * @param {string} boundaryType - Type of boundary
   * @returns {Function} Tile load function
   */
  createTileLoadFunction(boundaryType = 'auto') {
    return async (coords, done) => {
      const { x, y, z } = coords;
      try {
        const tileData = await this.getTile(z, x, y, boundaryType);
        done(null, tileData);
      } catch (error) {
        done(error, null);
      }
    };
  }

  /**
   * Preload tiles for a given bounds and zoom level
   * @param {Object} bounds - Leaflet bounds
   * @param {number} zoomLevel - Zoom level
   * @param {string} boundaryType - Type of boundary
   */
  async preloadTiles(bounds, zoomLevel, boundaryType = 'auto') {
    const tiles = this.getTileCoordinates(bounds, zoomLevel);
    const promises = tiles.map(({ x, y, z }) =>
      this.getTile(z, x, y, boundaryType)
    );

    try {
      await Promise.all(promises);
    } catch (error) {
      // Preloading is non-critical, just log for debugging
      tileLogger.debug('Tile preloading had errors (non-fatal):', error.message);
    }
  }

  /**
   * Calculate tile coordinates for given bounds and zoom
   * @param {Object} bounds - Leaflet bounds
   * @param {number} zoom - Zoom level
   * @returns {Array} Array of tile coordinates
   */
  getTileCoordinates(bounds, zoom) {
    const tiles = [];
    const minTile = this.latLngToTile(bounds.getSouth(), bounds.getWest(), zoom);
    const maxTile = this.latLngToTile(bounds.getNorth(), bounds.getEast(), zoom);

    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        tiles.push({ x, y, z: zoom });
      }
    }

    return tiles;
  }

  /**
   * Convert lat/lng to tile coordinates
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} zoom - Zoom level
   * @returns {{x: number, y: number}} Tile coordinates
   */
  latLngToTile(lat, lng, zoom) {
    const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor(
      (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
    );
    return { x, y };
  }

  /**
   * Get cache statistics
   * @returns {{size: number, maxSize: number, keys: Array}} Cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
export const vectorTileClient = new VectorTileClient();

export default vectorTileClient;
