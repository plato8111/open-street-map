/**
 * Debug Logging Utility for OpenStreetMap WeWeb Component
 * 
 * Provides conditional logging that only outputs in development mode.
 * This prevents console pollution in production while maintaining
 * useful debugging capabilities during development.
 * 
 * @module debug
 */

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Detect if we're in development mode
 * Checks multiple sources for environment detection
 * @returns {boolean} True if in development mode
 */
function isDevMode() {
  try {
    // Check Node.js environment
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      return true;
    }

    // Check WeWeb editor mode
    if (typeof wwLib !== 'undefined') {
      // In WeWeb editor, we consider it dev mode
      const isEditor = wwLib?.wwUtils?.isEditor?.() ?? false;
      if (isEditor) return true;
    }

    // Check for localhost/development URLs
    const frontWindow = (typeof wwLib !== 'undefined' && wwLib?.getFrontWindow?.()) ||
                        (typeof window !== 'undefined' ? window : null);
    
    if (frontWindow?.location) {
      const hostname = frontWindow.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local')) {
        return true;
      }
    }

    // Check for debug flag in URL
    if (frontWindow?.location?.search?.includes('debug=true')) {
      return true;
    }

    // Default to false (production mode)
    return false;
  } catch {
    return false;
  }
}

// =============================================================================
// DEBUG STATE
// =============================================================================

/** @type {boolean} Whether debug mode is enabled */
let DEBUG_ENABLED = isDevMode();

/** @type {Set<string>} Enabled debug namespaces */
const enabledNamespaces = new Set(['*']);

// =============================================================================
// DEBUG CONFIGURATION
// =============================================================================

/**
 * Enable or disable debug mode
 * @param {boolean} enabled - Whether to enable debug mode
 */
export function setDebugEnabled(enabled) {
  DEBUG_ENABLED = Boolean(enabled);
}

/**
 * Check if debug mode is enabled
 * @returns {boolean} Whether debug mode is enabled
 */
export function isDebugEnabled() {
  return DEBUG_ENABLED;
}

/**
 * Enable specific debug namespaces
 * @param {...string} namespaces - Namespaces to enable
 */
export function enableNamespaces(...namespaces) {
  namespaces.forEach(ns => enabledNamespaces.add(ns));
}

/**
 * Disable specific debug namespaces
 * @param {...string} namespaces - Namespaces to disable
 */
export function disableNamespaces(...namespaces) {
  namespaces.forEach(ns => enabledNamespaces.delete(ns));
}

/**
 * Check if a namespace is enabled
 * @param {string} namespace - Namespace to check
 * @returns {boolean} Whether the namespace is enabled
 */
function isNamespaceEnabled(namespace) {
  if (enabledNamespaces.has('*')) return true;
  if (enabledNamespaces.has(namespace)) return true;
  
  // Check for wildcard patterns like "Map:*"
  const parts = namespace.split(':');
  for (let i = parts.length - 1; i >= 0; i--) {
    const pattern = parts.slice(0, i + 1).join(':') + ':*';
    if (enabledNamespaces.has(pattern)) return true;
  }
  
  return false;
}

// =============================================================================
// LOGGING FUNCTIONS
// =============================================================================

/**
 * Create a no-op function for disabled logging
 * @returns {Function} No-op function
 */
const noop = () => {};

/**
 * Create a namespaced logger
 * @param {string} namespace - Logger namespace (e.g., 'Map', 'Boundaries', 'API')
 * @returns {Object} Logger object with log, warn, error, debug methods
 */
export function createLogger(namespace) {
  const prefix = `[${namespace}]`;

  return {
    /**
     * Log informational message (only in dev mode)
     * @param {...any} args - Arguments to log
     */
    log(...args) {
      if (DEBUG_ENABLED && isNamespaceEnabled(namespace)) {
        console.log(prefix, ...args);
      }
    },

    /**
     * Log warning message (only in dev mode)
     * @param {...any} args - Arguments to log
     */
    warn(...args) {
      if (DEBUG_ENABLED && isNamespaceEnabled(namespace)) {
        console.warn(prefix, ...args);
      }
    },

    /**
     * Log error message (always logs - errors are important)
     * @param {...any} args - Arguments to log
     */
    error(...args) {
      // Errors are always logged regardless of debug mode
      console.error(prefix, ...args);
    },

    /**
     * Log debug message (only in dev mode)
     * @param {...any} args - Arguments to log
     */
    debug(...args) {
      if (DEBUG_ENABLED && isNamespaceEnabled(namespace)) {
        console.debug(prefix, ...args);
      }
    },

    /**
     * Log with timing information
     * @param {string} label - Timer label
     * @returns {Function} Function to end timing and log
     */
    time(label) {
      if (!DEBUG_ENABLED || !isNamespaceEnabled(namespace)) {
        return noop;
      }
      
      const start = performance.now();
      return () => {
        const duration = performance.now() - start;
        console.debug(prefix, `${label}: ${duration.toFixed(2)}ms`);
      };
    },

    /**
     * Log a group of related messages
     * @param {string} label - Group label
     * @param {Function} fn - Function containing grouped logs
     */
    group(label, fn) {
      if (!DEBUG_ENABLED || !isNamespaceEnabled(namespace)) {
        fn();
        return;
      }
      
      console.group(prefix, label);
      try {
        fn();
      } finally {
        console.groupEnd();
      }
    }
  };
}

// =============================================================================
// PRE-CONFIGURED LOGGERS
// =============================================================================

/** Logger for Map-related operations */
export const mapLogger = createLogger('Map');

/** Logger for Boundary-related operations */
export const boundaryLogger = createLogger('Boundaries');

/** Logger for API/Supabase operations */
export const apiLogger = createLogger('API');

/** Logger for Vector Tile operations */
export const tileLogger = createLogger('VectorTiles');

/** Logger for Geolocation operations */
export const geoLogger = createLogger('Geolocation');

/** Logger for Marker operations */
export const markerLogger = createLogger('Markers');

/** Logger for Heatmap operations */
export const heatmapLogger = createLogger('Heatmap');

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  createLogger,
  setDebugEnabled,
  isDebugEnabled,
  enableNamespaces,
  disableNamespaces,
  mapLogger,
  boundaryLogger,
  apiLogger,
  tileLogger,
  geoLogger,
  markerLogger,
  heatmapLogger
};
