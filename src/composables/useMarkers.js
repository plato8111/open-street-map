/**
 * Composable for managing map markers
 * Handles marker creation, clustering, and interactions
 * @module useMarkers
 */

import { ref, computed, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import { CLUSTERING_CONFIG, LEAFLET_ICON_URLS } from '../config/constants.js';
import { markerLogger } from '../config/debug.js';

/**
 * @typedef {Object} MarkerData
 * @property {string|number} id - Unique marker identifier
 * @property {string} name - Marker display name
 * @property {number} lat - Latitude coordinate
 * @property {number} lng - Longitude coordinate
 * @property {string} [description] - Optional description
 * @property {Object} [originalItem] - Original data item
 */

/**
 * @typedef {Object} UseMarkersOptions
 * @property {Function} emit - Vue emit function for events
 * @property {Function} getContent - Function to get current content/props
 * @property {Function} [onMarkerClick] - Callback when marker is clicked
 */

/**
 * Composable for managing map markers with clustering support
 * @param {import('vue').Ref<L.Map|null>} mapRef - Reference to Leaflet map instance
 * @param {UseMarkersOptions} options - Configuration options
 * @returns {Object} Marker management state and methods
 *
 * @example
 * // Initialize the composable in a Vue component setup
 * import { ref } from 'vue';
 * import { useMarkers } from './composables/useMarkers';
 *
 * const mapRef = ref(null);
 * const emit = defineEmits(['trigger-event']);
 *
 * const {
 *   updateMarkers,
 *   selectedMarker,
 *   clearSelectedMarker,
 *   isClusteringEnabled,
 *   cleanup
 * } = useMarkers(mapRef, {
 *   emit,
 *   getContent: () => props.content,
 *   onMarkerClick: (eventData) => {
 *     console.log('Marker clicked:', eventData.marker);
 *   }
 * });
 *
 * // Update markers with data array
 * const markerData = [
 *   { id: '1', name: 'Location A', lat: 40.7128, lng: -74.0060 },
 *   { id: '2', name: 'Location B', lat: 34.0522, lng: -118.2437 },
 *   { id: '3', name: 'Location C', lat: 41.8781, lng: -87.6298 }
 * ];
 * updateMarkers(markerData);
 *
 * // Access selected marker after click
 * console.log(selectedMarker.value); // { id: '1', name: 'Location A', lat: 40.7128, lng: -74.0060 }
 *
 * // Clear selection
 * clearSelectedMarker();
 */
export function useMarkers(mapRef, options = {}) {
  const {
    emit = () => {},
    getContent = () => ({}),
    onMarkerClick = null
  } = options;

  // Layer refs
  const markersLayer = ref(null);
  const clusterGroup = ref(null);

  // State
  const selectedMarker = ref(null);
  const isLoading = ref(false);
  const error = ref(null);

  // Computed
  const content = computed(() => getContent());

  /**
   * Check if clustering is enabled
   * @returns {boolean}
   */
  const isClusteringEnabled = computed(() => {
    return content.value?.enableClustering ?? true;
  });

  /**
   * Get cluster max zoom level
   * @returns {number}
   */
  const clusterMaxZoom = computed(() => {
    return content.value?.clusterMaxZoom ?? CLUSTERING_CONFIG.DISABLE_CLUSTERING_AT_ZOOM;
  });

  /**
   * Process markers from content, resolving formulas if available
   * @param {Array} rawMarkers - Raw marker data
   * @returns {Array<MarkerData>} Processed markers
   */
  const processMarkers = (rawMarkers) => {
    if (!Array.isArray(rawMarkers)) return [];

    const useFormula = typeof wwLib !== 'undefined' && wwLib?.wwFormula?.useFormula;
    const { resolveMappingFormula } = useFormula ? useFormula() : {};

    return rawMarkers.map(marker => {
      if (!resolveMappingFormula) {
        return {
          id: marker.id || `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: marker.name || 'Untitled',
          lat: parseFloat(marker.lat) || 0,
          lng: parseFloat(marker.lng) || 0,
          description: marker.description || '',
          originalItem: marker
        };
      }

      const lat = resolveMappingFormula(content.value?.markersLatFormula, marker) ?? marker.lat;
      const lng = resolveMappingFormula(content.value?.markersLngFormula, marker) ?? marker.lng;
      const name = resolveMappingFormula(content.value?.markersNameFormula, marker) ?? marker.name;

      return {
        id: marker.id || `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: name || 'Untitled',
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
        description: marker.description || '',
        originalItem: marker
      };
    }).filter(marker =>
      !isNaN(marker.lat) &&
      !isNaN(marker.lng) &&
      marker.lat >= -90 &&
      marker.lat <= 90 &&
      marker.lng >= -180 &&
      marker.lng <= 180
    );
  };

  /**
   * Create marker click handler
   * @param {MarkerData} markerData - Marker data
   * @returns {Function} Click handler
   */
  const createMarkerClickHandler = (markerData) => {
    return () => {
      selectedMarker.value = markerData;

      const eventData = {
        marker: markerData,
        position: { lat: markerData.lat, lng: markerData.lng }
      };

      emit('trigger-event', {
        name: 'marker-click',
        event: eventData
      });

      if (onMarkerClick && typeof onMarkerClick === 'function') {
        onMarkerClick(eventData);
      }
    };
  };

  /**
   * Update markers on the map
   * @param {Array} rawMarkers - Raw marker data from content
   */
  const updateMarkers = (rawMarkers) => {
    const map = mapRef.value;
    if (!map || !map.getContainer()) return;

    try {
      isLoading.value = true;
      error.value = null;

      // Clear existing layers
      if (markersLayer.value) {
        map.removeLayer(markersLayer.value);
        markersLayer.value = null;
      }
      if (clusterGroup.value) {
        map.removeLayer(clusterGroup.value);
        clusterGroup.value = null;
      }

      const markers = processMarkers(rawMarkers);
      if (!markers.length) {
        isLoading.value = false;
        return;
      }

      if (isClusteringEnabled.value) {
        // Use clustering
        clusterGroup.value = L.markerClusterGroup({
          maxClusterRadius: CLUSTERING_CONFIG.MAX_CLUSTER_RADIUS,
          disableClusteringAtZoom: clusterMaxZoom.value,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          spiderfyOnMaxZoom: true
        });

        markers.forEach(markerData => {
          const marker = L.marker([markerData.lat, markerData.lng]);
          marker.on('click', createMarkerClickHandler(markerData));
          clusterGroup.value.addLayer(marker);
        });

        map.addLayer(clusterGroup.value);
      } else {
        // No clustering
        markersLayer.value = L.layerGroup();

        markers.forEach(markerData => {
          const marker = L.marker([markerData.lat, markerData.lng]);
          marker.on('click', createMarkerClickHandler(markerData));
          markersLayer.value.addLayer(marker);
        });

        map.addLayer(markersLayer.value);
      }

      isLoading.value = false;
    } catch (err) {
      isLoading.value = false;
      error.value = `Failed to update markers: ${err.message}`;
      markerLogger.warn('Error updating markers:', err.message);
    }
  };

  /**
   * Clear selected marker
   */
  const clearSelectedMarker = () => {
    selectedMarker.value = null;
  };

  /**
   * Get marker at specific coordinates
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} [tolerance=0.0001] - Coordinate tolerance
   * @returns {MarkerData|null} Marker data or null
   */
  const getMarkerAtCoords = (lat, lng, tolerance = 0.0001) => {
    const layer = clusterGroup.value || markersLayer.value;
    if (!layer) return null;

    let foundMarker = null;
    layer.eachLayer((marker) => {
      if (marker.getLatLng) {
        const pos = marker.getLatLng();
        if (Math.abs(pos.lat - lat) < tolerance && Math.abs(pos.lng - lng) < tolerance) {
          // Try to get marker data from click handler
          foundMarker = marker;
        }
      }
    });

    return foundMarker;
  };

  /**
   * Cleanup all markers
   */
  const cleanup = () => {
    const map = mapRef.value;

    if (map) {
      if (markersLayer.value && map.hasLayer(markersLayer.value)) {
        map.removeLayer(markersLayer.value);
      }
      if (clusterGroup.value && map.hasLayer(clusterGroup.value)) {
        map.removeLayer(clusterGroup.value);
      }
    }

    markersLayer.value = null;
    clusterGroup.value = null;
    selectedMarker.value = null;
    error.value = null;
  };

  // Cleanup on unmount
  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    // Layer refs
    markersLayer,
    clusterGroup,

    // State
    selectedMarker,
    isLoading,
    error,

    // Computed
    isClusteringEnabled,
    clusterMaxZoom,

    // Methods
    processMarkers,
    updateMarkers,
    clearSelectedMarker,
    getMarkerAtCoords,
    cleanup
  };
}

export default useMarkers;
