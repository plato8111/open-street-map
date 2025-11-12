// Vector Tile Client for Supabase MVT integration
import { getSupabaseClient } from './supabaseClient.js';
import { debug } from './debugUtils.js';

/**
 * Vector Tile API for efficient boundary rendering
 */
export class VectorTileClient {
  constructor() {
    this.supabase = null;
    this.cache = new Map();
    this.maxCacheSize = 500; // Limit cache size
  }

  /**
   * Initialize the Supabase client
   */
  async init() {
    try {
      this.supabase = getSupabaseClient();
      return true;
    } catch (error) {
      debug.error('Failed to initialize vector tile client:', error);
      return false;
    }
  }

  /**
   * Generate cache key for tiles
   */
  getCacheKey(z, x, y, type = 'auto') {
    return `${type}_${z}_${x}_${y}`;
  }

  /**
   * Get MVT tile from Supabase GIS schema
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
          debug.error('Failed to initialize Supabase client for vector tiles');
          return null;
        }
      }

      // Call MVT functions from GIS schema
      let result;
      if (typeof this.supabase.rpc === 'function') {
        // Determine which GIS schema function to use based on boundary type and zoom
        let functionName;
        if (boundaryType === 'countries' || (boundaryType === 'auto' && z <= 4)) {
          functionName = 'get_country_mvt_tile';
        } else if (boundaryType === 'states' || (boundaryType === 'auto' && z > 4)) {
          functionName = 'get_states_mvt_tile';
        } else {
          functionName = 'get_country_mvt_tile'; // fallback
        }

        // Call RPC function in GIS schema using .schema() method
        const { data, error } = await this.supabase
          .schema('gis')
          .rpc(functionName, {
            z: z,
            x: x,
            y: y
          });

        if (error) {
          debug.error(`Error fetching MVT tile from gis.${functionName}:`, error);
          return null;
        }
        result = data;
      } else {
        debug.error('No RPC method available on Supabase client');
        return null;
      }

      // Only cache successful results
      if (result) {
        this.setCacheItem(cacheKey, result);
      }

      return result;
    } catch (err) {
      debug.error('Vector tile fetch error:', err);
      return null;
    }
  }

  /**
   * Check if tile has data (for optimization) - uses GIS schema
   */
  async tileHasData(z, x, y, boundaryType = 'auto') {
    try {
      if (!this.supabase) {
        await this.init();
      }

      // Determine table name based on boundary type and zoom
      let tableName;
      if (boundaryType === 'countries' || (boundaryType === 'auto' && z <= 4)) {
        tableName = 'countries';
      } else {
        tableName = 'states';
      }

      const { data, error } = await this.supabase
        .schema('gis')
        .rpc('tile_has_data', {
          table_name: tableName,
          z: z,
          x: x,
          y: y
        });

      if (error) {
        debug.error('Error checking tile data in gis schema:', error);
        return false;
      }

      return data === true;
    } catch (err) {
      debug.error('Tile data check error:', err);
      return false;
    }
  }

  /**
   * Set cache item with size limit
   */
  setCacheItem(key, data) {
    // Remove oldest items if cache is full
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
   * Get tile URL for Leaflet.VectorGrid
   * This creates a custom protocol handler for MVT tiles
   */
  getTileUrlTemplate(boundaryType = 'auto') {
    return `mvt://${boundaryType}/{z}/{x}/{y}`;
  }

  /**
   * Create a custom tile loading function for Leaflet
   */
  createTileLoadFunction(boundaryType = 'auto') {
    return async (coords, done) => {
      const { x, y, z } = coords;

      try {
        const tileData = await this.getTile(z, x, y, boundaryType);

        if (tileData) {
          // Convert the tile data to proper format for Leaflet
          done(null, tileData);
        } else {
          done(null, null); // No data for this tile
        }
      } catch (error) {
        debug.error('Tile load error:', error);
        done(error, null);
      }
    };
  }

  /**
   * Preload tiles for a given bounds and zoom level
   */
  async preloadTiles(bounds, zoomLevel, boundaryType = 'auto') {
    const tiles = this.getTileCoordinates(bounds, zoomLevel);
    const promises = tiles.map(({x, y, z}) =>
      this.getTile(z, x, y, boundaryType)
    );

    try {
      await Promise.all(promises);
      debug.log(`Preloaded ${tiles.length} tiles for zoom ${zoomLevel}`);
    } catch (error) {
      debug.error('Tile preload error:', error);
    }
  }

  /**
   * Calculate tile coordinates for given bounds and zoom
   */
  getTileCoordinates(bounds, zoom) {
    const tiles = [];

    // Convert lat/lng bounds to tile coordinates
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
   */
  latLngToTile(lat, lng, zoom) {
    const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

    return { x, y };
  }

  /**
   * Get cache statistics
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

/**
 * Protocol handler for MVT tiles
 * This allows Leaflet.VectorGrid to load tiles via our custom protocol
 */
export function setupMVTProtocol(L) {
  // Only setup once
  if (L._mvtProtocolSetup) {
    return;
  }
  L._mvtProtocolSetup = true;

  // Store original method if not already stored
  if (typeof L.TileLayer.prototype._originalCreateTile === 'undefined') {
    L.TileLayer.prototype._originalCreateTile = L.TileLayer.prototype.createTile;
  }

  debug.log('📦 Setting up MVT protocol for Leaflet');
}

export default vectorTileClient;