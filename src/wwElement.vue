<template>
  <div class="openstreet-map" :style="mapContainerStyle">
    <!-- Map Container -->
    <div ref="mapContainer" class="map-container" :style="mapStyle"></div>

    <!-- Map Type Selector -->
    <div v-if="content?.allowMapTypeSelection" class="map-type-selector">
      <select
        :value="currentMapType"
        @change="onMapTypeChange($event.target.value)"
        class="map-type-select"
      >
        <option value="osm">OpenStreetMap</option>
        <option value="satellite">Satellite</option>
        <option value="terrain">Terrain</option>
        <option value="dark">Dark Theme</option>
        <option value="light">Light Theme</option>
      </select>
    </div>

    <!-- Overlay Dropzone -->
    <div
      v-if="content?.showOverlay"
      class="map-overlay"
      :class="overlayPositionClass"
      :style="overlayStyle"
    >
      <wwLayout path="overlayDropzone" class="overlay-container" />
    </div>

    <!-- Loading Indicator -->
    <div v-if="boundariesLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span class="loading-text">Loading boundaries...</span>
    </div>

    <!-- GIS Setup Error -->
    <div v-if="gisSetupError && !boundariesLoading" class="gis-error-notice">
      <div class="error-icon">⚠️</div>
      <span class="error-text">{{ gisSetupError }}</span>
    </div>

    <!-- Location Instructions -->
    <div v-if="showLocationInstructions" class="location-instructions">
      <p v-if="!geolocationRequested && content?.allowClickToMark">
        Click on the map to mark your location
      </p>
      <p v-else-if="geolocationDenied && content?.allowClickToMark">
        Location access denied. Click on the map to mark your location
      </p>
    </div>
  </div>
</template>

