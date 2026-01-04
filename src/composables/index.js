/**
 * Composables Index
 * Export all composables for easy importing
 * @module composables
 */

// Retry and deduplication utilities
export { useRetry, withRetry, calculateBackoff, sleep } from './useRetry.js';
export { useRequestDeduplication, generateCacheKey } from './useRequestDeduplication.js';

// Map layer management
export { useMapLayers, TILE_LAYERS } from './useMapLayers.js';

// Geographic boundaries
export { useBoundaries, DEFAULT_STYLES } from './useBoundaries.js';

// Geolocation and privacy
export { useGeolocation, generateRandomOffset, milesToKm } from './useGeolocation.js';

// Markers and clustering
export { useMarkers } from './useMarkers.js';

// Heatmap visualization
export { useHeatmap, HARDINESS_ZONE_COLORS } from './useHeatmap.js';
