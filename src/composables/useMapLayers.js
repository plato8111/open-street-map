/**
 * Composable for managing map tile layers
 * Handles tile layer setup, switching, and cleanup
 */

import { ref, computed, watch, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import { mapLogger } from '../config/debug.js';

/**
 * Available tile layer configurations
 */
export const TILE_LAYERS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution: '&copy; Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
      maxZoom: 19
    }
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: {
      attribution: '&copy; OpenTopoMap contributors',
      maxZoom: 17
    }
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; CartoDB, &copy; OpenStreetMap contributors',
      maxZoom: 19,
      subdomains: 'abcd'
    }
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; CartoDB, &copy; OpenStreetMap contributors',
      maxZoom: 19,
      subdomains: 'abcd'
    }
  }
};

/**
 * Composable for managing map tile layers
 * @param {Ref<L.Map|null>} mapRef - Reference to Leaflet map instance
 * @param {Object} options - Configuration options
 * @returns {Object} Layer management state and methods
 *
 * @example
 * // Initialize the composable in a Vue component setup
 * import { ref } from 'vue';
 * import { useMapLayers } from './composables/useMapLayers';
 *
 * const mapRef = ref(null);
 * const {
 *   currentMapType,
 *   availableMapTypes,
 *   setMapType,
 *   initializeLayers,
 *   addCustomLayer,
 *   error
 * } = useMapLayers(mapRef, {
 *   initialMapType: 'osm',
 *   allowMapTypeSelection: true
 * });
 *
 * // After map is initialized, set up layers
 * initializeLayers();
 *
 * // Switch to satellite view
 * setMapType('satellite');
 *
 * // Add a custom tile layer
 * addCustomLayer('custom-tiles', {
 *   url: 'https://my-tile-server.com/{z}/{x}/{y}.png',
 *   options: { attribution: 'My Tiles', maxZoom: 18 }
 * });
 *
 * // Check available map types
 * console.log(availableMapTypes.value); // ['osm', 'satellite', 'terrain', 'dark', 'light', 'custom-tiles']
 */
export function useMapLayers(mapRef, options = {}) {
  const {
    initialMapType = 'osm',
    allowMapTypeSelection = true,
    customLayers = {}
  } = options;

  // Merge custom layers with default layers
  const allLayers = { ...TILE_LAYERS, ...customLayers };

  // State
  const currentMapType = ref(initialMapType);
  const tileLayers = ref({});
  const activeLayer = ref(null);
  const isLoading = ref(false);
  const error = ref(null);

  // Computed
  const availableMapTypes = computed(() => Object.keys(allLayers));

  const currentLayerConfig = computed(() => allLayers[currentMapType.value] || allLayers.osm);

  /**
   * Initialize tile layers (create instances but don't add to map yet)
   */
  const initializeLayers = () => {
    try {
      error.value = null;

      // Create layer instances for all configured layers
      Object.entries(allLayers).forEach(([key, config]) => {
        if (!tileLayers.value[key]) {
          tileLayers.value[key] = L.tileLayer(config.url, config.options);
        }
      });

      return true;
    } catch (err) {
      error.value = `Failed to initialize tile layers: ${err.message}`;
      mapLogger.error('Initialization error:', err);
      return false;
    }
  };

  /**
   * Set the active tile layer on the map
   * @param {string} mapType - Layer type key
   * @returns {boolean} Success status
   */
  const setMapType = (mapType) => {
    const map = mapRef.value;
    if (!map) {
      error.value = 'Map not initialized';
      return false;
    }

    if (!allLayers[mapType]) {
      error.value = `Unknown map type: ${mapType}`;
      return false;
    }

    try {
      isLoading.value = true;
      error.value = null;

      // Remove current active layer
      if (activeLayer.value && map.hasLayer(activeLayer.value)) {
        map.removeLayer(activeLayer.value);
      }

      // Ensure layer is initialized
      if (!tileLayers.value[mapType]) {
        const config = allLayers[mapType];
        tileLayers.value[mapType] = L.tileLayer(config.url, config.options);
      }

      // Add new layer
      const newLayer = tileLayers.value[mapType];
      newLayer.addTo(map);

      activeLayer.value = newLayer;
      currentMapType.value = mapType;
      isLoading.value = false;

      return true;
    } catch (err) {
      isLoading.value = false;
      error.value = `Failed to set map type: ${err.message}`;
      mapLogger.error('Error setting map type:', err);
      return false;
    }
  };

  /**
   * Update the map type (convenience method)
   * @param {string} newMapType - New map type
   */
  const updateMapType = (newMapType) => {
    if (newMapType !== currentMapType.value) {
      setMapType(newMapType);
    }
  };

  /**
   * Add a custom tile layer
   * @param {string} key - Layer key
   * @param {Object} config - Layer configuration { url, options }
   */
  const addCustomLayer = (key, config) => {
    if (!config.url) {
      error.value = 'Layer configuration must include url';
      return false;
    }

    allLayers[key] = {
      url: config.url,
      options: config.options || {}
    };

    tileLayers.value[key] = L.tileLayer(config.url, config.options || {});
    return true;
  };

  /**
   * Remove a custom tile layer
   * @param {string} key - Layer key
   */
  const removeCustomLayer = (key) => {
    // Don't allow removing default layers
    if (TILE_LAYERS[key]) {
      error.value = 'Cannot remove default layers';
      return false;
    }

    const map = mapRef.value;
    const layer = tileLayers.value[key];

    // Remove from map if active
    if (map && layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }

    delete tileLayers.value[key];
    delete allLayers[key];

    // Switch to OSM if the removed layer was active
    if (currentMapType.value === key) {
      setMapType('osm');
    }

    return true;
  };

  /**
   * Cleanup all layers
   */
  const cleanup = () => {
    const map = mapRef.value;
    if (map) {
      Object.values(tileLayers.value).forEach(layer => {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      });
    }

    tileLayers.value = {};
    activeLayer.value = null;
  };

  // Cleanup on unmount
  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    // State
    currentMapType,
    tileLayers,
    activeLayer,
    isLoading,
    error,

    // Computed
    availableMapTypes,
    currentLayerConfig,

    // Methods
    initializeLayers,
    setMapType,
    updateMapType,
    addCustomLayer,
    removeCustomLayer,
    cleanup,

    // Constants
    TILE_LAYERS: allLayers
  };
}

export default useMapLayers;
