/**
 * Configuration and constants barrel export
 * @module config
 */

export {
  LEAFLET_ICON_URLS,
  TILE_LAYER_URLS,
  MAP_DEFAULTS,
  STYLE_DEFAULTS,
  ZOOM_THRESHOLDS,
  CLUSTERING_CONFIG,
  HEATMAP_CONFIG,
  UI_TIMING,
  GEOCODING_CONFIG,
  RETRY_CONFIG,
  CACHE_LIMITS,
  CONVERSION_FACTORS
} from './constants.js';

// Debug utilities
export {
  createLogger,
  setDebugEnabled,
  isDebugEnabled,
  mapLogger,
  boundaryLogger,
  apiLogger,
  tileLogger,
  geoLogger,
  markerLogger,
  heatmapLogger
} from './debug.js';
