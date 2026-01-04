/**
 * Composable for managing geographic boundary layers
 * Handles country and state boundaries, selection, and hover effects
 */

import { ref, computed, watch, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import { boundaryAPI, getSupabaseClient, validateBounds, parseGISError } from '../api/supabaseClient.js';
import { useRequestDeduplication, generateCacheKey } from './useRequestDeduplication.js';
import { useRetry } from './useRetry.js';
import { boundaryLogger } from '../config/debug.js';

/**
 * Default boundary styling
 */
export const DEFAULT_STYLES = {
  country: {
    border: { color: '#666666', width: 1, opacity: 0.5 },
    hover: { color: '#ff0000', opacity: 0.3 },
    selected: { color: '#0000ff', opacity: 0.5 }
  },
  state: {
    border: { color: '#666666', width: 1, opacity: 0.5 },
    hover: { color: '#ff0000', opacity: 0.3 },
    selected: { color: '#0000ff', opacity: 0.5 }
  }
};

/**
 * Composable for managing geographic boundaries
 * @param {Ref<L.Map|null>} mapRef - Reference to Leaflet map instance
 * @param {Object} options - Configuration options
 * @returns {Object} Boundary management state and methods
 *
 * @example
 * // Initialize the composable in a Vue component setup
 * import { ref } from 'vue';
 * import { useBoundaries } from './composables/useBoundaries';
 *
 * const mapRef = ref(null);
 * const emit = defineEmits(['trigger-event']);
 *
 * const {
 *   loadCountryBoundaries,
 *   loadStateBoundaries,
 *   selectedCountries,
 *   selectedStates,
 *   selectCountry,
 *   deselectCountry,
 *   findCountryAtPoint,
 *   isLoading,
 *   error
 * } = useBoundaries(mapRef, {
 *   emit,
 *   getContent: () => props.content,
 *   enableCountries: true,
 *   enableStates: true
 * });
 *
 * // Load country boundaries for current map view
 * await loadCountryBoundaries();
 *
 * // Load state boundaries (optionally filtered by country)
 * await loadStateBoundaries('USA');
 *
 * // Programmatically select a country
 * selectCountry('country-id-123');
 *
 * // Check selected countries
 * console.log([...selectedCountries.value]); // ['country-id-123']
 *
 * // Find which country contains a specific point
 * const country = await findCountryAtPoint(40.7128, -74.0060);
 * console.log(country); // { id: '...', name: 'United States', iso_a2: 'US', ... }
 *
 * // Handle selection events (configured via emit)
 * // Events: 'country-selected', 'country-deselected', 'country-click',
 * //         'state-selected', 'state-deselected', 'state-click'
 */
export function useBoundaries(mapRef, options = {}) {
  const {
    emit = () => {},
    getContent = () => ({}),
    enableCountries = true,
    enableStates = true,
    useVectorTiles = false
  } = options;

  // Initialize composables
  const requestDedupe = useRequestDeduplication({ maxCacheAge: 30000 }); // 30s cache
  const retryHandler = useRetry({ maxRetries: 2, baseDelay: 500 });

  // Layer refs
  const countryBoundaryLayer = ref(null);
  const stateBoundaryLayer = ref(null);

  // Selection state
  const selectedCountries = ref(new Set());
  const selectedStates = ref(new Set());
  const hoveredCountry = ref(null);
  const hoveredState = ref(null);

  // Loading state
  const isLoading = ref(false);
  const error = ref(null);
  const countriesLoaded = ref(false);
  const statesLoaded = ref(false);

  /**
   * Get current content/props
   */
  const content = computed(() => getContent());

  /**
   * Get boundary styles from content
   */
  const countryStyles = computed(() => ({
    border: {
      color: content.value?.countryBorderColor || DEFAULT_STYLES.country.border.color,
      width: content.value?.countryBorderWidth || DEFAULT_STYLES.country.border.width,
      opacity: content.value?.countryBorderOpacity || DEFAULT_STYLES.country.border.opacity
    },
    hover: {
      color: content.value?.countryHoverColor || DEFAULT_STYLES.country.hover.color,
      opacity: content.value?.countryHoverOpacity || DEFAULT_STYLES.country.hover.opacity
    },
    selected: {
      color: content.value?.countrySelectedColor || DEFAULT_STYLES.country.selected.color,
      opacity: content.value?.countrySelectedOpacity || DEFAULT_STYLES.country.selected.opacity
    }
  }));

  const stateStyles = computed(() => ({
    border: {
      color: content.value?.stateBorderColor || DEFAULT_STYLES.state.border.color,
      width: content.value?.stateBorderWidth || DEFAULT_STYLES.state.border.width,
      opacity: content.value?.stateBorderOpacity || DEFAULT_STYLES.state.border.opacity
    },
    hover: {
      color: content.value?.stateHoverColor || DEFAULT_STYLES.state.hover.color,
      opacity: content.value?.stateHoverOpacity || DEFAULT_STYLES.state.hover.opacity
    },
    selected: {
      color: content.value?.stateSelectedColor || DEFAULT_STYLES.state.selected.color,
      opacity: content.value?.stateSelectedOpacity || DEFAULT_STYLES.state.selected.opacity
    }
  }));

  /**
   * Get default style for a country feature
   */
  const getCountryStyle = (feature) => {
    const styles = countryStyles.value;
    const isSelected = selectedCountries.value.has(feature?.properties?.id);

    return {
      fillColor: isSelected ? styles.selected.color : 'transparent',
      fillOpacity: isSelected ? styles.selected.opacity : 0,
      color: styles.border.color,
      weight: styles.border.width,
      opacity: styles.border.opacity
    };
  };

  /**
   * Get default style for a state feature
   */
  const getStateStyle = (feature) => {
    const styles = stateStyles.value;
    const isSelected = selectedStates.value.has(feature?.properties?.id);

    return {
      fillColor: isSelected ? styles.selected.color : 'transparent',
      fillOpacity: isSelected ? styles.selected.opacity : 0,
      color: styles.border.color,
      weight: styles.border.width,
      opacity: styles.border.opacity
    };
  };

  /**
   * Handle country hover events
   */
  const onCountryHover = (e, feature) => {
    const layer = e.target;
    const styles = countryStyles.value;
    const isSelected = selectedCountries.value.has(feature?.properties?.id);

    if (!isSelected) {
      layer.setStyle({
        fillColor: styles.hover.color,
        fillOpacity: styles.hover.opacity
      });
    }

    hoveredCountry.value = feature?.properties;

    emit('trigger-event', {
      name: 'country-hover',
      event: {
        country: feature?.properties || {},
        coordinates: { lat: e.latlng.lat, lng: e.latlng.lng }
      }
    });
  };

  /**
   * Handle country hover out events
   */
  const onCountryHoverOut = (e, feature) => {
    const layer = e.target;
    layer.setStyle(getCountryStyle(feature));

    const previousHovered = hoveredCountry.value;
    hoveredCountry.value = null;

    emit('trigger-event', {
      name: 'country-hover-out',
      event: { country: previousHovered || {} }
    });
  };

  /**
   * Handle country click events
   */
  const onCountryClick = (e, feature, layer) => {
    L.DomEvent.stopPropagation(e);

    const countryId = feature?.properties?.id;
    if (!countryId) return;

    const isCurrentlySelected = selectedCountries.value.has(countryId);
    let action;

    if (isCurrentlySelected) {
      // Deselect
      selectedCountries.value.delete(countryId);
      layer.setStyle(getCountryStyle(feature));
      action = 'deselected';

      emit('trigger-event', {
        name: 'country-deselected',
        event: { country: feature?.properties || {} }
      });
    } else {
      // Select
      selectedCountries.value.add(countryId);
      const styles = countryStyles.value;
      layer.setStyle({
        fillColor: styles.selected.color,
        fillOpacity: styles.selected.opacity
      });
      action = 'selected';

      emit('trigger-event', {
        name: 'country-selected',
        event: { country: feature?.properties || {} }
      });
    }

    emit('trigger-event', {
      name: 'country-click',
      event: {
        country: feature?.properties || {},
        coordinates: { lat: e.latlng.lat, lng: e.latlng.lng },
        action
      }
    });
  };

  /**
   * Handle state hover events
   */
  const onStateHover = (e, feature) => {
    const layer = e.target;
    const styles = stateStyles.value;
    const isSelected = selectedStates.value.has(feature?.properties?.id);

    if (!isSelected) {
      layer.setStyle({
        fillColor: styles.hover.color,
        fillOpacity: styles.hover.opacity
      });
    }

    hoveredState.value = feature?.properties;

    emit('trigger-event', {
      name: 'state-hover',
      event: {
        state: feature?.properties || {},
        coordinates: { lat: e.latlng.lat, lng: e.latlng.lng }
      }
    });
  };

  /**
   * Handle state hover out events
   */
  const onStateHoverOut = (e, feature) => {
    const layer = e.target;
    layer.setStyle(getStateStyle(feature));

    const previousHovered = hoveredState.value;
    hoveredState.value = null;

    emit('trigger-event', {
      name: 'state-hover-out',
      event: { state: previousHovered || {} }
    });
  };

  /**
   * Handle state click events
   */
  const onStateClick = (e, feature, layer) => {
    L.DomEvent.stopPropagation(e);

    const stateId = feature?.properties?.id;
    if (!stateId) return;

    const isCurrentlySelected = selectedStates.value.has(stateId);
    let action;

    if (isCurrentlySelected) {
      // Deselect
      selectedStates.value.delete(stateId);
      layer.setStyle(getStateStyle(feature));
      action = 'deselected';

      emit('trigger-event', {
        name: 'state-deselected',
        event: { state: feature?.properties || {} }
      });
    } else {
      // Select
      selectedStates.value.add(stateId);
      const styles = stateStyles.value;
      layer.setStyle({
        fillColor: styles.selected.color,
        fillOpacity: styles.selected.opacity
      });
      action = 'selected';

      emit('trigger-event', {
        name: 'state-selected',
        event: { state: feature?.properties || {} }
      });
    }

    emit('trigger-event', {
      name: 'state-click',
      event: {
        state: feature?.properties || {},
        coordinates: { lat: e.latlng.lat, lng: e.latlng.lng },
        action
      }
    });
  };

  /**
   * Load country boundaries
   */
  const loadCountryBoundaries = async () => {
    const map = mapRef.value;
    if (!map || !enableCountries) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Validate bounds
    const boundsValidation = validateBounds(bounds);
    if (!boundsValidation.valid) {
      error.value = boundsValidation.error;
      return;
    }

    // Check zoom level constraints
    const minZoom = content.value?.countryMinZoom ?? 1;
    const maxZoom = content.value?.countryMaxZoom ?? 7;

    if (zoom < minZoom || zoom > maxZoom) {
      // Hide countries at this zoom level
      if (countryBoundaryLayer.value && map.hasLayer(countryBoundaryLayer.value)) {
        map.removeLayer(countryBoundaryLayer.value);
      }
      return;
    }

    // Generate cache key for deduplication
    const cacheKey = generateCacheKey('countries', {
      south: boundsValidation.south,
      west: boundsValidation.west,
      north: boundsValidation.north,
      east: boundsValidation.east,
      zoom
    });

    try {
      isLoading.value = true;
      error.value = null;

      // Use request deduplication
      const countries = await requestDedupe.executeRequest(cacheKey, async () => {
        return await retryHandler.executeWithRetry(async () => {
          return await boundaryAPI.getCountriesInBounds(bounds, zoom);
        });
      });

      if (!countries || countries.length === 0) {
        isLoading.value = false;
        return;
      }

      // Convert to GeoJSON
      const geojson = boundaryAPI.toGeoJSON(countries);

      // Remove existing layer
      if (countryBoundaryLayer.value && map.hasLayer(countryBoundaryLayer.value)) {
        map.removeLayer(countryBoundaryLayer.value);
      }

      // Create new layer
      countryBoundaryLayer.value = L.geoJSON(geojson, {
        style: getCountryStyle,
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: (e) => onCountryHover(e, feature),
            mouseout: (e) => onCountryHoverOut(e, feature),
            click: (e) => onCountryClick(e, feature, layer)
          });
        }
      });

      countryBoundaryLayer.value.addTo(map);
      countriesLoaded.value = true;

      emit('trigger-event', {
        name: 'countries-loaded',
        event: { countriesCount: countries.length }
      });

    } catch (err) {
      const parsedError = parseGISError(err);
      error.value = parsedError.message;

      emit('trigger-event', {
        name: 'boundary-load-error',
        event: { error: parsedError.message, type: 'countries' }
      });
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load state boundaries
   */
  const loadStateBoundaries = async (countryFilter = null) => {
    const map = mapRef.value;
    if (!map || !enableStates) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Validate bounds
    const boundsValidation = validateBounds(bounds);
    if (!boundsValidation.valid) {
      error.value = boundsValidation.error;
      return;
    }

    // Check zoom level constraints
    const minZoom = content.value?.stateMinZoom ?? 4;
    const maxZoom = content.value?.stateMaxZoom ?? 7;

    if (zoom < minZoom || zoom > maxZoom) {
      // Hide states at this zoom level
      if (stateBoundaryLayer.value && map.hasLayer(stateBoundaryLayer.value)) {
        map.removeLayer(stateBoundaryLayer.value);
      }
      return;
    }

    // Generate cache key for deduplication
    const cacheKey = generateCacheKey('states', {
      south: boundsValidation.south,
      west: boundsValidation.west,
      north: boundsValidation.north,
      east: boundsValidation.east,
      zoom,
      country: countryFilter
    });

    try {
      isLoading.value = true;
      error.value = null;

      // Use request deduplication
      const states = await requestDedupe.executeRequest(cacheKey, async () => {
        return await retryHandler.executeWithRetry(async () => {
          return await boundaryAPI.getStatesInBounds(bounds, zoom, countryFilter);
        });
      });

      if (!states || states.length === 0) {
        isLoading.value = false;
        return;
      }

      // Convert to GeoJSON
      const geojson = boundaryAPI.toGeoJSON(states);

      // Remove existing layer
      if (stateBoundaryLayer.value && map.hasLayer(stateBoundaryLayer.value)) {
        map.removeLayer(stateBoundaryLayer.value);
      }

      // Create new layer
      stateBoundaryLayer.value = L.geoJSON(geojson, {
        style: getStateStyle,
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: (e) => onStateHover(e, feature),
            mouseout: (e) => onStateHoverOut(e, feature),
            click: (e) => onStateClick(e, feature, layer)
          });
        }
      });

      stateBoundaryLayer.value.addTo(map);
      statesLoaded.value = true;

      emit('trigger-event', {
        name: 'states-loaded',
        event: { statesCount: states.length }
      });

    } catch (err) {
      const parsedError = parseGISError(err);
      error.value = parsedError.message;

      emit('trigger-event', {
        name: 'boundary-load-error',
        event: { error: parsedError.message, type: 'states' }
      });
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Update all boundaries based on current map state
   */
  const updateBoundaries = async () => {
    await Promise.all([
      loadCountryBoundaries(),
      loadStateBoundaries()
    ]);
  };

  /**
   * Clear all selections
   */
  const clearSelections = () => {
    selectedCountries.value.clear();
    selectedStates.value.clear();

    // Update layer styles
    if (countryBoundaryLayer.value) {
      countryBoundaryLayer.value.eachLayer(layer => {
        layer.setStyle(getCountryStyle(layer.feature));
      });
    }

    if (stateBoundaryLayer.value) {
      stateBoundaryLayer.value.eachLayer(layer => {
        layer.setStyle(getStateStyle(layer.feature));
      });
    }
  };

  /**
   * Select a country by ID
   */
  const selectCountry = (countryId) => {
    selectedCountries.value.add(countryId);

    if (countryBoundaryLayer.value) {
      countryBoundaryLayer.value.eachLayer(layer => {
        if (layer.feature?.properties?.id === countryId) {
          const styles = countryStyles.value;
          layer.setStyle({
            fillColor: styles.selected.color,
            fillOpacity: styles.selected.opacity
          });
        }
      });
    }
  };

  /**
   * Deselect a country by ID
   */
  const deselectCountry = (countryId) => {
    selectedCountries.value.delete(countryId);

    if (countryBoundaryLayer.value) {
      countryBoundaryLayer.value.eachLayer(layer => {
        if (layer.feature?.properties?.id === countryId) {
          layer.setStyle(getCountryStyle(layer.feature));
        }
      });
    }
  };

  /**
   * Select a state by ID
   */
  const selectState = (stateId) => {
    selectedStates.value.add(stateId);

    if (stateBoundaryLayer.value) {
      stateBoundaryLayer.value.eachLayer(layer => {
        if (layer.feature?.properties?.id === stateId) {
          const styles = stateStyles.value;
          layer.setStyle({
            fillColor: styles.selected.color,
            fillOpacity: styles.selected.opacity
          });
        }
      });
    }
  };

  /**
   * Deselect a state by ID
   */
  const deselectState = (stateId) => {
    selectedStates.value.delete(stateId);

    if (stateBoundaryLayer.value) {
      stateBoundaryLayer.value.eachLayer(layer => {
        if (layer.feature?.properties?.id === stateId) {
          layer.setStyle(getStateStyle(layer.feature));
        }
      });
    }
  };

  /**
   * Find country at a point
   */
  const findCountryAtPoint = async (lat, lng) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      const { data, error: rpcError } = await supabase
        .schema('gis')
        .rpc('find_country_at_point', { point_lat: lat, point_lng: lng });

      if (rpcError || !data || data.length === 0) return null;

      return {
        id: data[0].id,
        name: data[0].name,
        name_en: data[0].name_en,
        iso_a2: data[0].iso_a2,
        iso_a3: data[0].iso_a3,
        properties: data[0].properties
      };
    } catch (err) {
      boundaryLogger.error('Error finding country:', err);
      return null;
    }
  };

  /**
   * Find state at a point
   */
  const findStateAtPoint = async (lat, lng, countryId = null) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      const { data, error: rpcError } = await supabase
        .schema('gis')
        .rpc('find_state_at_point', {
          point_lat: lat,
          point_lng: lng,
          p_country_id: countryId
        });

      if (rpcError || !data || data.length === 0) return null;

      return {
        id: data[0].id,
        name: data[0].name,
        name_en: data[0].name_en,
        iso_a2: data[0].iso_a2,
        adm1_code: data[0].adm1_code,
        admin: data[0].admin,
        country_id: data[0].country_id,
        properties: data[0].properties
      };
    } catch (err) {
      boundaryLogger.error('Error finding state:', err);
      return null;
    }
  };

  /**
   * Cleanup layers and state
   */
  const cleanup = () => {
    const map = mapRef.value;

    if (map) {
      if (countryBoundaryLayer.value && map.hasLayer(countryBoundaryLayer.value)) {
        map.removeLayer(countryBoundaryLayer.value);
      }
      if (stateBoundaryLayer.value && map.hasLayer(stateBoundaryLayer.value)) {
        map.removeLayer(stateBoundaryLayer.value);
      }
    }

    countryBoundaryLayer.value = null;
    stateBoundaryLayer.value = null;
    selectedCountries.value.clear();
    selectedStates.value.clear();
    hoveredCountry.value = null;
    hoveredState.value = null;
    countriesLoaded.value = false;
    statesLoaded.value = false;
    error.value = null;

    requestDedupe.cancelAll();
    requestDedupe.clearCache();
  };

  // Cleanup on unmount
  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    // Layer refs
    countryBoundaryLayer,
    stateBoundaryLayer,

    // Selection state
    selectedCountries,
    selectedStates,
    hoveredCountry,
    hoveredState,

    // Loading state
    isLoading,
    error,
    countriesLoaded,
    statesLoaded,

    // Style getters
    countryStyles,
    stateStyles,
    getCountryStyle,
    getStateStyle,

    // Loading methods
    loadCountryBoundaries,
    loadStateBoundaries,
    updateBoundaries,

    // Selection methods
    clearSelections,
    selectCountry,
    deselectCountry,
    selectState,
    deselectState,

    // Query methods
    findCountryAtPoint,
    findStateAtPoint,

    // Cleanup
    cleanup
  };
}

export default useBoundaries;
