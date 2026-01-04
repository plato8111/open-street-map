/**
 * Composable for request deduplication
 * Prevents duplicate API calls when rapidly panning/zooming the map
 */

import { ref, onBeforeUnmount } from 'vue';
import { CACHE_LIMITS } from '../config/constants.js';

/**
 * Generate a cache key from parameters
 * @param {string} prefix - Key prefix (e.g., 'countries', 'states')
 * @param {Object} params - Request parameters
 * @returns {string} Cache key
 */
export function generateCacheKey(prefix, params = {}) {
  /**
   * CACHE KEY GENERATION ALGORITHM:
   *
   * Numbers are rounded to 4 decimal places (~11 meters precision) for these reasons:
   * 1. Map panning/zooming causes tiny floating-point variations in coordinates
   *    (e.g., 40.71279999999 vs 40.71280000001) that would create cache misses
   * 2. 4 decimals provides ~11m precision, sufficient for boundary queries where
   *    boundaries span kilometers, while preventing redundant API calls
   * 3. Alphabetical sorting ensures "lat:40,lng:-74" and "lng:-74,lat:40" generate
   *    the same key, making the cache key deterministic regardless of param order
   *
   * Example: Two rapid pan events with coords 40.712799 and 40.712801 both
   * round to 40.7128, hitting the same cache entry instead of making duplicate requests.
   */
  const paramStr = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      if (typeof v === 'number') {
        // Round coordinates to reduce cache misses from tiny differences
        return `${k}:${v.toFixed(4)}`;
      }
      return `${k}:${String(v)}`;
    })
    .join('_');

  return `${prefix}_${paramStr}`;
}

/**
 * Composable for managing request deduplication
 * @param {Object} options - Configuration options
 * @param {number} [options.maxCacheAge=10000] - Maximum age of cached results in ms
 * @param {number} [options.maxPendingRequests=10] - Maximum number of pending requests
 * @param {number} [options.debounceMs=150] - Default debounce delay in ms
 * @returns {Object} Deduplication state and methods
 *
 * @example
 * // Initialize the composable in a Vue component setup
 * import { useRequestDeduplication, generateCacheKey } from './composables/useRequestDeduplication';
 *
 * const dedupe = useRequestDeduplication({
 *   maxCacheAge: 30000,  // Cache results for 30 seconds
 *   debounceMs: 200      // Wait 200ms before executing
 * });
 *
 * // Generate a cache key from request parameters
 * const cacheKey = generateCacheKey('countries', {
 *   south: 40.7128,
 *   west: -74.0060,
 *   north: 40.8128,
 *   east: -73.9060,
 *   zoom: 5
 * });
 *
 * // Execute a request with automatic deduplication
 * // If the same request is already in-flight, the existing Promise is returned
 * const countries = await dedupe.executeRequest(cacheKey, async () => {
 *   return await api.fetchCountries(bounds);
 * });
 *
 * // Execute with debouncing (useful for map pan/zoom events)
 * // Rapid calls are coalesced - only the last one executes
 * try {
 *   const states = await dedupe.executeDebounced('states-query', async () => {
 *     return await api.fetchStates(bounds);
 *   }, 300); // 300ms debounce
 * } catch (err) {
 *   if (err.message === 'Debounced') {
 *     // This call was superseded by a newer one - safe to ignore
 *   }
 * }
 *
 * // Check request/cache status
 * console.log(dedupe.isPending(cacheKey));      // true if request in-flight
 * console.log(dedupe.hasCachedResult(cacheKey)); // true if valid cache exists
 * console.log(dedupe.getCachedResult(cacheKey)); // Returns cached data or null
 * console.log(dedupe.getStats());               // { pendingCount, cachedCount, debouncedCount }
 *
 * // Cleanup when done
 * dedupe.cancelAll();    // Cancel pending debounced requests
 * dedupe.clearCache();   // Clear the result cache
 */
