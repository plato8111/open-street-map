/**
 * Composable for retry logic with exponential backoff
 * Provides utilities for retrying failed API calls
 */

import { ref } from 'vue';
import { parseGISError } from '../api/supabaseClient.js';
import { RETRY_CONFIG } from '../config/constants.js';

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG = {
  maxRetries: RETRY_CONFIG.MAX_RETRIES,
  baseDelay: RETRY_CONFIG.BASE_DELAY_MS,
  maxDelay: RETRY_CONFIG.MAX_DELAY_MS,
  backoffMultiplier: 2,
  retryableErrors: ['NETWORK_ERROR', 'UNKNOWN']
};

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @param {number} multiplier - Backoff multiplier
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoff(attempt, baseDelay = RETRY_CONFIG.BASE_DELAY_MS, maxDelay = RETRY_CONFIG.MAX_DELAY_MS, multiplier = 2) {
  const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // Add jitter based on configured jitter factor
  const jitter = cappedDelay * RETRY_CONFIG.JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {Object} config - Retry configuration
 * @returns {Promise<any>} Result of the function
 */
export async function withRetry(fn, config = {}) {
  const {
    maxRetries = DEFAULT_CONFIG.maxRetries,
    baseDelay = DEFAULT_CONFIG.baseDelay,
    maxDelay = DEFAULT_CONFIG.maxDelay,
    backoffMultiplier = DEFAULT_CONFIG.backoffMultiplier,
    retryableErrors = DEFAULT_CONFIG.retryableErrors,
    onRetry = null
  } = config;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Parse the error to determine if it's retryable
      const parsedError = parseGISError(error);

      // Don't retry if it's not a retryable error or we've exhausted retries
      if (!parsedError.recoverable || !retryableErrors.includes(parsedError.type)) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateBackoff(attempt, baseDelay, maxDelay, backoffMultiplier);

      // Call onRetry callback if provided
      if (onRetry && typeof onRetry === 'function') {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: parsedError
        });
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Composable for managing retry state and operations
 * @param {Object} options - Configuration options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms for exponential backoff
 * @param {number} [options.maxDelay=30000] - Maximum delay in ms
 * @param {number} [options.backoffMultiplier=2] - Multiplier for exponential backoff
 * @param {string[]} [options.retryableErrors=['NETWORK_ERROR', 'UNKNOWN']] - Error types to retry
 * @returns {Object} Retry state and methods
 *
 * @example
 * // Initialize the composable in a Vue component setup
 * import { useRetry } from './composables/useRetry';
 *
 * const retry = useRetry({
 *   maxRetries: 3,
 *   baseDelay: 500,      // Start with 500ms delay
 *   maxDelay: 10000,     // Cap at 10 seconds
 *   backoffMultiplier: 2 // Double delay each retry
 * });
 *
 * // Execute a function with automatic retry on failure
 * try {
 *   const data = await retry.executeWithRetry(async () => {
 *     return await api.fetchBoundaries(bounds);
 *   });
 *   console.log('Success:', data);
 * } catch (err) {
 *   // All retries exhausted or non-retryable error
 *   console.error('Failed after retries:', err);
 * }
 *
 * // Monitor retry state in your template
 * // retry.isRetrying.value - true while retrying
 * // retry.retryAttempt.value - current attempt number (1, 2, 3...)
 * // retry.lastRetryError.value - the error that triggered the retry
 *
 * // Custom retry callback for progress feedback
 * const data = await retry.executeWithRetry(
 *   async () => api.fetchData(),
 *   {
 *     onRetry: ({ attempt, maxRetries, delay, error }) => {
 *       console.log(`Retry ${attempt}/${maxRetries} in ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 *
 * // Use standalone utility functions
 * import { calculateBackoff, sleep, withRetry } from './composables/useRetry';
 *
 * // Calculate delay for a specific attempt
 * const delay = calculateBackoff(2, 500, 10000, 2); // ~2000ms with jitter
 *
 * // Sleep for a duration
 * await sleep(1000);
 *
 * // One-off retry without composable state tracking
 * const result = await withRetry(fetchFn, { maxRetries: 2 });
 */
export function useRetry(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Track retry state
  const isRetrying = ref(false);
  const retryAttempt = ref(0);
  const lastRetryError = ref(null);

  /**
   * Execute a function with retry, tracking state
   * @param {Function} fn - Async function to execute
   * @param {Object} overrideConfig - Override config for this call
   * @returns {Promise<any>} Result of the function
   */
  const executeWithRetry = async (fn, overrideConfig = {}) => {
    isRetrying.value = false;
    retryAttempt.value = 0;
    lastRetryError.value = null;

    const mergedConfig = {
      ...config,
      ...overrideConfig,
      onRetry: (info) => {
        isRetrying.value = true;
        retryAttempt.value = info.attempt;
        lastRetryError.value = info.error;

        // Also call user's onRetry if provided
        if (overrideConfig.onRetry) {
          overrideConfig.onRetry(info);
        }
      }
    };

    try {
      const result = await withRetry(fn, mergedConfig);
      isRetrying.value = false;
      return result;
    } catch (error) {
      isRetrying.value = false;
      throw error;
    }
  };

  /**
   * Reset retry state
   */
  const resetRetryState = () => {
    isRetrying.value = false;
    retryAttempt.value = 0;
    lastRetryError.value = null;
  };

  return {
    // State
    isRetrying,
    retryAttempt,
    lastRetryError,

    // Methods
    executeWithRetry,
    resetRetryState,

    // Utilities
    withRetry,
    calculateBackoff,
    sleep
  };
}

export default useRetry;
