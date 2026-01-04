/**
 * Centralized Constants for OpenStreetMap WeWeb Component
 *
 * This file contains all magic numbers and configuration constants
 * to improve maintainability and reduce scattered hardcoded values.
 *
 * @fileoverview Configuration constants organized by functional area.
 * Each constant group includes detailed documentation on usage, relationships,
 * and modification guidelines.
 */

// =============================================================================
// ZOOM LEVEL THRESHOLDS
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/wwElement.vue, src/api/vectorTileClient.js
 *
 * HOW THEY INTERACT:
 * The zoom thresholds create a hierarchical boundary display system:
 *
 *   Zoom 0-3 (< COUNTRY_TO_STATE): Only country boundaries visible
 *         ↓ (transition point)
 *   Zoom 4-7 (>= STATE_MIN_ZOOM, < LOCATION_ZOOM_THRESHOLD): Country + state boundaries
 *         ↓ (transition point)
 *   Zoom 8+ (>= LOCATION_ZOOM_THRESHOLD): Full detail + location marking enabled
 *
 * RELATIONSHIP MAP:
 * - COUNTRY_TO_STATE (4) → Determines when vectorTileClient switches from
 *   'get_country_mvt_tile' to 'get_states_mvt_tile' RPC function
 * - STATE_MIN_ZOOM (4) → Must equal COUNTRY_TO_STATE for seamless transitions;
 *   used in wwElement.vue for state boundary queries
 * - LOCATION_ZOOM_THRESHOLD (8) → Activates location marking mode; independent
 *   of boundary thresholds but should be >= STATE_MIN_ZOOM
 *
 * WHEN TO MODIFY:
 * - Increase COUNTRY_TO_STATE if state boundaries load slowly at zoom 4
 * - Decrease LOCATION_ZOOM_THRESHOLD if users need to mark locations earlier
 * - Always keep STATE_MIN_ZOOM aligned with COUNTRY_TO_STATE
 * - MIN_ZOOM/MAX_ZOOM rarely need changes (Leaflet standards)
 */
export const ZOOM_THRESHOLDS = {
  /**
   * Zoom level below which only countries are shown.
   * @relationship Used by vectorTileClient.getTile() to select MVT function
   * @relationship Must match STATE_MIN_ZOOM for consistent behavior
   */
  COUNTRY_TO_STATE: 4,

  /**
   * Zoom level above which detailed features are shown.
   * Reserved for future fine-grained feature control.
   */
  STATE_TO_DETAIL: 8,

  /** Minimum valid zoom level (Leaflet standard) */
  MIN_ZOOM: 0,

  /** Maximum valid zoom level (Leaflet standard: 0-22 for most tile providers) */
  MAX_ZOOM: 22,

  /** Default zoom level for initial map view - good balance of context and detail */
  DEFAULT_ZOOM: 13,

  /** Default minimum zoom for countries - allows global view */
  COUNTRY_MIN_ZOOM: 1,

  /** Default maximum zoom for countries - country bounds visible at all zooms */
  COUNTRY_MAX_ZOOM: 18,

  /**
   * Default minimum zoom for states.
   * @relationship MUST equal COUNTRY_TO_STATE for seamless boundary transitions
   * @relationship Used in wwElement.vue getLocationParentState() checks
   */
  STATE_MIN_ZOOM: 4,

  /** Default maximum zoom for states */
  STATE_MAX_ZOOM: 18,

  /**
   * Default zoom threshold for location marking mode.
   * @relationship Should be >= STATE_MIN_ZOOM (users should see state context when marking)
   * @relationship Controls when handleMapClick() activates location marking
   */
  LOCATION_ZOOM_THRESHOLD: 8
};

// =============================================================================
// GEOMETRY SIMPLIFICATION
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: Supabase RPC functions (get_simplified_boundaries_in_bbox)
 *
 * HOW THEY INTERACT:
 * The simplification levels control geometry detail based on zoom:
 *   - LOW (0.1°): Zoomed out views (zoom 1-4), ~11km tolerance
 *   - MEDIUM (0.01°): Mid-range views (zoom 5-8), ~1.1km tolerance
 *   - HIGH (0.001°): Detailed views (zoom 9+), ~110m tolerance
 *
 * WHEN TO MODIFY:
 * - Decrease values for smoother boundaries (increases data transfer)
 * - Increase values for faster loading (reduces visual quality)
 */