export function useRequestDeduplication(options = {}) {
  const {
    maxCacheAge = CACHE_LIMITS.DEDUPLICATION_CACHE_AGE_MS,
    maxPendingRequests = CACHE_LIMITS.MAX_PENDING_REQUESTS,
    debounceMs = CACHE_LIMITS.DEBOUNCE_MS
  } = options;

  // Pending requests map: key -> Promise
  const pendingRequests = ref(new Map());

  // Completed requests cache: key -> { data, timestamp }
  const completedCache = ref(new Map());

  // Debounce timers
  const debounceTimers = ref(new Map());

  /**
   * Check if a request is currently pending
   * @param {string} key - Request key
   * @returns {boolean}
   */
  const isPending = (key) => {
    return pendingRequests.value.has(key);
  };

  /**
   * Check if a cached result is still valid
   * @param {string} key - Request key
   * @returns {boolean}
   */
  const hasCachedResult = (key) => {
    const cached = completedCache.value.get(key);
    if (!cached) return false;

    const age = Date.now() - cached.timestamp;
    if (age > maxCacheAge) {
      completedCache.value.delete(key);
      return false;
    }

    return true;
  };

  /**
   * Get cached result if valid
   * @param {string} key - Request key
   * @returns {any|null} Cached data or null
   */
  const getCachedResult = (key) => {
    if (hasCachedResult(key)) {
      return completedCache.value.get(key).data;
    }
    return null;
  };

  /**
   * Execute a request with deduplication
   * If the same request is already pending, returns the existing promise
   * If a valid cached result exists, returns it immediately
   *
   * @param {string} key - Unique request key
   * @param {Function} requestFn - Async function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Request result
   */
  const executeRequest = async (key, requestFn, execOptions = {}) => {
    /**
     * REQUEST DEDUPLICATION ALGORITHM - Concurrent Identical Requests:
     *
     * When multiple callers request the same data simultaneously (e.g., two map
     * components loading boundaries at the same zoom level), this function ensures
     * only ONE actual API call is made:
     *
     * Timeline example with 3 concurrent calls for key "countries_zoom:5":
     *   T0: Call A arrives -> No pending request -> Creates Promise P, stores in map
     *   T1: Call B arrives -> Finds Promise P -> Returns same Promise P (no new request)
     *   T2: Call C arrives -> Finds Promise P -> Returns same Promise P (no new request)
     *   T3: Promise P resolves -> All 3 callers receive the same data
     *   T4: Promise P removed from pending map (in finally block)
     *   T5: Call D arrives -> No pending request -> Creates new Promise Q
     *
     * The pendingRequests Map acts as a "request coalescing" mechanism:
     * - Key: Unique request identifier (from generateCacheKey)
     * - Value: The Promise for the in-flight request
     *
     * This prevents the "thundering herd" problem where N components would
     * otherwise make N identical requests to the server.
     */
    const { skipCache = false, cacheResult = true } = execOptions;

    // Check cache first (unless skipped)
    if (!skipCache) {
      const cached = getCachedResult(key);
      if (cached !== null) {
        return cached;
      }
    }

    // If request is already pending, return existing promise
    if (pendingRequests.value.has(key)) {
      return pendingRequests.value.get(key);
    }

    // Clean up old pending requests if too many
    if (pendingRequests.value.size >= maxPendingRequests) {
      const oldestKey = pendingRequests.value.keys().next().value;
      pendingRequests.value.delete(oldestKey);
    }

    // Create new request promise
    const requestPromise = (async () => {
      try {
        const result = await requestFn();

        // Cache the result
        if (cacheResult && result !== null && result !== undefined) {
          completedCache.value.set(key, {
            data: result,
            timestamp: Date.now()
          });
        }

        return result;
      } finally {
        // Remove from pending after completion
        pendingRequests.value.delete(key);
      }
    })();

    pendingRequests.value.set(key, requestPromise);
    return requestPromise;
  };

  /**
   * Execute a request with debouncing
   * Delays execution and cancels previous pending calls with the same key
   *
   * @param {string} key - Unique request key
   * @param {Function} requestFn - Async function to execute
   * @param {number} delay - Debounce delay in ms (default: debounceMs from options)
   * @returns {Promise<any>} Request result
   */
  const executeDebounced = (key, requestFn, delay = debounceMs) => {
    /**
     * DEBOUNCE PROMISE WRAPPER PATTERN:
     *
     * This wraps debouncing in a Promise to provide a clean async/await interface.
     * The pattern works as follows:
     *
     * 1. Returns a new Promise that the caller can await
     * 2. Stores the resolve/reject callbacks alongside the timer ID in debounceTimers
     * 3. If a new call arrives with the same key before the timer fires:
     *    - The old timer is cleared (canceling the pending request)
     *    - The old Promise is rejected with 'Debounced' error (caller can catch this)
     *    - A new timer/Promise replaces it
     * 4. When the timer finally fires (no new calls for `delay` ms):
     *    - The request executes via executeRequest (which handles deduplication)
     *    - The Promise resolves/rejects based on the request result
     *
     * EDGE CASE - Concurrent identical requests:
     * - First call: Creates timer A, stores Promise A
     * - Second call (before timer A fires): Rejects Promise A, creates timer B
     * - Third call (before timer B fires): Rejects Promise B, creates timer C
     * - Timer C fires: Only this request actually executes
     * - Callers awaiting Promise A or B receive 'Debounced' error
     *
     * This ensures rapid successive calls (e.g., during map panning) result in
     * only ONE actual API request after the user stops interacting.
     */
    return new Promise((resolve, reject) => {
      // Cancel existing timer for this key
      if (debounceTimers.value.has(key)) {
        clearTimeout(debounceTimers.value.get(key).timerId);
        debounceTimers.value.get(key).reject(new Error('Debounced'));
      }

      // Set new timer
      const timerId = setTimeout(async () => {
        debounceTimers.value.delete(key);
        try {
          const result = await executeRequest(key, requestFn);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);

      debounceTimers.value.set(key, { timerId, resolve, reject });
    });
  };

  /**
   * Cancel a pending debounced request
   * @param {string} key - Request key
   */
  const cancelDebounced = (key) => {
    if (debounceTimers.value.has(key)) {
      clearTimeout(debounceTimers.value.get(key).timerId);
      debounceTimers.value.delete(key);
    }
  };

  /**
   * Clear all cached results
   */
  const clearCache = () => {
    completedCache.value.clear();
  };

  /**
   * Clear expired cache entries
   */
  const clearExpiredCache = () => {
    const now = Date.now();
    for (const [key, value] of completedCache.value.entries()) {
      if (now - value.timestamp > maxCacheAge) {
        completedCache.value.delete(key);
      }
    }
  };

  /**
   * Cancel all pending requests
   */
  const cancelAll = () => {
    // Cancel debounced timers
    for (const { timerId, reject } of debounceTimers.value.values()) {
      clearTimeout(timerId);
      reject(new Error('Cancelled'));
    }
    debounceTimers.value.clear();

    // Note: We can't actually cancel pending fetch requests,
    // but we clear the map so new requests aren't blocked
    pendingRequests.value.clear();
  };

  /**
   * Get current statistics
   * @returns {Object} Stats object
   */
  const getStats = () => ({
    pendingCount: pendingRequests.value.size,
    cachedCount: completedCache.value.size,
    debouncedCount: debounceTimers.value.size
  });

  // Cleanup on unmount
  onBeforeUnmount(() => {
    cancelAll();
    clearCache();
  });

  return {
    // State
    pendingRequests,
    completedCache,

    // Methods
    executeRequest,
    executeDebounced,
    cancelDebounced,
    cancelAll,
    clearCache,
    clearExpiredCache,

    // Utilities
    generateCacheKey,
    isPending,
    hasCachedResult,
    getCachedResult,
    getStats
  };
}

export default useRequestDeduplication;
