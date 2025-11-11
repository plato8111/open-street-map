// Vector Tile Client for Supabase MVT integration
import { getSupabaseClient } from './supabaseClient.js';

/**
 * Vector Tile API for efficient boundary rendering
 *
 * NOTE: Currently only init() is used. The component uses
 * get_simplified_boundaries_in_bbox RPC function instead
 * of actual MVT tiles. This class is kept minimal.
 */
export class VectorTileClient {
  constructor() {
    this.supabase = null;
    this.cache = new Map();
    this.maxCacheSize = 500;
  }

  /**
   * Initialize the Supabase client
   */
  async init() {
    try {
      this.supabase = getSupabaseClient();
      return true;
    } catch (error) {
      console.error('Failed to initialize vector tile client:', error);
      return false;
    }
  }

  /**
   * Clear tile cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance
export const vectorTileClient = new VectorTileClient();

export default vectorTileClient;