export const SIMPLIFICATION_LEVELS = {
  /** Tolerance for low detail (zoomed out) - degrees */
  LOW: 0.1,
  /** Tolerance for medium detail - degrees */
  MEDIUM: 0.01,
  /** Tolerance for high detail (zoomed in) - degrees */
  HIGH: 0.001
};

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/composables/useRequestDeduplication.js, src/api/supabaseClient.js
 *
 * HOW THEY INTERACT:
 * The cache system prevents redundant API calls during rapid map interactions:
 *   - DEDUPLICATION_CACHE_AGE_MS → useRequestDeduplication.completedCache TTL
 *   - BOUNDARY_CACHE_AGE_MS → BoundaryCache default TTL
 *   - DEBOUNCE_MS → useRequestDeduplication.executeDebounced default delay
 *   - MAX_PENDING_REQUESTS → Limits concurrent in-flight requests
 *
 * WHEN TO MODIFY:
 * - Increase DEDUPLICATION_CACHE_AGE_MS if users report stale data
 * - Decrease DEBOUNCE_MS for more responsive (but heavier) updates
 * - Increase MAX_PENDING_REQUESTS only if request queue overflows
 */
export const CACHE_LIMITS = {
  /** Maximum number of vector tiles to cache */
  VECTOR_TILES: 500,
  /** Maximum number of pending requests to track */
  MAX_PENDING_REQUESTS: 50,
  /** Default cache age for request deduplication (ms) */
  DEDUPLICATION_CACHE_AGE_MS: 5000,
  /** Default cache age for boundary data (ms) - 5 minutes */
  BOUNDARY_CACHE_AGE_MS: 5 * 60 * 1000,
  /** Default debounce delay for requests (ms) */
  DEBOUNCE_MS: 100
};

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/composables/useRetry.js, src/api/supabaseClient.js
 *
 * HOW THEY INTERACT:
 * Retry logic uses exponential backoff with jitter for network resilience:
 *   Attempt 0: Immediate
 *   Attempt 1: BASE_DELAY_MS * 2^0 ± jitter = ~1000ms
 *   Attempt 2: BASE_DELAY_MS * 2^1 ± jitter = ~2000ms
 *   Attempt 3: BASE_DELAY_MS * 2^2 ± jitter = ~4000ms (capped at MAX_DELAY_MS)
 *
 * JITTER_FACTOR adds randomness to prevent "thundering herd" when multiple
 * clients retry simultaneously after an outage.
 *
 * WHEN TO MODIFY:
 * - Increase MAX_RETRIES for unreliable networks (increases wait time)
 * - Decrease BASE_DELAY_MS for faster retries (may stress server)
 * - Keep JITTER_FACTOR between 0.1-0.5 for effective distribution
 */
export const RETRY_CONFIG = {
  /** Default maximum retry attempts */
  MAX_RETRIES: 3,
  /** Base delay between retries (ms) */
  BASE_DELAY_MS: 1000,
  /** Maximum delay between retries (ms) */
  MAX_DELAY_MS: 30000,
  /** Jitter factor for randomizing retry delays (0-1) */
  JITTER_FACTOR: 0.3
};

// =============================================================================
// COORDINATE VALIDATION
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/api/supabaseClient.js (validateCoordinates, validateBounds)
 *
 * Standard WGS84 coordinate system bounds. These are fixed values and
 * should never be modified.
 */
export const COORDINATE_BOUNDS = {
  /** Minimum latitude value */
  LAT_MIN: -90,
  /** Maximum latitude value */
  LAT_MAX: 90,
  /** Minimum longitude value */
  LNG_MIN: -180,
  /** Maximum longitude value */
  LNG_MAX: 180
};

// =============================================================================
// MAP DEFAULTS
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: ww-config.js (default property values), src/wwElement.vue
 *
 * These provide fallback values when content properties are not set.
 * Initial coordinates default to London for demonstration purposes.
 *
 * WHEN TO MODIFY:
 * - Change INITIAL_LAT/LNG to your target audience's region
 * - Adjust INITIAL_ZOOM based on typical use case (city vs continent view)
 */
export const MAP_DEFAULTS = {
  /** Default initial latitude */
  INITIAL_LAT: 51.505,
  /** Default initial longitude */
  INITIAL_LNG: -0.09,
  /** Default initial zoom */
  INITIAL_ZOOM: 13,
  /** Default map height */
  MAP_HEIGHT: '400px',
  /** Default map type */
  MAP_TYPE: 'osm'
};

