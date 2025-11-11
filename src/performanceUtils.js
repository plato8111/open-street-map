/**
 * Performance Utilities for Open Street Map Component
 * Helps measure and optimize component performance
 */

// Performance timing markers
const markers = new Map();
const measures = new Map();

export const perfMark = (label) => {
  if (typeof performance !== 'undefined' && performance.mark) {
    try {
      performance.mark(`osm-${label}`);
      markers.set(label, performance.now());
    } catch (e) {
      console.warn(`[Perf] Mark failed: ${label}`, e);
    }
  }
};

export const perfMeasure = (label, startMark, endMark) => {
  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      const start = startMark ? `osm-${startMark}` : undefined;
      const end = endMark ? `osm-${endMark}` : undefined;

      performance.measure(`osm-${label}`, start, end);
      const entries = performance.getEntriesByName(`osm-${label}`);

      if (entries.length > 0) {
        const duration = entries[entries.length - 1].duration;
        measures.set(label, duration);

        // Log if slow (>100ms for most operations)
        if (duration > 100) {
          console.warn(`⚠️ Slow operation: ${label} took ${duration.toFixed(2)}ms`);
        } else {
          console.log(`✓ ${label}: ${duration.toFixed(2)}ms`);
        }

        return duration;
      }
    } catch (e) {
      console.warn(`[Perf] Measure failed: ${label}`, e);
    }
  }
  return 0;
};

export const perfReport = () => {
  console.group('📊 Performance Report');
  console.table(Object.fromEntries(measures));
  console.groupEnd();
};

/**
 * Defer work until browser is idle
 * Falls back to setTimeout if requestIdleCallback not available
 */
export const deferWork = (callback, options = {}) => {
  const { timeout = 2000 } = options;

  if (typeof requestIdleCallback !== 'undefined') {
    return requestIdleCallback(callback, { timeout });
  } else {
    return setTimeout(callback, timeout);
  }
};

/**
 * Batch multiple operations and execute them later
 */
export const batchDeferredWork = (tasks, options = {}) => {
  const { timeout = 100, priority = 'low' } = options;

  return new Promise((resolve) => {
    deferWork(() => {
      tasks.forEach(task => {
        try {
          task();
        } catch (e) {
          console.error('[Batch] Task failed:', e);
        }
      });
      resolve();
    }, { timeout });
  });
};

/**
 * Check if a feature should be loaded based on current viewport
 */
export const isFeatureInViewport = (bounds, featureBounds) => {
  if (!bounds || !featureBounds) return false;
  return bounds.intersects(featureBounds);
};

/**
 * Throttle function to limit how often it's called
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Debounce function with trailing option
 */
export const debounce = (func, wait, immediate = false) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
};

/**
 * Lazy load a resource
 */
export const lazyLoad = async (loader, options = {}) => {
  const { retries = 3, delay = 1000 } = options;

  for (let i = 0; i < retries; i++) {
    try {
      return await loader();
    } catch (e) {
      if (i === retries - 1) throw e;
      console.warn(`[Lazy] Retry ${i + 1}/${retries} after ${delay}ms:`, e);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

/**
 * Measure render performance
 */
export const measureRender = (componentName, fn) => {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  if (duration > 50) {
    console.warn(`⚠️ Slow render: ${componentName} took ${duration.toFixed(2)}ms`);
  }

  return result;
};

export default {
  perfMark,
  perfMeasure,
  perfReport,
  deferWork,
  batchDeferredWork,
  isFeatureInViewport,
  throttle,
  debounce,
  lazyLoad,
  measureRender
};
