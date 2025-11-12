/**
 * Debug Utility for Development-Only Logging
 *
 * Set DEBUG=true in development, false in production.
 * All console statements should use these wrappers.
 */

// Set to false in production builds
const DEBUG = false;

export const debug = {
  log: (...args) => {
    if (DEBUG) console.log(...args);
  },
  warn: (...args) => {
    if (DEBUG) console.warn(...args);
  },
  error: (...args) => {
    if (DEBUG) console.error(...args);
  },
  group: (...args) => {
    if (DEBUG) console.group(...args);
  },
  groupEnd: () => {
    if (DEBUG) console.groupEnd();
  }
};