// =============================================================================
// STYLING DEFAULTS
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: ww-config.js (default values), src/composables/useBoundaries.js
 *
 * HOW THEY INTERACT:
 * Boundary styling applies in layers:
 *   1. Normal state: BORDER_COLOR with BORDER_OPACITY
 *   2. Hover state: HOVER_COLOR fills with HOVER_OPACITY
 *   3. Selected state: SELECTED_COLOR fills with SELECTED_OPACITY
 *
 * WHEN TO MODIFY:
 * - Change colors to match your brand/design system
 * - Adjust opacity values for different visual prominence
 * - Keep BORDER_WIDTH small (1-2) to avoid obscuring detail
 */
export const STYLE_DEFAULTS = {
  // Country styling
  COUNTRY_HOVER_COLOR: '#ff0000',
  COUNTRY_HOVER_OPACITY: 0.3,
  COUNTRY_SELECTED_COLOR: '#0000ff',
  COUNTRY_SELECTED_OPACITY: 0.5,
  COUNTRY_BORDER_COLOR: '#666666',
  COUNTRY_BORDER_WIDTH: 1,
  COUNTRY_BORDER_OPACITY: 0.5,

  // State styling
  STATE_HOVER_COLOR: '#ff0000',
  STATE_HOVER_OPACITY: 0.3,
  STATE_SELECTED_COLOR: '#0000ff',
  STATE_SELECTED_OPACITY: 0.5,
  STATE_BORDER_COLOR: '#666666',
  STATE_BORDER_WIDTH: 1,
  STATE_BORDER_OPACITY: 0.5,

  // Location marker styling
  SELECTED_LOCATION_MARKER_COLOR: '#FF5722',
  ONLINE_MARKER_COLOR: '#4CAF50',
  OFFLINE_MARKER_COLOR: '#9E9E9E'
};

// =============================================================================
// GEOLOCATION DEFAULTS
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: ww-config.js, src/composables/useGeolocation.js
 *
 * Privacy radius creates a fuzzy zone around user's actual location
 * to protect their privacy while still showing approximate location.
 *
 * WHEN TO MODIFY:
 * - Increase PRIVACY_RADIUS for more anonymity (larger circle)
 * - Decrease TIMEOUT_MS for faster failure detection (poor GPS areas)
 * - Increase MAX_AGE_MS to use cached positions more often (battery saving)
 */
export const GEOLOCATION_DEFAULTS = {
  /** Default privacy radius in kilometers */
  PRIVACY_RADIUS_KM: 1,
  /** Default privacy radius in miles */
  PRIVACY_RADIUS_MILES: 0.62,
  /** Geolocation timeout in milliseconds */
  TIMEOUT_MS: 10000,
  /** Geolocation maximum age in milliseconds */
  MAX_AGE_MS: 60000
};

// =============================================================================
// GEOCODING CONFIGURATION
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/wwElement.vue (geocodeLocation method)
 *
 * Nominatim has a usage policy requiring:
 * - Maximum 1 request per second (RATE_LIMIT_MS = 1000)
 * - Valid User-Agent header identifying your application
 *
 * WHEN TO MODIFY:
 * - Change USER_AGENT to identify your specific application
 * - NEVER decrease RATE_LIMIT_MS below 1000 (violates Nominatim policy)
 * - For high-volume use, consider self-hosted Nominatim or commercial API
 */
export const GEOCODING_CONFIG = {
  /** Rate limit for geocoding requests (ms) */
  RATE_LIMIT_MS: 1000,
  /** Nominatim API base URL */
  NOMINATIM_BASE_URL: 'https://nominatim.openstreetmap.org',
  /** User agent for Nominatim requests */
  USER_AGENT: 'WeWebOpenStreetMapComponent/1.0'
};

// =============================================================================
// CLUSTERING CONFIGURATION
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/composables/useMarkers.js (L.markerClusterGroup options)
 *
 * Marker clustering groups nearby markers into numbered clusters.
 * MAX_CLUSTER_RADIUS determines how close markers must be to cluster.
 * DISABLE_CLUSTERING_AT_ZOOM shows individual markers when zoomed in.
 *
 * WHEN TO MODIFY:
 * - Increase MAX_CLUSTER_RADIUS for fewer, larger clusters
 * - Decrease DISABLE_CLUSTERING_AT_ZOOM to show individual markers sooner
 */
export const CLUSTERING_CONFIG = {
  /** Default maximum cluster radius in pixels */
  MAX_CLUSTER_RADIUS: 50,
  /** Default zoom level at which clustering is disabled */
  DISABLE_CLUSTERING_AT_ZOOM: 15
};

