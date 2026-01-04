/**
 * Composable for managing heatmap layers
 * Handles USDA hardiness zone heatmaps and general heatmap functionality
 * @module useHeatmap
 */

import { ref, computed, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import 'leaflet.heat';
import { HEATMAP_CONFIG, CONVERSION_FACTORS } from '../config/constants.js';
import { heatmapLogger } from '../config/debug.js';

/**
 * USDA Hardiness Zone color mapping
 * @constant {Object.<string, string>}
 */
export const HARDINESS_ZONE_COLORS = {
  '1a': '#d6d6ff', '1b': '#c4c4f2',
  '2a': '#ababd9', '2b': '#ebb0eb',
  '3a': '#dd8fe8', '3b': '#cf7ddb',
  '4a': '#a66bff', '4b': '#5a75ed',
  '5a': '#73a1ff', '5b': '#5ec9e0',
  '6a': '#47ba47', '6b': '#78c756',
  '7a': '#abd669', '7b': '#cddb70',
  '8a': '#edda85', '8b': '#ebcb57',
  '9a': '#dbb64f', '9b': '#f5b678',
  '10a': '#da9132', '10b': '#e6781e',
  '11a': '#e6561e', '11b': '#e88564',
  '12a': '#d4594e', '12b': '#b51228',
  '13a': '#962f1d', '13b': '#751a00'
};

/**
 * @typedef {Object} UserHardinessData
 * @property {number} lat - Latitude coordinate
 * @property {number} lng - Longitude coordinate
 * @property {string} hardinessZone - USDA hardiness zone (e.g., '7a')
 * @property {string} [name] - Optional user name
 */

/**
 * @typedef {Object} UseHeatmapOptions
 * @property {Function} getContent - Function to get current content/props
 */

/**
 * Composable for managing heatmap layers
 * @param {import('vue').Ref<L.Map|null>} mapRef - Reference to Leaflet map instance
 * @param {UseHeatmapOptions} options - Configuration options
 * @returns {Object} Heatmap management state and methods
 *
 * @example
 * // Initialize the composable in a Vue component setup
 * import { ref } from 'vue';
 * import { useHeatmap } from './composables/useHeatmap';
 *
 * const mapRef = ref(null);
 *
 * const {
 *   updateHardinessHeatmap,
 *   createHeatmap,
 *   clearHeatmaps,
 *   getZoneColor,
 *   isLoading,
 *   error
 * } = useHeatmap(mapRef, {
 *   getContent: () => props.content
 * });
 *
 * // Update hardiness zone heatmap with user data
 * const usersWithZones = [
 *   { lat: 40.7128, lng: -74.0060, hardinessZone: '7a', name: 'User 1' },
 *   { lat: 34.0522, lng: -118.2437, hardinessZone: '10a', name: 'User 2' },
 *   { lat: 47.6062, lng: -122.3321, hardinessZone: '8b', name: 'User 3' }
 * ];
 * updateHardinessHeatmap(usersWithZones);
 *
 * // Create a generic heatmap with custom configuration
 * const heatPoints = [
 *   { lat: 40.7128, lng: -74.0060, intensity: 1.0 },
 *   { lat: 40.7150, lng: -74.0080, intensity: 0.8 },
 *   { lat: 40.7100, lng: -74.0040, intensity: 0.5 }
 * ];
 * createHeatmap(heatPoints, {
 *   radius: 25,
 *   blur: 15,
 *   maxZoom: 17,
 *   gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
 * });
 *
 * // Get color for a specific hardiness zone
 * const zoneColor = getZoneColor('7a'); // Returns '#abd669'
 *
 * // Clear all heatmap layers
 * clearHeatmaps();
 */
export function useHeatmap(mapRef, options = {}) {
  const {
    getContent = () => ({})
  } = options;

  // Layer refs
  const heatmapLayer = ref(null);
  const hardinessHeatmapLayer = ref(null);

  // State
  const isLoading = ref(false);
  const error = ref(null);

  // Computed
  const content = computed(() => getContent());

  /**
   * Get color for a hardiness zone
   * @param {string} zone - Hardiness zone code
   * @returns {string} Hex color code
   */
  const getZoneColor = (zone) => {
    return HARDINESS_ZONE_COLORS[zone] || HARDINESS_ZONE_COLORS['7a'];
  };

  /**
   * Get user's hardiness zone color
   * @returns {string} Hex color code
   */
  const userHardinessZoneColor = computed(() => {
    const zone = content.value?.userHardinessZone || '7a';
    return getZoneColor(zone);
  });

  /**
   * Process user hardiness data, resolving formulas if available
   * @param {Array} rawUsers - Raw user data
   * @returns {Array<UserHardinessData>} Processed user data
   */
  const processUserHardinessData = (rawUsers) => {
    if (!Array.isArray(rawUsers)) return [];

    const useFormula = typeof wwLib !== 'undefined' && wwLib?.wwFormula?.useFormula;
    const { resolveMappingFormula } = useFormula ? useFormula() : {};

    return rawUsers.map(user => {
      if (!resolveMappingFormula) {
        return {
          lat: parseFloat(user.lat) || 0,
          lng: parseFloat(user.lng) || 0,
          hardinessZone: user.hardinessZone || '7a',
          name: user.name || 'User',
          originalItem: user
        };
      }

      const lat = resolveMappingFormula(content.value?.usersLatFormula, user) ?? user.lat;
      const lng = resolveMappingFormula(content.value?.usersLngFormula, user) ?? user.lng;
      const zone = resolveMappingFormula(content.value?.usersZoneFormula, user) ?? user.hardinessZone;

      return {
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        hardinessZone: zone || '7a',
        name: user.name || 'User',
        originalItem: user
      };
    }).filter(user =>
      !isNaN(user.lat) &&
      !isNaN(user.lng) &&
      user.lat >= -90 &&
      user.lat <= 90 &&
      user.lng >= -180 &&
      user.lng <= 180
    );
  };

  /**
   * Convert hex color to RGB array
   * @param {string} hex - Hex color code
   * @returns {number[]} RGB array [r, g, b]
   */
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0];
  };

  /**
   * Create multi-user hardiness heatmap with zone-based coloring
   * @param {Array<UserHardinessData>} users - Processed user data
   */
  const createMultiUserHeatmap = (users) => {
    const map = mapRef.value;
    if (!map || !users.length) return;

    try {
      isLoading.value = true;
      error.value = null;

      // Group users by zone for color-coded visualization
      const zoneGroups = {};
      users.forEach(user => {
        const zone = user.hardinessZone || '7a';
        if (!zoneGroups[zone]) {
          zoneGroups[zone] = [];
        }
        zoneGroups[zone].push(user);
      });

      // Clear existing heatmap
      if (hardinessHeatmapLayer.value) {
        map.removeLayer(hardinessHeatmapLayer.value);
      }

      // Create layer group for multiple heatmaps
      hardinessHeatmapLayer.value = L.layerGroup();

      const radiusKm = content.value?.hardinessHeatmapRadius || HEATMAP_CONFIG.DEFAULT_RADIUS;
      const radiusPixels = Math.max(10, Math.min(100, radiusKm));

      // Create heatmap for each zone
      Object.entries(zoneGroups).forEach(([zone, zoneUsers]) => {
        const color = getZoneColor(zone);
        const rgb = hexToRgb(color);

        // Create gradient with zone color
        const gradient = {
          0.0: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`,
          0.4: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`,
          0.7: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.6)`,
          1.0: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`
        };

        // Create heat points
        const heatPoints = zoneUsers.map(user => [user.lat, user.lng, 1.0]);

        // Create heatmap layer with custom gradient
        const zoneHeatmap = L.heatLayer(heatPoints, {
          radius: radiusPixels,
          blur: HEATMAP_CONFIG.BLUR,
          maxZoom: HEATMAP_CONFIG.MAX_ZOOM,
          max: HEATMAP_CONFIG.MAX_INTENSITY,
          gradient
        });

        hardinessHeatmapLayer.value.addLayer(zoneHeatmap);
      });

      hardinessHeatmapLayer.value.addTo(map);
      isLoading.value = false;
    } catch (err) {
      isLoading.value = false;
      error.value = `Failed to create heatmap: ${err.message}`;
      heatmapLogger.warn('Error creating heatmap:', err.message);
    }
  };

  /**
   * Update hardiness heatmap based on current data
   * @param {Array} rawUsers - Raw user data from content
   */
  const updateHardinessHeatmap = (rawUsers) => {
    const map = mapRef.value;
    if (!map) return;

    // Clear existing heatmap
    if (hardinessHeatmapLayer.value) {
      map.removeLayer(hardinessHeatmapLayer.value);
      hardinessHeatmapLayer.value = null;
    }

    // Check if heatmap should be shown
    if (!content.value?.showHardinessHeatmap) {
      return;
    }

    const users = processUserHardinessData(rawUsers);
    if (!users.length) {
      return;
    }

    createMultiUserHeatmap(users);
  };

  /**
   * Create generic heatmap from point data
   * @param {Array<{lat: number, lng: number, intensity?: number}>} points - Point data
   * @param {Object} [config] - Heatmap configuration
   */
  const createHeatmap = (points, config = {}) => {
    const map = mapRef.value;
    if (!map || !points.length) return;

    const {
      radius = HEATMAP_CONFIG.DEFAULT_RADIUS,
      blur = HEATMAP_CONFIG.BLUR,
      maxZoom = HEATMAP_CONFIG.MAX_ZOOM,
      gradient = null
    } = config;

    try {
      // Clear existing heatmap
      if (heatmapLayer.value) {
        map.removeLayer(heatmapLayer.value);
      }

      const heatPoints = points.map(p => [p.lat, p.lng, p.intensity || 1.0]);

      const heatmapOptions = {
        radius,
        blur,
        maxZoom,
        max: HEATMAP_CONFIG.MAX_INTENSITY
      };

      if (gradient) {
        heatmapOptions.gradient = gradient;
      }

      heatmapLayer.value = L.heatLayer(heatPoints, heatmapOptions);
      heatmapLayer.value.addTo(map);
    } catch (err) {
      heatmapLogger.warn('Error creating heatmap:', err.message);
    }
  };

  /**
   * Remove all heatmap layers
   */
  const clearHeatmaps = () => {
    const map = mapRef.value;
    if (!map) return;

    if (heatmapLayer.value) {
      map.removeLayer(heatmapLayer.value);
      heatmapLayer.value = null;
    }

    if (hardinessHeatmapLayer.value) {
      map.removeLayer(hardinessHeatmapLayer.value);
      hardinessHeatmapLayer.value = null;
    }
  };

  /**
   * Cleanup all heatmap layers and state
   */
  const cleanup = () => {
    clearHeatmaps();
    error.value = null;
  };

  // Cleanup on unmount
  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    // Layer refs
    heatmapLayer,
    hardinessHeatmapLayer,

    // State
    isLoading,
    error,

    // Computed
    userHardinessZoneColor,

    // Constants
    HARDINESS_ZONE_COLORS,

    // Methods
    getZoneColor,
    processUserHardinessData,
    createMultiUserHeatmap,
    updateHardinessHeatmap,
    createHeatmap,
    clearHeatmaps,
    cleanup
  };
}

export default useHeatmap;