<script>
/**
 * OpenStreetMap WeWeb Component
 * A comprehensive interactive map component with boundaries, markers, and geolocation
 * @module OpenStreetMap
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.heat';
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

// Constants
import {
  LEAFLET_ICON_URLS,
  MAP_DEFAULTS,
  STYLE_DEFAULTS,
  ZOOM_THRESHOLDS,
  UI_TIMING,
  GEOCODING_CONFIG,
  CONVERSION_FACTORS
} from './config/constants.js';
import { mapLogger } from './config/debug.js';

// Composables
import { useMapLayers } from './composables/useMapLayers.js';
import { useBoundaries } from './composables/useBoundaries.js';
import { useGeolocation, generateRandomOffset } from './composables/useGeolocation.js';
import { useMarkers } from './composables/useMarkers.js';
import { useHeatmap, HARDINESS_ZONE_COLORS } from './composables/useHeatmap.js';

// API clients
import { getSupabaseClient, validateGISSetup, parseGISError } from './api/supabaseClient.js';
import { vectorTileClient } from './api/vectorTileClient.js';

// Fix Leaflet's default marker icon issue using constants
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: LEAFLET_ICON_URLS.MARKER_ICON_RETINA,
  iconUrl: LEAFLET_ICON_URLS.MARKER_ICON,
  shadowUrl: LEAFLET_ICON_URLS.MARKER_SHADOW
});

export default {
  name: 'OpenStreetMap',
  props: {
    uid: { type: String, required: true },
    content: { type: Object, required: true },
    /* wwEditor:start */
    wwEditorState: { type: Object, required: true },
    /* wwEditor:end */
  },

  setup(props, { emit }) {
    // ==========================================================================
    // WWLIB AVAILABILITY CHECK
    // ==========================================================================

    /** @type {boolean} Whether wwLib is available */
    const hasWwLib = typeof wwLib !== 'undefined' &&
                     wwLib &&
                     wwLib.wwVariable &&
                     typeof wwLib.wwVariable.useComponentVariable === 'function';

    // ==========================================================================
    // EDITOR STATE
    // ==========================================================================

    /* wwEditor:start */
    /** @type {import('vue').ComputedRef<boolean>} Whether component is in edit mode */
    const isEditing = computed(() => props.wwEditorState?.isEditing);
    /* wwEditor:end */

    // ==========================================================================
    // REFS - Map and Container
    // ==========================================================================

    /** @type {import('vue').Ref<L.Map|null>} Leaflet map instance */
    const map = ref(null);

    /** @type {import('vue').Ref<HTMLElement|null>} Map container element */
    const mapContainer = ref(null);

    /** @type {import('vue').Ref<ResizeObserver|null>} Resize observer for container */
    const resizeObserver = ref(null);

    /** @type {import('vue').Ref<number|null>} Resize debounce timeout */
    const resizeTimeout = ref(null);

    // ==========================================================================
    // REFS - Selection State
    // ==========================================================================

    /** @type {import('vue').Ref<Set<string|number>>} Selected country IDs */
    const selectedCountries = ref(new Set());

    /** @type {import('vue').Ref<Set<string|number>>} Selected state IDs */
    const selectedStates = ref(new Set());

    /** @type {import('vue').Ref<Array>} Selected location points */
    const selectedLocations = ref([]);

    /** @type {import('vue').Ref<Object|null>} Currently selected country */
    const selectedCountry = ref(null);

    /** @type {import('vue').Ref<Object|null>} Currently selected state */
    const selectedState = ref(null);

    /** @type {import('vue').Ref<L.LayerGroup|null>} Selected location markers layer */
    const selectedLocationMarkers = ref(null);

    // ==========================================================================
    // REFS - Loading and Error State
    // ==========================================================================

    /** @type {import('vue').Ref<boolean>} Whether boundaries are loading */
    const boundariesLoading = ref(false);

    /** @type {import('vue').Ref<string|null>} GIS setup error message */
    const gisSetupError = ref(null);

    /** @type {import('vue').Ref<number|null>} Geocoding debounce timer */
    const geocodingDebounceTimer = ref(null);

    // ==========================================================================
    // INTERNAL VARIABLES FOR NOCODE USERS
    // ==========================================================================

    /**
     * Helper to create component variable with fallback
     * @param {string} name - Variable name
     * @param {string} type - Variable type
     * @param {*} defaultValue - Default value
     * @returns {{value: import('vue').Ref, setValue: Function}}
     */
    const createComponentVariable = (name, type, defaultValue) => {
      if (hasWwLib) {
        return wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name,
          type,
          defaultValue,
        });
      }
      return { value: ref(defaultValue), setValue: () => {} };
    };

    const { value: selectedLocation, setValue: setSelectedLocation } =
      createComponentVariable('selectedLocation', 'object', null);

    const { value: userLocation, setValue: setUserLocation } =
      createComponentVariable('userLocation', 'object', null);

    const { value: clickedLocation, setValue: setClickedLocation } =
      createComponentVariable('clickedLocation', 'object', null);

    const { value: selectedCountriesData, setValue: setSelectedCountriesData } =
      createComponentVariable('selectedCountries', 'array', []);

    const { value: selectedStatesData, setValue: setSelectedStatesData } =
      createComponentVariable('selectedStates', 'array', []);

    const { value: selectedLocationsData, setValue: setSelectedLocationsData } =
      createComponentVariable('selectedLocations', 'array', []);

    const { value: selectedCountryData, setValue: setSelectedCountryData } =
      createComponentVariable('selectedCountry', 'object', null);

    const { value: selectedStateData, setValue: setSelectedStateData } =
      createComponentVariable('selectedState', 'object', null);

    const { value: geocodedAddress, setValue: setGeocodedAddress } =
      createComponentVariable('geocodedAddress', 'object', null);

    const { value: currentZoomLevel, setValue: setCurrentZoomLevel } =
      createComponentVariable('currentZoomLevel', 'number', MAP_DEFAULTS.INITIAL_ZOOM);

    const { value: locationContext, setValue: setLocationContext } =
      createComponentVariable('locationContext', 'object', null);

    // NEW: Map bounds internal variable
    const { value: mapBounds, setValue: setMapBounds } =
      createComponentVariable('mapBounds', 'object', null);

    // ==========================================================================
    // INITIALIZE COMPOSABLES
    // ==========================================================================

    /** Content getter for composables */
    const getContent = () => props.content;

    // Map Layers Composable
    const mapLayersComposable = useMapLayers(map, {
      initialMapType: props.content?.mapType || MAP_DEFAULTS.MAP_TYPE,
      allowMapTypeSelection: props.content?.allowMapTypeSelection ?? true
    });

    // Boundaries Composable
    const boundariesComposable = useBoundaries(map, {
      emit,
      getContent,
      enableCountries: true,
      enableStates: true,
      useVectorTiles: props.content?.useVectorTiles ?? true
    });

    // Geolocation Composable
    const geolocationComposable = useGeolocation(map, {
      emit,
      getContent,
      onLocationGranted: (pos) => {
        setUserLocation({
          lat: pos.lat,
          lng: pos.lng,
          timestamp: new Date().toISOString()
        });

        if (props.content?.enableReverseGeocoding) {
          debouncedReverseGeocode(pos.lat, pos.lng, 'user-location-geocoded');
        }
      },
      onLocationDenied: () => {
        // Handled by composable
      }
    });

    // Markers Composable
    const markersComposable = useMarkers(map, {
      emit,
      getContent,
      onMarkerClick: (eventData) => {
        setSelectedLocation(eventData);
      }
    });

    // Heatmap Composable
    const heatmapComposable = useHeatmap(map, { getContent });

    // ==========================================================================
    // COMPUTED STYLES
    // ==========================================================================

    /** @type {import('vue').ComputedRef<Object>} Container style object */
    const mapContainerStyle = computed(() => ({
      '--border-radius': props.content?.mapStyle || '8px',
      height: props.content?.mapHeight || MAP_DEFAULTS.MAP_HEIGHT
    }));

    /** @type {import('vue').ComputedRef<Object>} Map element style */
    const mapStyle = computed(() => ({
      borderRadius: 'var(--border-radius)',
      overflow: 'hidden'
    }));

    /** @type {import('vue').ComputedRef<string>} Overlay position class */
    const overlayPositionClass = computed(() => {
      const pos = props.content?.overlayPosition || 'top-right';
      return `overlay-${pos}`;
    });

    /** @type {import('vue').ComputedRef<Object>} Overlay style object */
    const overlayStyle = computed(() => ({
      '--overlay-padding': props.content?.overlayPadding || '16px'
    }));

    // ==========================================================================
    // COMPUTED PROPERTIES
    // ==========================================================================

    /** @type {import('vue').ComputedRef<string>} Current map type */
    const currentMapType = computed(() =>
      props.content?.mapType || MAP_DEFAULTS.MAP_TYPE
    );

    /** @type {import('vue').ComputedRef<boolean>} Whether to show location instructions */
    const showLocationInstructions = computed(() =>
      props.content?.allowClickToMark &&
      (!geolocationComposable.showUserLocation.value || geolocationComposable.geolocationDenied.value)
    );

    /** Expose composable state for template */
    const geolocationRequested = geolocationComposable.geolocationRequested;
    const geolocationDenied = geolocationComposable.geolocationDenied;

    // ==========================================================================
    // HELPER METHODS
    // ==========================================================================

    /**
     * Safely invalidate map size
     */
    const safeInvalidateSize = () => {
      if (!map.value) return;

      const container = map.value.getContainer();
      if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) return;

      const mapPane = container.querySelector('.leaflet-map-pane');
      if (!mapPane) return;

      try {
        map.value.invalidateSize();
      } catch (error) {
        mapLogger.debug('Error invalidating size:', error.message);
      }
    };

    /**
     * Setup resize observer for container
     */
    const setupResizeObserver = () => {
      const frontWindow = (typeof wwLib !== 'undefined' && wwLib?.getFrontWindow?.()) ||
                          (typeof window !== 'undefined' ? window : null);

      if (!mapContainer.value || !frontWindow?.ResizeObserver) return;

      resizeObserver.value = new frontWindow.ResizeObserver(() => {
        clearTimeout(resizeTimeout.value);
        resizeTimeout.value = setTimeout(() => {
          safeInvalidateSize();
        }, UI_TIMING.RESIZE_DEBOUNCE_MS);
      });

      resizeObserver.value.observe(mapContainer.value);
    };

    /**
     * Update map bounds internal variable
     */
    const updateMapBoundsVariable = () => {
      if (!map.value) return;

      try {
        const bounds = map.value.getBounds();
        const center = map.value.getCenter();
        const zoom = map.value.getZoom();

        const boundsData = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
          center: { lat: center.lat, lng: center.lng },
          zoom
        };

        setMapBounds(boundsData);
        setCurrentZoomLevel(zoom);

        emit('trigger-event', {
          name: 'map-bounds-change',
          event: {
            bounds: boundsData,
            zoom,
            center: { lat: center.lat, lng: center.lng }
          }
        });
      } catch (error) {
        mapLogger.debug('Error updating bounds:', error.message);
      }
    };

    /**
     * Update selection internal variables
     */
    const updateSelectionVariables = () => {
      // Update countries data
      const countriesData = Array.from(selectedCountries.value).map(id => {
        let countryData = null;
        if (boundariesComposable.countryBoundaryLayer.value) {
          boundariesComposable.countryBoundaryLayer.value.eachLayer(layer => {
            if (layer.feature?.properties?.id === id) {
              countryData = layer.feature.properties;
            }
          });
        }
        return countryData;
      }).filter(Boolean);

      setSelectedCountriesData(countriesData);

      // Update states data
      const statesData = Array.from(selectedStates.value).map(id => {
        let stateData = null;
        if (boundariesComposable.stateBoundaryLayer.value) {
          boundariesComposable.stateBoundaryLayer.value.eachLayer(layer => {
            if (layer.feature?.properties?.id === id) {
              stateData = layer.feature.properties;
            }
          });
        }
        return stateData;
      }).filter(Boolean);

      setSelectedStatesData(statesData);
      setSelectedLocationsData(selectedLocations.value);
    };

    /**
     * Update selected location markers on map
     */
    const updateSelectedLocationMarkers = () => {
      if (!map.value) return;

      if (selectedLocationMarkers.value) {
        map.value.removeLayer(selectedLocationMarkers.value);
      }

      selectedLocationMarkers.value = L.layerGroup();
      const markerColor = props.content?.selectedLocationMarkerColor || STYLE_DEFAULTS.SELECTED_LOCATION_MARKER_COLOR;

      selectedLocations.value.forEach(location => {
        const marker = L.marker([location.lat, location.lng], {
          icon: L.divIcon({
            className: 'selected-location-marker',
            html: `<div class="selected-location-dot" style="background-color: ${markerColor}; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          handleLocationDeselection(location);
        });

        selectedLocationMarkers.value.addLayer(marker);
      });

      selectedLocationMarkers.value.addTo(map.value);
    };

    /**
     * Handle location deselection
     * @param {Object} location - Location to deselect
     */
    const handleLocationDeselection = (location) => {
      selectedLocations.value = selectedLocations.value.filter(loc => loc.id !== location.id);

      // Handle parent state deselection
      const parentStateId = location.parentState?.id;
      if (parentStateId) {
        const hasOtherLocationsInState = selectedLocations.value.some(
          loc => loc.parentState?.id === parentStateId
        );

        if (!hasOtherLocationsInState) {
          selectedStates.value.delete(parentStateId);
          updateBoundaryStyle(boundariesComposable.stateBoundaryLayer.value, parentStateId, 'transparent', 0);

          // Check parent country
          const parentCountryId = location.parentCountry?.id;
          if (parentCountryId) {
            const hasOtherInCountry = selectedLocations.value.some(
              loc => loc.parentCountry?.id === parentCountryId
            );

            if (!hasOtherInCountry) {
              selectedCountries.value.delete(parentCountryId);
              updateBoundaryStyle(boundariesComposable.countryBoundaryLayer.value, parentCountryId, 'transparent', 0);
            }
          }
        }
      }

      updateSelectedLocationMarkers();
      updateSelectionVariables();
      updateLocationContext();

      emit('trigger-event', {
        name: 'location-deselected',
        event: { location, position: { lat: location.lat, lng: location.lng } }
      });
    };

    /**
     * Update boundary layer style for a specific feature
     * @param {L.GeoJSON|null} layer - Boundary layer
     * @param {string|number} featureId - Feature ID
     * @param {string} fillColor - Fill color
     * @param {number} fillOpacity - Fill opacity
     */
    const updateBoundaryStyle = (layer, featureId, fillColor, fillOpacity) => {
      if (!layer) return;
      layer.eachLayer(l => {
        if (l.feature?.properties?.id === featureId) {
          l.setStyle({ fillColor, fillOpacity });
        }
      });
    };

    /**
     * Update location context based on current selections
     */
    const updateLocationContext = () => {
      const zoom = map.value?.getZoom() || MAP_DEFAULTS.INITIAL_ZOOM;
      const threshold = props.content?.locationZoomThreshold || ZOOM_THRESHOLDS.LOCATION_ZOOM_THRESHOLD;

      const contextData = {
        mode: zoom >= threshold ? 'location' : 'boundary',
        zoom,
        countries: selectedCountriesData.value || [],
        states: selectedStatesData.value || [],
        locations: zoom >= threshold ? (selectedLocationsData.value || []) : []
      };

      // Build hierarchical location string
      const parts = [];
      if (selectedCountriesData.value?.length) {
        parts.push(`Countries: ${selectedCountriesData.value.map(c => c.name).join(', ')}`);
      }
      if (selectedStatesData.value?.length) {
        parts.push(`States: ${selectedStatesData.value.map(s => s.name).join(', ')}`);
      }
      if (zoom >= threshold && selectedLocationsData.value?.length) {
        parts.push(`Locations: ${selectedLocationsData.value.length}`);
      }
      contextData.hierarchicalLocation = parts.length ? parts.join(' / ') : null;

      setLocationContext(contextData);
    };

    // ==========================================================================
    // GEOCODING METHODS
    // ==========================================================================

    /**
     * Perform reverse geocoding
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object|null>} Geocoded address or null
     */
    const reverseGeocode = async (lat, lng) => {
      if (!props.content?.enableReverseGeocoding) return null;

      try {
        const response = await fetch(
          `${GEOCODING_CONFIG.NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { 'User-Agent': GEOCODING_CONFIG.USER_AGENT } }
        );

        if (!response.ok) {
          emit('trigger-event', {
            name: 'geocoding-error',
            event: { error: `HTTP ${response.status}`, coordinates: { lat, lng } }
          });
          return null;
        }

        const data = await response.json();
        const geocoded = {
          displayName: data.display_name || '',
          address: {
            road: data.address?.road || '',
            houseNumber: data.address?.house_number || '',
            city: data.address?.city || data.address?.town || data.address?.village || '',
            state: data.address?.state || '',
            country: data.address?.country || '',
            countryCode: data.address?.country_code || '',
            postcode: data.address?.postcode || ''
          },
          raw: data
        };

        setGeocodedAddress(geocoded);
        return geocoded;
      } catch (error) {
        emit('trigger-event', {
          name: 'geocoding-error',
          event: { error: error.message, coordinates: { lat, lng } }
        });
        return null;
      }
    };

    /**
     * Debounced reverse geocoding
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {string} eventName - Event to emit on success
     */
    const debouncedReverseGeocode = (lat, lng, eventName) => {
      clearTimeout(geocodingDebounceTimer.value);
      const rateLimit = props.content?.geocodingRateLimit || GEOCODING_CONFIG.RATE_LIMIT_MS;

      geocodingDebounceTimer.value = setTimeout(async () => {
        const geocoded = await reverseGeocode(lat, lng);
        if (geocoded) {
          emit('trigger-event', {
            name: eventName,
            event: { geocoded, coordinates: { lat, lng } }
          });
        }
      }, rateLimit);
    };

    // ==========================================================================
    // LOCATION DETECTION METHODS
    // ==========================================================================

    /**
     * Get parent country for a location via RPC
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object|null>} Country data or null
     */
    const getLocationParentCountry = async (lat, lng) => {
      const supabase = getSupabaseClient();
      if (!supabase) return null;

      try {
        const { data } = await supabase
          .schema('gis')
          .rpc('find_country_at_point', { point_lat: lat, point_lng: lng });

        if (data?.length) {
          return {
            id: data[0].id,
            name: data[0].name,
            iso_a2: data[0].iso_a2,
            iso_a3: data[0].iso_a3
          };
        }
      } catch (error) {
        mapLogger.debug('Failed to get parent country:', error.message);
      }
      return null;
    };

    /**
     * Get parent state for a location via RPC
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object|null>} State data or null
     */
    const getLocationParentState = async (lat, lng) => {
      const supabase = getSupabaseClient();
      if (!supabase) return null;

      const zoom = map.value?.getZoom() || MAP_DEFAULTS.INITIAL_ZOOM;
      const stateMinZoom = props.content?.stateMinZoom ?? ZOOM_THRESHOLDS.STATE_MIN_ZOOM;
      if (zoom < stateMinZoom) return null;

      try {
        const { data } = await supabase
          .schema('gis')
          .rpc('find_state_at_point', { point_lat: lat, point_lng: lng });

        if (data?.length) {
          return {
            id: data[0].id,
            name: data[0].name,
            name_en: data[0].name_en || data[0].name,
            adm1_code: data[0].adm1_code,
            admin: data[0].admin,
            country_id: data[0].country_id
          };
        }
      } catch (error) {
        mapLogger.debug('Failed to get parent state:', error.message);
      }
      return null;
    };

    /**
     * Detect geographic location at coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} zoom - Current zoom level
     * @returns {Promise<{country: Object|null, state: Object|null}>}
     */
    const detectGeographicLocation = async (lat, lng, zoom) => {
      const result = { country: null, state: null };
      const supabase = getSupabaseClient();
      if (!supabase) return result;

      try {
        result.country = await getLocationParentCountry(lat, lng);

        const stateMinZoom = props.content?.stateMinZoom ?? ZOOM_THRESHOLDS.STATE_MIN_ZOOM;
        if (zoom >= stateMinZoom) {
          result.state = await getLocationParentState(lat, lng);
        }
      } catch (error) {
        mapLogger.debug('Error detecting location:', error.message);
      }

      return result;
    };

    // ==========================================================================
    // MAP EVENT HANDLERS
    // ==========================================================================

    /**
     * Handle map type change
     * @param {string} newType - New map type
     */
    const onMapTypeChange = (newType) => {
      mapLayersComposable.setMapType(newType);
    };

    /**
     * Handle map click
     * @param {L.LeafletMouseEvent} e - Click event
     */
    const onMapClick = async (e) => {
      if (!map.value) return;

      const { lat, lng } = e.latlng;
      const zoom = map.value.getZoom();
      const threshold = props.content?.locationZoomThreshold || ZOOM_THRESHOLDS.LOCATION_ZOOM_THRESHOLD;

      const detected = await detectGeographicLocation(lat, lng, zoom);

      emit('trigger-event', {
        name: 'map-click',
        event: {
          position: { lat, lng },
          zoom,
          mode: zoom >= threshold ? 'location' : 'boundary',
          country: detected.country,
          state: detected.state
        }
      });

      // Handle location marking at high zoom
      if (zoom >= threshold && props.content?.allowClickToMark) {
        const parentState = await getLocationParentState(lat, lng);
        const parentCountry = await getLocationParentCountry(lat, lng);

        const locationData = {
          id: `loc-${Date.now()}`,
          lat,
          lng,
          timestamp: new Date().toISOString(),
          parentState,
          parentCountry
        };

        selectedLocations.value.push(locationData);

        // Auto-select parent boundaries
        if (parentState?.id) {
          selectedStates.value.add(parentState.id);
          updateBoundaryStyle(
            boundariesComposable.stateBoundaryLayer.value,
            parentState.id,
            props.content?.stateSelectedColor || STYLE_DEFAULTS.STATE_SELECTED_COLOR,
            props.content?.stateSelectedOpacity || STYLE_DEFAULTS.STATE_SELECTED_OPACITY
          );
        }

        if (parentCountry?.id) {
          selectedCountries.value.add(parentCountry.id);
          updateBoundaryStyle(
            boundariesComposable.countryBoundaryLayer.value,
            parentCountry.id,
            props.content?.countrySelectedColor || STYLE_DEFAULTS.COUNTRY_SELECTED_COLOR,
            props.content?.countrySelectedOpacity || STYLE_DEFAULTS.COUNTRY_SELECTED_OPACITY
          );
        }

        updateSelectionVariables();
        updateSelectedLocationMarkers();
        setClickedLocation(locationData);

        // Handle geolocation marker
        handleMarkedLocation(lat, lng);
      } else {
        setClickedLocation(null);
      }

      updateLocationContext();

      if (props.content?.enableReverseGeocoding) {
        debouncedReverseGeocode(lat, lng, 'location-geocoded');
      }
    };

    /**
     * Handle marked location creation
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     */
    const handleMarkedLocation = (lat, lng) => {
      const zoom = map.value?.getZoom() || 0;
      const threshold = props.content?.locationZoomThreshold || ZOOM_THRESHOLDS.LOCATION_ZOOM_THRESHOLD;

      if (!props.content?.allowClickToMark || zoom < threshold) return;

      geolocationComposable.markLocation(lat, lng);

      if (props.content?.enableReverseGeocoding) {
        debouncedReverseGeocode(lat, lng, 'marked-location-geocoded');
      }
    };

    /**
     * Handle map moveend event
     */
    const onMapMoveEnd = () => {
      updateMapBoundsVariable();

      // Update boundaries based on new viewport
      if (props.content?.enableCountryHover || props.content?.enableStateHover) {
        boundariesComposable.updateBoundaries();
      }
    };

    /**
     * Handle map zoomend event
     */
    const onMapZoomEnd = () => {
      const zoom = map.value?.getZoom();
      if (zoom !== undefined) {
        setCurrentZoomLevel(zoom);
      }
      updateLocationContext();
    };

    // ==========================================================================
    // MAP INITIALIZATION
    // ==========================================================================

    /**
     * Initialize the Leaflet map
     */
    const initializeMap = async () => {
      if (!mapContainer.value) return;

      try {
        const initialLat = props.content?.initialLat ?? MAP_DEFAULTS.INITIAL_LAT;
        const initialLng = props.content?.initialLng ?? MAP_DEFAULTS.INITIAL_LNG;
        const initialZoom = props.content?.initialZoom ?? MAP_DEFAULTS.INITIAL_ZOOM;

        // Create map instance
        map.value = L.map(mapContainer.value, {
          center: [initialLat, initialLng],
          zoom: initialZoom,
          zoomControl: true
        });

        // Initialize tile layers using composable
        mapLayersComposable.initializeLayers();
        mapLayersComposable.setMapType(props.content?.mapType || MAP_DEFAULTS.MAP_TYPE);

        // Setup event handlers
        map.value.on('click', onMapClick);
        map.value.on('moveend', onMapMoveEnd);
        map.value.on('zoomend', onMapZoomEnd);

        // Initialize resize observer
        setupResizeObserver();

        // Validate GIS setup
        await validateAndSetupGIS();

        // Request geolocation if enabled
        if (props.content?.requestGeolocation) {
          geolocationComposable.requestUserLocation();
        }

        // Load initial boundaries
        if (props.content?.enableCountryHover || props.content?.enableStateHover) {
          await boundariesComposable.updateBoundaries();
        }

        // Initial markers update
        markersComposable.updateMarkers(props.content?.markers || []);

        // Initial heatmap update
        if (props.content?.showHardinessHeatmap) {
          heatmapComposable.updateHardinessHeatmap(props.content?.usersHardinessData || []);
        }

        // Set initial map bounds
        updateMapBoundsVariable();

        // Emit map ready event
        emit('trigger-event', { name: 'map-ready', event: {} });

      } catch (error) {
        mapLogger.error('Initialization error:', error);
        gisSetupError.value = error.message;
      }
    };

    /**
     * Validate GIS setup and handle errors
     */
    const validateAndSetupGIS = async () => {
      if (!props.content?.enableCountryHover && !props.content?.enableStateHover) {
        return;
      }

      try {
        boundariesLoading.value = true;
        const validation = await validateGISSetup();

        if (!validation.valid) {
          gisSetupError.value = validation.errors.join('; ');
          emit('trigger-event', {
            name: 'supabase-error',
            event: { error: gisSetupError.value }
          });
        } else if (validation.warnings.length) {
          mapLogger.warn('GIS warnings:', validation.warnings);
        }
      } catch (error) {
        const parsed = parseGISError(error);
        gisSetupError.value = parsed.message;
      } finally {
        boundariesLoading.value = false;
      }
    };

    // ==========================================================================
    // WATCHERS - View Settings
    // ==========================================================================

    /**
     * Watch for map view changes (position, zoom)
     */
    watch(
      () => [
        props.content?.initialLat,
        props.content?.initialLng,
        props.content?.initialZoom
      ],
      ([newLat, newLng, newZoom]) => {
        if (!map.value) return;
        map.value.setView(
          [newLat ?? MAP_DEFAULTS.INITIAL_LAT, newLng ?? MAP_DEFAULTS.INITIAL_LNG],
          newZoom ?? MAP_DEFAULTS.INITIAL_ZOOM
        );
      }
    );

    /**
     * Watch for map type changes
     */
    watch(
      () => props.content?.mapType,
      (newType) => {
        if (newType) {
          mapLayersComposable.setMapType(newType);
        }
      }
    );

    // ==========================================================================
    // WATCHERS - Markers and Heatmap
    // ==========================================================================

    /**
     * Generate a fingerprint for an array of objects to detect meaningful changes
     * Uses length + first/last item IDs for O(1) comparison in most cases
     * @param {Array} arr - Array to fingerprint
     * @param {string} idKey - Key to use for ID (default: 'id')
     * @returns {string} Fingerprint string
     */
    const getArrayFingerprint = (arr, idKey = 'id') => {
      if (!Array.isArray(arr) || arr.length === 0) return 'empty';
      const first = arr[0]?.[idKey] ?? JSON.stringify(arr[0]);
      const last = arr[arr.length - 1]?.[idKey] ?? JSON.stringify(arr[arr.length - 1]);
      return `${arr.length}:${first}:${last}`;
    };

    /**
     * Watch for marker data changes (optimized - no deep watching on arrays)
     */
    watch(
      () => [
        getArrayFingerprint(props.content?.markers),
        props.content?.enableClustering,
        props.content?.clusterMaxZoom,
        props.content?.markersLatFormula?.code,
        props.content?.markersLngFormula?.code,
        props.content?.markersNameFormula?.code
      ],
      () => {
        markersComposable.updateMarkers(props.content?.markers || []);
      }
    );

    /**
     * Watch for heatmap data changes (optimized - no deep watching on arrays)
     */
    watch(
      () => [
        props.content?.showHardinessHeatmap,
        getArrayFingerprint(props.content?.usersHardinessData),
        props.content?.hardinessHeatmapRadius,
        props.content?.usersLatFormula?.code,
        props.content?.usersLngFormula?.code,
        props.content?.usersZoneFormula?.code
      ],
      () => {
        heatmapComposable.updateHardinessHeatmap(props.content?.usersHardinessData || []);
      }
    );

    // ==========================================================================
    // WATCHERS - Geolocation and Privacy
    // ==========================================================================

    /**
     * Watch for geolocation and privacy settings changes (no deep watch needed - all primitives)
     */
    watch(
      () => [
        props.content?.enablePrivacyMode,
        props.content?.showUserLocation,
        props.content?.privacyRadius,
        props.content?.privacyRadiusMiles,
        props.content?.privacyUnit,
        props.content?.isOnline
      ],
      () => {
        geolocationComposable.updatePrivacyMode();
        geolocationComposable.updateUserLocationMarker();
      }
    );

    /**
     * Watch for request geolocation toggle
     */
    watch(
      () => props.content?.requestGeolocation,
      (newVal) => {
        if (newVal && !geolocationComposable.geolocationRequested.value) {
          geolocationComposable.requestUserLocation();
        }
      }
    );

    // ==========================================================================
    // WATCHERS - Boundary Settings
    // ==========================================================================

    /**
     * Watch for boundary feature toggles
     */
    watch(
      () => [
        props.content?.enableCountryHover,
        props.content?.enableStateHover,
        props.content?.useVectorTiles
      ],
      async () => {
        if (!map.value) return;
        await boundariesComposable.updateBoundaries();
      }
    );

    /**
     * Watch for boundary zoom range changes
     */
    watch(
      () => [
        props.content?.countryMinZoom,
        props.content?.countryMaxZoom,
        props.content?.stateMinZoom,
        props.content?.stateMaxZoom
      ],
      async () => {
        if (!map.value) return;
        await boundariesComposable.updateBoundaries();
      }
    );

    /**
     * Watch for boundary style changes
     */
    watch(
      () => [
        props.content?.countryHoverColor,
        props.content?.countryHoverOpacity,
        props.content?.countrySelectedColor,
        props.content?.countrySelectedOpacity,
        props.content?.countryBorderColor,
        props.content?.countryBorderWidth,
        props.content?.countryBorderOpacity,
        props.content?.stateHoverColor,
        props.content?.stateHoverOpacity,
        props.content?.stateSelectedColor,
        props.content?.stateSelectedOpacity,
        props.content?.stateBorderColor,
        props.content?.stateBorderWidth,
        props.content?.stateBorderOpacity,
        props.content?.selectedLocationMarkerColor
      ],
      () => {
        // Style changes are handled reactively via computed styles in composables
        updateSelectedLocationMarkers();
      }
    );

    // ==========================================================================
    // LIFECYCLE HOOKS
    // ==========================================================================

    onMounted(async () => {
      await nextTick();
      setTimeout(() => {
        initializeMap();
      }, UI_TIMING.NEXT_TICK_DELAY_MS);
    });

    onBeforeUnmount(() => {
      // Cleanup timers
      clearTimeout(resizeTimeout.value);
      clearTimeout(geocodingDebounceTimer.value);

      // Cleanup resize observer
      if (resizeObserver.value) {
        resizeObserver.value.disconnect();
      }

      // Cleanup composables
      mapLayersComposable.cleanup();
      boundariesComposable.cleanup();
      geolocationComposable.cleanup();
      markersComposable.cleanup();
      heatmapComposable.cleanup();

      // Cleanup map
      if (map.value) {
        map.value.off();
        map.value.remove();
        map.value = null;
      }
    });

    // ==========================================================================
    // RETURN VALUES
    // ==========================================================================

    return {
      // Template refs
      mapContainer,

      // Content shorthand
      content: computed(() => props.content),

      // Computed styles
      mapContainerStyle,
      mapStyle,
      overlayPositionClass,
      overlayStyle,

      // Computed properties
      currentMapType,
      showLocationInstructions,

      // State from composables
      boundariesLoading,
      gisSetupError,
      geolocationRequested,
      geolocationDenied,

      // Methods
      onMapTypeChange,

      // Hardiness zone colors for template if needed
      hardinessZoneColors: HARDINESS_ZONE_COLORS,

      /* wwEditor:start */
      isEditing,
      /* wwEditor:end */
    };
  }
};
</script>

<style lang="scss" scoped>
.openstreet-map {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: var(--border-radius);
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
  z-index: 1;
}

// Map type selector
.map-type-selector {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1000;
}

.map-type-select {
  padding: 6px 12px;
  font-size: 14px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:hover {
    border-color: #999;
  }

  &:focus {
    outline: none;
    border-color: #007bff;
  }
}

// Overlay dropzone
.map-overlay {
  position: absolute;
  z-index: 1000;
  padding: var(--overlay-padding);
  pointer-events: auto;

  &.overlay-top-left {
    top: 10px;
    left: 10px;
  }

  &.overlay-top-right {
    top: 50px; // Below map type selector
    right: 10px;
  }

  &.overlay-bottom-left {
    bottom: 10px;
    left: 10px;
  }

  &.overlay-bottom-right {
    bottom: 10px;
    right: 10px;
  }

  &.overlay-center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}

.overlay-container {
  min-width: 100px;
  min-height: 40px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 8px;

  &:empty {
    border: 2px dashed #d0d0d0;
    display: flex;
    align-items: center;
    justify-content: center;

    &::after {
      content: 'Drop elements here';
      color: #999;
      font-size: 12px;
      font-style: italic;
    }
  }

  &:not(:empty)::after {
    display: none;
  }
}

// Loading overlay
.loading-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.9);
  padding: 16px 24px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1001;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top-color: #007bff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 14px;
  color: #333;
}

// GIS error notice
.gis-error-notice {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(255, 243, 224, 0.95);
  border: 1px solid #ffb74d;
  padding: 8px 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1000;
  max-width: 300px;
}

.error-icon {
  font-size: 16px;
}

.error-text {
  font-size: 12px;
  color: #e65100;
}

// Location instructions
.location-instructions {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  z-index: 999;
  pointer-events: none;

  p {
    margin: 0;
    font-size: 14px;
    text-align: center;
  }
}

// Leaflet overrides
:deep(.leaflet-control-zoom) {
  border: none !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15) !important;
}

:deep(.leaflet-control-zoom a) {
  background: white !important;
  color: #333 !important;
  border: none !important;

  &:hover {
    background: #f5f5f5 !important;
  }
}

// Custom marker styles
:deep(.user-location-marker),
:deep(.user-marked-location),
:deep(.selected-location-marker),
:deep(.marked-location-marker) {
  background: transparent !important;
  border: none !important;
}
</style>