// =============================================================================
// HEATMAP CONFIGURATION
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/composables/useHeatmap.js (L.heatLayer options)
 *
 * Controls the visual appearance of heatmap overlays (e.g., USDA hardiness zones).
 * Radius and blur combine to create the "heat" gradient effect.
 *
 * WHEN TO MODIFY:
 * - Increase DEFAULT_RADIUS for more spread (lower density data)
 * - Increase BLUR for softer edges
 * - Adjust MAX_INTENSITY to scale color mapping to your data range
 */
export const HEATMAP_CONFIG = {
  /** Default heatmap radius in pixels */
  DEFAULT_RADIUS: 50,
  /** Default heatmap blur */
  BLUR: 25,
  /** Maximum zoom for heatmap display */
  MAX_ZOOM: 17,
  /** Maximum intensity value */
  MAX_INTENSITY: 1.4
};

// =============================================================================
// TILE LAYER URLS
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/composables/useMapLayers.js (TILE_LAYERS configuration)
 *
 * These are public tile server URLs. Each has different usage policies:
 * - OSM: Free, requires attribution to OpenStreetMap contributors
 * - SATELLITE: Esri ArcGIS, requires Esri attribution
 * - TERRAIN: OpenTopoMap, requires OpenTopoMap attribution
 * - DARK/LIGHT: CartoDB, requires CartoDB attribution
 *
 * WHEN TO MODIFY:
 * - Replace with self-hosted tile server URLs for high-traffic apps
 * - Add custom tile provider URLs (ensure proper attribution)
 */
export const TILE_LAYER_URLS = {
  OSM: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  SATELLITE: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  TERRAIN: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  DARK: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  LIGHT: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
};

// =============================================================================
// LEAFLET ICON URLS (CDN)
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/wwElement.vue (Leaflet icon configuration)
 *
 * Leaflet's default marker icons loaded from cdnjs CDN.
 * These fix the common "broken marker icon" issue in bundled environments.
 *
 * WHEN TO MODIFY:
 * - Replace with self-hosted icons for offline capability
 * - Use custom marker icon URLs for branded appearance
 */
export const LEAFLET_ICON_URLS = {
  MARKER_ICON_RETINA: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  MARKER_ICON: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  MARKER_SHADOW: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
};

// =============================================================================
// CONVERSION FACTORS
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/composables/useGeolocation.js, src/composables/useHeatmap.js
 *
 * Geographic unit conversions. KM_TO_DEGREES is approximate (varies by latitude).
 * These are mathematical constants and should never be modified.
 */
export const CONVERSION_FACTORS = {
  /** Miles to kilometers conversion factor */
  MILES_TO_KM: 1.60934,
  /** Kilometers to degrees (approximate at equator) */
  KM_TO_DEGREES: 1 / 111.32,
  /** Kilometers to meters */
  KM_TO_METERS: 1000
};

// =============================================================================
// UI TIMING
// =============================================================================
/**
 * USAGE CONTEXT:
 * - Used in: src/wwElement.vue (resize handling, map invalidation)
 *
 * These delays ensure smooth UI updates without race conditions:
 * - RESIZE_DEBOUNCE_MS: Prevents excessive resize recalculations
 * - INVALIDATE_SIZE_DELAY_MS: Waits for container size to stabilize
 * - NEXT_TICK_DELAY_MS: Allows Vue's reactivity to complete
 *
 * WHEN TO MODIFY:
 * - Increase delays if map flickers or fails to resize properly
 * - Decrease cautiously (may cause race conditions)
 */
export const UI_TIMING = {
  /** Delay for resize observer debounce (ms) */
  RESIZE_DEBOUNCE_MS: 150,
  /** Delay for map invalidate size (ms) */
  INVALIDATE_SIZE_DELAY_MS: 100,
  /** Small delay for nextTick operations (ms) */
  NEXT_TICK_DELAY_MS: 50
};

export default {
  ZOOM_THRESHOLDS,
  SIMPLIFICATION_LEVELS,
  CACHE_LIMITS,
  RETRY_CONFIG,
  COORDINATE_BOUNDS,
  MAP_DEFAULTS,
  STYLE_DEFAULTS,
  GEOLOCATION_DEFAULTS,
  GEOCODING_CONFIG,
  CLUSTERING_CONFIG,
  HEATMAP_CONFIG,
  TILE_LAYER_URLS,
  LEAFLET_ICON_URLS,
  CONVERSION_FACTORS,
  UI_TIMING
};
