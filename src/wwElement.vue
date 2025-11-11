<template>
  <div class="openstreet-map" :style="mapContainerStyle">
    <!-- Map Container -->
    <div ref="mapContainer" class="map-container" :style="mapStyle"></div>

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
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.heat';
import { boundaryAPI, boundaryCache, getSupabaseClient } from './supabaseClient.js';
import { vectorTileClient } from './vectorTileClient.js';

// Fix Leaflet's default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});

export default {
  props: {
    uid: { type: String, required: true },
    content: { type: Object, required: true },
    /* wwEditor:start */
    wwEditorState: { type: Object, required: true },
    /* wwEditor:end */
  },
  emits: ['trigger-event'],
  setup(props, { emit }) {
    // Editor state
    /* wwEditor:start */
    const isEditing = computed(() => props.wwEditorState?.isEditing);
    /* wwEditor:end */

    // Non-reactive state (map instances)
    const map = ref(null);
    const markersLayer = ref(null);
    const clusterGroup = ref(null);
    const userLocationMarker = ref(null);
    const userMarkedLocationMarker = ref(null);
    const privacyCircle = ref(null);
    const tileLayers = ref({});
    const resizeObserver = ref(null);
    const resizeTimeout = ref(null);
    const hardinessHeatmapLayer = ref(null);
    const countryBoundaryLayer = ref(null);
    const stateBoundaryLayer = ref(null);
    const selectedCountry = ref(null);
    const selectedState = ref(null);
    const hoveredCountry = ref(null);
    const hoveredState = ref(null);
    const geocodingDebounceTimer = ref(null);
    const lastGeocodingRequest = ref(0); // Track last request time for rate limiting
    const geocodingAbortController = ref(null); // Track abort controller for request cancellation
    const boundaryDebounceTimer = ref(null); // Debounce timer for boundary updates
    const markerDebounceTimer = ref(null); // Debounce timer for marker viewport updates

    // Component state
    const geolocationRequested = ref(false);
    const geolocationDenied = ref(false);
    const showUserLocation = ref(false);
    const userExactLat = ref(null);
    const userExactLng = ref(null);

    // Template refs
    const mapContainer = ref(null);

    // Internal variables for NoCode users
    const { value: selectedLocation, setValue: setSelectedLocation } = wwLib?.wwVariable?.useComponentVariable({
      uid: props.uid,
      name: 'selectedLocation',
      type: 'object',
      defaultValue: null,
    }) || { value: ref(null), setValue: () => {} };

    const { value: userLocation, setValue: setUserLocation } = wwLib?.wwVariable?.useComponentVariable({
      uid: props.uid,
      name: 'userLocation',
      type: 'object',
      defaultValue: null,
    }) || { value: ref(null), setValue: () => {} };

    const { value: clickedLocation, setValue: setClickedLocation } = wwLib?.wwVariable?.useComponentVariable({
      uid: props.uid,
      name: 'clickedLocation',
      type: 'object',
      defaultValue: null,
    }) || { value: ref(null), setValue: () => {} };

    const { value: selectedCountryData, setValue: setSelectedCountryData } = wwLib?.wwVariable?.useComponentVariable({
      uid: props.uid,
      name: 'selectedCountry',
      type: 'object',
      defaultValue: null,
    }) || { value: ref(null), setValue: () => {} };

    const { value: selectedStateData, setValue: setSelectedStateData } = wwLib?.wwVariable?.useComponentVariable({
      uid: props.uid,
      name: 'selectedState',
      type: 'object',
      defaultValue: null,
    }) || { value: ref(null), setValue: () => {} };

    const { value: geocodedAddress, setValue: setGeocodedAddress } = wwLib?.wwVariable?.useComponentVariable({
      uid: props.uid,
      name: 'geocodedAddress',
      type: 'object',
      defaultValue: null,
    }) || { value: ref(null), setValue: () => {} };

    // Computed styles
    const mapContainerStyle = computed(() => ({
      '--map-height': props.content?.mapHeight || '100%',
      '--border-radius': props.content?.mapStyle || '8px'
    }));

    const mapStyle = computed(() => ({
      height: 'var(--map-height)',
      borderRadius: 'var(--border-radius)',
      overflow: 'hidden'
    }));

    // Computed properties
    const currentMapType = computed(() => props.content?.mapType || 'osm');

    const showLocationInstructions = computed(() => {
      return props.content?.allowClickToMark && (!showUserLocation.value || geolocationDenied.value);
    });

    const hardinessZoneColors = computed(() => ({
      '1a': '#d6d6ff', '1b': '#c4c4f2', '2a': '#ababd9', '2b': '#ebb0eb',
      '3a': '#dd8fe8', '3b': '#cf7ddb', '4a': '#a66bff', '4b': '#5a75ed',
      '5a': '#73a1ff', '5b': '#5ec9e0', '6a': '#47ba47', '6b': '#78c756',
      '7a': '#abd669', '7b': '#cddb70', '8a': '#edda85', '8b': '#ebcb57',
      '9a': '#dbb64f', '9b': '#f5b678', '10a': '#da9132', '10b': '#e6781e',
      '11a': '#e6561e', '11b': '#e88564', '12a': '#d4594e', '12b': '#b51228',
      '13a': '#962f1d', '13b': '#751a00'
    }));

    const userHardinessZoneColor = computed(() => {
      const zone = props.content?.userHardinessZone || '7a';
      return hardinessZoneColors.value[zone] || '#abd669';
    });

    const processedMarkers = computed(() => {
      const markers = props.content?.markers || [];
      if (!Array.isArray(markers)) return [];

      const useFormula = wwLib?.wwFormula?.useFormula;
      const { resolveMappingFormula } = useFormula ? useFormula() : {};

      return markers.map(marker => {
        if (!resolveMappingFormula) {
          return {
            id: marker.id || `marker-${Date.now()}-${Math.random()}`,
            name: marker.name || 'Untitled',
            lat: marker.lat || 0,
            lng: marker.lng || 0,
            description: marker.description || '',
            originalItem: marker,
            ...marker
          };
        }

        const lat = resolveMappingFormula(props.content?.markersLatFormula, marker) ?? marker.lat;
        const lng = resolveMappingFormula(props.content?.markersLngFormula, marker) ?? marker.lng;
        const name = resolveMappingFormula(props.content?.markersNameFormula, marker) ?? marker.name;

        return {
          id: marker.id || `marker-${Date.now()}-${Math.random()}`,
          name: name || 'Untitled',
          lat: parseFloat(lat) || 0,
          lng: parseFloat(lng) || 0,
          description: marker.description || '',
          originalItem: marker,
          ...marker
        };
      }).filter(marker =>
        !isNaN(marker.lat) &&
        !isNaN(marker.lng) &&
        marker.lat >= -90 &&
        marker.lat <= 90 &&
        marker.lng >= -180 &&
        marker.lng <= 180
      );
    });

    const processedUsersHardinessData = computed(() => {
      const users = props.content?.usersHardinessData || [];
      if (!Array.isArray(users)) return [];

      const useFormula = wwLib?.wwFormula?.useFormula;
      const { resolveMappingFormula } = useFormula ? useFormula() : {};

      return users.map(user => {
        if (!resolveMappingFormula) {
          return {
            lat: user.lat || 0,
            lng: user.lng || 0,
            hardinessZone: user.hardinessZone || '7a',
            name: user.name || 'User',
            originalItem: user,
            ...user
          };
        }

        const lat = resolveMappingFormula(props.content?.usersLatFormula, user) ?? user.lat;
        const lng = resolveMappingFormula(props.content?.usersLngFormula, user) ?? user.lng;
        const zone = resolveMappingFormula(props.content?.usersZoneFormula, user) ?? user.hardinessZone;

        return {
          lat: parseFloat(lat) || 0,
          lng: parseFloat(lng) || 0,
          hardinessZone: zone || '7a',
          name: user.name || 'User',
          originalItem: user,
          ...user
        };
      }).filter(user =>
        !isNaN(user.lat) &&
        !isNaN(user.lng) &&
        user.lat >= -90 &&
        user.lat <= 90 &&
        user.lng >= -180 &&
        user.lng <= 180
      );
    });

    // Methods
    // LAZY LOADING: Create tile layer on-demand instead of creating all upfront
    const getTileLayer = (type) => {
      // Return cached layer if it exists
      if (tileLayers.value[type]) {
        return tileLayers.value[type];
      }

      // Create layer on-demand
      let layer;
      switch (type) {
        case 'satellite':
          layer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
          });
          break;
        case 'terrain':
          layer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenTopoMap contributors'
          });
          break;
        case 'dark':
          layer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© CartoDB, © OpenStreetMap contributors'
          });
          break;
        case 'light':
          layer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© CartoDB, © OpenStreetMap contributors'
          });
          break;
        case 'osm':
        default:
          layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          });
          break;
      }

      // Cache the layer for reuse
      tileLayers.value[type] = layer;
      return layer;
    };

    const safeInvalidateSize = () => {
      if (!map.value) return;

      const container = map.value.getContainer();
      if (!container) return;

      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        return;
      }

      const mapPane = container.querySelector('.leaflet-map-pane');
      if (!mapPane) {
        return;
      }

      try {
        map.value.invalidateSize();
      } catch (error) {
        // Silent fail - map size invalidation not critical
      }
    };

    const setupResizeObserver = () => {
      const frontWindow = (wwLib?.getFrontWindow && wwLib.getFrontWindow()) || (typeof window !== 'undefined' ? window : null);
      if (!mapContainer.value || !frontWindow || !frontWindow.ResizeObserver) return;

      resizeObserver.value = new frontWindow.ResizeObserver(() => {
        clearTimeout(resizeTimeout.value);
        resizeTimeout.value = setTimeout(() => {
          safeInvalidateSize();
        }, 150);
      });

      resizeObserver.value.observe(mapContainer.value);
    };

    const updateMapType = () => {
      if (!map.value) return;

      const newMapType = currentMapType.value;

      // Remove all currently active tile layers
      Object.values(tileLayers.value).forEach(layer => {
        if (map.value.hasLayer(layer)) {
          map.value.removeLayer(layer);
        }
      });

      // Lazy load and add the selected tile layer
      const selectedLayer = getTileLayer(newMapType);
      if (selectedLayer) {
        selectedLayer.addTo(map.value);
      }
    };

    const updateMapView = () => {
      if (!map.value) return;

      const lat = props.content?.initialLat || 51.505;
      const lng = props.content?.initialLng || -0.09;
      const zoom = props.content?.initialZoom || 13;

      map.value.setView([lat, lng], zoom);
    };

    const updateMarkers = () => {
      if (!map.value || !map.value.getContainer()) return;

      try {
        if (markersLayer.value) {
          map.value.removeLayer(markersLayer.value);
        }
        if (clusterGroup.value) {
          map.value.removeLayer(clusterGroup.value);
        }

        const markers = processedMarkers.value;
        if (!markers.length) return;

        if (props.content?.enableClustering) {
          // Clustering handles viewport optimization automatically
          clusterGroup.value = L.markerClusterGroup({
            maxClusterRadius: 50,
            disableClusteringAtZoom: props.content?.clusterMaxZoom || 15,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            spiderfyOnMaxZoom: true,
            chunkedLoading: true, // Performance: Load markers in chunks
            chunkInterval: 50, // Performance: Delay between chunks (ms)
            chunkDelay: 50 // Performance: Delay before starting chunking (ms)
          });

          markers.forEach(markerData => {
            const marker = L.marker([markerData.lat, markerData.lng]);

            marker.on('click', () => {
              setSelectedLocation({
                marker: markerData,
                position: { lat: markerData.lat, lng: markerData.lng }
              });

              emit('trigger-event', {
                name: 'marker-click',
                event: {
                  marker: markerData,
                  position: { lat: markerData.lat, lng: markerData.lng }
                }
              });
            });

            clusterGroup.value.addLayer(marker);
          });

          map.value.addLayer(clusterGroup.value);
        } else {
          // VIRTUALIZATION: Only render markers within viewport (with padding)
          const bounds = map.value.getBounds();
          const zoom = map.value.getZoom();

          // Add padding to bounds for smoother experience during panning
          const paddedBounds = bounds.pad(0.5); // 50% padding on each side

          const visibleMarkers = markers.filter(markerData => {
            return paddedBounds.contains([markerData.lat, markerData.lng]);
          });

          markersLayer.value = L.layerGroup();

          // Only render markers in viewport
          visibleMarkers.forEach(markerData => {
            const marker = L.marker([markerData.lat, markerData.lng]);

            marker.on('click', () => {
              setSelectedLocation({
                marker: markerData,
                position: { lat: markerData.lat, lng: markerData.lng }
              });

              emit('trigger-event', {
                name: 'marker-click',
                event: {
                  marker: markerData,
                  position: { lat: markerData.lat, lng: markerData.lng }
                }
              });
            });

            markersLayer.value.addLayer(marker);
          });

          map.value.addLayer(markersLayer.value);
        }
      } catch (error) {
        // Silent fail - marker update errors handled gracefully
      }
    };

    // Debounced version for viewport changes (only updates when clustering is disabled)
    const debouncedUpdateMarkers = () => {
      // Only debounce if clustering is disabled (clustering handles its own optimization)
      if (props.content?.enableClustering) return;

      clearTimeout(markerDebounceTimer.value);
      markerDebounceTimer.value = setTimeout(() => {
        updateMarkers();
      }, 150); // 150ms debounce delay
    };

    const updateUserLocationMarker = () => {
      if (!userLocationMarker.value || !userExactLat.value || !userExactLng.value) return;

      try {
        const statusClass = props.content?.isOnline ? 'online' : 'offline';
        const newIcon = L.divIcon({
          className: 'user-location-marker',
          html: `<div class="user-location-dot ${statusClass}"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        userLocationMarker.value.setIcon(newIcon);
      } catch (error) {
        // Silent fail - marker icon update not critical
      }
    };

    const getPrivacyRadiusInKm = () => {
      const unit = props.content?.privacyUnit || 'km';
      let radius;

      if (unit === 'miles') {
        radius = props.content?.privacyRadiusMiles || 0.62;
        return radius * 1.60934;
      } else {
        radius = props.content?.privacyRadius || 1;
        return radius;
      }
    };

    const generateRandomOffset = (radiusKm) => {
      const radiusInDegrees = radiusKm / 111.32;
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * radiusInDegrees;

      return {
        lat: distance * Math.cos(angle),
        lng: distance * Math.sin(angle)
      };
    };

    const updatePrivacyCircle = () => {
      if (privacyCircle.value) {
        map.value.removeLayer(privacyCircle.value);
        privacyCircle.value = null;
      }

      if (props.content?.enablePrivacyMode && props.content?.showUserLocation && map.value) {
        let centerLat, centerLng;

        if (userExactLat.value && userExactLng.value) {
          const radius = getPrivacyRadiusInKm();
          const offset = generateRandomOffset(radius);
          centerLat = userExactLat.value + offset.lat;
          centerLng = userExactLng.value + offset.lng;
        } else if (userMarkedLocationMarker.value) {
          const markedPos = userMarkedLocationMarker.value.getLatLng();
          const radius = getPrivacyRadiusInKm();
          const offset = generateRandomOffset(radius);
          centerLat = markedPos.lat + offset.lat;
          centerLng = markedPos.lng + offset.lng;
        } else {
          return;
        }

        const radiusInMeters = getPrivacyRadiusInKm() * 1000;
        const circleColor = props.content?.isOnline ? '#4CAF50' : '#9E9E9E';

        privacyCircle.value = L.circle([centerLat, centerLng], {
          radius: radiusInMeters,
          color: circleColor,
          fillColor: circleColor,
          fillOpacity: 0.2,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(map.value);
      }
    };

    const updatePrivacyMode = () => {
      if (!map.value) return;

      if (userLocationMarker.value) {
        if (props.content?.enablePrivacyMode || !props.content?.showUserLocation) {
          if (map.value.hasLayer(userLocationMarker.value)) {
            map.value.removeLayer(userLocationMarker.value);
          }
        } else {
          if (!map.value.hasLayer(userLocationMarker.value)) {
            userLocationMarker.value.addTo(map.value);
          }
        }
      }

      updatePrivacyCircle();

      if (userMarkedLocationMarker.value) {
        if (props.content?.enablePrivacyMode) {
          if (map.value.hasLayer(userMarkedLocationMarker.value)) {
            map.value.removeLayer(userMarkedLocationMarker.value);
          }
        } else {
          if (!map.value.hasLayer(userMarkedLocationMarker.value)) {
            userMarkedLocationMarker.value.addTo(map.value);
          }
        }
      }
    };

    const onLocationSuccess = (position) => {
      if (!map.value) {
        return;
      }

      const { latitude, longitude } = position.coords;
      showUserLocation.value = true;

      userExactLat.value = latitude;
      userExactLng.value = longitude;

      setUserLocation({
        lat: latitude,
        lng: longitude,
        timestamp: new Date().toISOString()
      });

      try {
        if (userLocationMarker.value) {
          map.value.removeLayer(userLocationMarker.value);
        }

        const statusClass = props.content?.isOnline ? 'online' : 'offline';
        userLocationMarker.value = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: `<div class="user-location-dot ${statusClass}"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        if (!props.content?.enablePrivacyMode) {
          userLocationMarker.value.addTo(map.value);
          userLocationMarker.value.on('click', () => {
            emit('trigger-event', {
              name: 'user-location-click',
              event: {
                position: { lat: latitude, lng: longitude },
                type: 'user-location'
              }
            });
          });
        }

        if (props.content?.centerOnUserLocation) {
          map.value.setView([latitude, longitude], props.content?.initialZoom || 15);
        }

        updatePrivacyMode();

        emit('trigger-event', {
          name: 'location-granted',
          event: {
            position: { lat: latitude, lng: longitude }
          }
        });

        if (props.content?.enableReverseGeocoding) {
          debouncedReverseGeocode(latitude, longitude, 'user-location-geocoded');
        }
      } catch (error) {
        // Silent fail - user location marker not critical
      }
    };

    const onLocationError = () => {
      geolocationDenied.value = true;
      emit('trigger-event', {
        name: 'location-denied',
        event: {}
      });
    };

    const requestUserLocation = () => {
      const frontWindow = (wwLib?.getFrontWindow && wwLib.getFrontWindow()) || (typeof window !== 'undefined' ? window : null);
      if (!frontWindow || !frontWindow.navigator?.geolocation) return;

      geolocationRequested.value = true;

      frontWindow.navigator.geolocation.getCurrentPosition(
        onLocationSuccess,
        onLocationError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    };

    const onMapClick = (e) => {
      if (!map.value) return;

      const { lat, lng } = e.latlng;

      emit('trigger-event', {
        name: 'map-click',
        event: {
          position: { lat, lng }
        }
      });

      setClickedLocation({
        lat,
        lng,
        timestamp: new Date().toISOString()
      });

      if (props.content?.enableReverseGeocoding) {
        debouncedReverseGeocode(lat, lng, 'location-geocoded');
      }

      if (!props.content?.allowClickToMark) return;

      try {
        if (userMarkedLocationMarker.value) {
          map.value.removeLayer(userMarkedLocationMarker.value);
        }

        const statusClass = props.content?.isOnline ? 'online' : 'offline';
        userMarkedLocationMarker.value = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-marked-location',
            html: `<div class="user-marked-dot ${statusClass}"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        if (!props.content?.enablePrivacyMode) {
          userMarkedLocationMarker.value.addTo(map.value);
          userMarkedLocationMarker.value.on('click', () => {
            const pos = userMarkedLocationMarker.value.getLatLng();
            emit('trigger-event', {
              name: 'marked-location-click',
              event: {
                position: { lat: pos.lat, lng: pos.lng },
                type: 'marked-location'
              }
            });
          });
        }

        updatePrivacyCircle();

        emit('trigger-event', {
          name: 'location-marked',
          event: {
            position: { lat, lng }
          }
        });

        if (props.content?.enableReverseGeocoding) {
          debouncedReverseGeocode(lat, lng, 'marked-location-geocoded');
        }
      } catch (error) {
        // Silent fail - marked location marker not critical
      }
    };

    const updateHardinessHeatmap = () => {
      if (hardinessHeatmapLayer.value) {
        map.value.removeLayer(hardinessHeatmapLayer.value);
        hardinessHeatmapLayer.value = null;
      }

      if (!props.content?.showHardinessHeatmap || !map.value) {
        return;
      }

      const users = processedUsersHardinessData.value;
      if (!users.length) {
        return;
      }

      createMultiUserHeatmap(users);
    };

    // Reverse Geocoding with Rate Limiting and Request Cancellation
    const reverseGeocode = async (lat, lng) => {
      if (!props.content?.enableReverseGeocoding) return null;

      // Cancel any pending geocoding request
      if (geocodingAbortController.value) {
        geocodingAbortController.value.abort();
      }

      // Create new AbortController for this request
      geocodingAbortController.value = new AbortController();

      const rateLimit = props.content?.geocodingRateLimit || 1000;
      const now = Date.now();
      const timeSinceLastRequest = now - lastGeocodingRequest.value;

      // Enforce rate limit - wait if necessary
      if (timeSinceLastRequest < rateLimit) {
        const waitTime = rateLimit - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      try {
        // Update last request time
        lastGeocodingRequest.value = Date.now();

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'WeWebOpenStreetMapComponent/1.0'
            },
            signal: geocodingAbortController.value.signal
          }
        );

        if (!response.ok) {
          if (response.status === 429) {
            console.error('Nominatim rate limit exceeded - please increase geocodingRateLimit');
          }
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
        // Don't log errors for aborted requests
        if (error.name === 'AbortError') {
          return null;
        }
        console.error('Reverse geocoding error:', error);
        return null;
      }
    };

    const debouncedReverseGeocode = (lat, lng, eventName) => {
      clearTimeout(geocodingDebounceTimer.value);

      const rateLimit = props.content?.geocodingRateLimit || 1000;

      geocodingDebounceTimer.value = setTimeout(async () => {
        const geocoded = await reverseGeocode(lat, lng);

        if (geocoded) {
          emit('trigger-event', {
            name: eventName,
            event: {
              geocoded,
              coordinates: { lat, lng }
            }
          });
        }
      }, rateLimit);
    };

    // Country/State Boundary Rendering
    const loadCountryBoundaries = async () => {
      if (!props.content?.enableCountryHover || !map.value) {
        return;
      }

      try {
        const bounds = map.value.getBounds();
        const zoom = map.value.getZoom();

        // Check zoom level constraints
        const minZoom = props.content?.countryMinZoom ?? 1;
        const maxZoom = props.content?.countryMaxZoom ?? 18;

        if (zoom < minZoom || zoom > maxZoom) {
          // Remove existing layer if present
          if (countryBoundaryLayer.value) {
            map.value.removeLayer(countryBoundaryLayer.value);
            countryBoundaryLayer.value = null;
          }
          return;
        }

        // Convert Leaflet LatLngBounds to plain object for API
        const boundsObj = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        };

        let boundaries;

        if (props.content?.useVectorTiles) {
          await vectorTileClient.init();
          boundaries = await loadCountriesVectorTiles(bounds, zoom);
        } else {
          const cached = boundaryCache.get('countries', boundsObj);

          if (cached) {
            boundaries = cached;
          } else {
            boundaries = await boundaryAPI.getCountriesInBounds(boundsObj, zoom);
            boundaryCache.set('countries', boundsObj, boundaries);
          }
        }

        if (!boundaries || boundaries.length === 0) {
          return;
        }

        renderCountryBoundaries(boundaries);

        emit('trigger-event', {
          name: 'countries-loaded',
          event: { countriesCount: boundaries.length }
        });

      } catch (error) {
        console.error('Error loading country boundaries:', error);
      }
    };

    const loadStateBoundaries = async () => {
      if (!props.content?.enableStateHover || !map.value) return;

      try {
        const bounds = map.value.getBounds();
        const zoom = map.value.getZoom();

        // Check zoom level constraints
        const minZoom = props.content?.stateMinZoom ?? 4;
        const maxZoom = props.content?.stateMaxZoom ?? 18;

        if (zoom < minZoom || zoom > maxZoom) {
          // Remove existing layer if present
          if (stateBoundaryLayer.value) {
            map.value.removeLayer(stateBoundaryLayer.value);
            stateBoundaryLayer.value = null;
          }
          return;
        }

        // Convert Leaflet LatLngBounds to plain object for API
        const boundsObj = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        };

        let boundaries;

        if (props.content?.useVectorTiles) {
          await vectorTileClient.init();
          boundaries = await loadStatesVectorTiles(bounds, zoom);
        } else {
          const cached = boundaryCache.get('states', boundsObj);

          if (cached) {
            boundaries = cached;
          } else {
            boundaries = await boundaryAPI.getStatesInBounds(boundsObj, zoom);
            boundaryCache.set('states', boundsObj, boundaries);
          }
        }

        if (!boundaries || boundaries.length === 0) {
          return;
        }

        renderStateBoundaries(boundaries);

        emit('trigger-event', {
          name: 'states-loaded',
          event: { statesCount: boundaries.length }
        });

      } catch (error) {
        console.error('Error loading state boundaries:', error);
      }
    };

    const loadCountriesVectorTiles = async (bounds, zoom) => {
      // Use simplified boundaries function instead of MVT tiles
      // This returns GeoJSON data that can be rendered directly
      const startTime = performance.now();

      try {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
          .schema('gis')
          .rpc('get_simplified_boundaries_in_bbox', {
            boundary_type: 'countries',
            zoom_level: zoom,
            bbox_west: bounds.getWest(),
            bbox_south: bounds.getSouth(),
            bbox_east: bounds.getEast(),
            bbox_north: bounds.getNorth(),
            country_filter: null
          });

        const fetchTime = performance.now() - startTime;

        if (error) {
          console.error('❌ Error loading countries with vector tiles:', error);
          return [];
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Calculate data size
        const dataSize = new Blob([JSON.stringify(data)]).size;
        const dataSizeKB = (dataSize / 1024).toFixed(2);
        const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);

        // Performance metrics

        // Transform to expected format
        return data.map(country => ({
          id: country.id,
          name: country.name,
          iso_a2: country.properties?.iso_a2 || null,
          iso_a3: country.properties?.iso_a3 || null,
          geometry_geojson: country.geometry_geojson,
          properties: country.properties
        }));
      } catch (err) {
        console.error('❌ Error in loadCountriesVectorTiles:', err);
        return [];
      }
    };

    const loadStatesVectorTiles = async (bounds, zoom) => {
      // Use simplified boundaries function instead of MVT tiles
      // This returns GeoJSON data that can be rendered directly
      const startTime = performance.now();

      try {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
          .schema('gis')
          .rpc('get_simplified_boundaries_in_bbox', {
            boundary_type: 'states',
            zoom_level: zoom,
            bbox_west: bounds.getWest(),
            bbox_south: bounds.getSouth(),
            bbox_east: bounds.getEast(),
            bbox_north: bounds.getNorth(),
            country_filter: null
          });

        const fetchTime = performance.now() - startTime;

        if (error) {
          console.error('❌ Error loading states with vector tiles:', error);
          return [];
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Calculate data size
        const dataSize = new Blob([JSON.stringify(data)]).size;
        const dataSizeKB = (dataSize / 1024).toFixed(2);
        const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);

        // Performance metrics

        // Transform to expected format
        return data.map(state => ({
          id: state.id,
          name: state.name,
          name_en: state.properties?.name_en || state.name,
          iso_a2: state.properties?.iso_a2 || null,
          adm1_code: state.properties?.adm1_code || null,
          admin: state.properties?.admin || null,
          geometry_geojson: state.geometry_geojson,
          properties: state.properties
        }));
      } catch (err) {
        console.error('❌ Error in loadStatesVectorTiles:', err);
        return [];
      }
    };

    const handleCountryHover = (e, feature) => {
      const layer = e.target;

      hoveredCountry.value = feature.properties;

      layer.setStyle({
        fillColor: props.content?.countryHoverColor || '#ff0000',
        fillOpacity: props.content?.countryHoverOpacity || 0.3
      });

      emit('trigger-event', {
        name: 'country-hover',
        event: {
          country: feature.properties,
          coordinates: { lat: e.latlng.lat, lng: e.latlng.lng }
        }
      });
    };

    const handleCountryHoverOut = (e, feature) => {
      const layer = e.target;

      if (selectedCountry.value?.id !== feature.properties.id) {
        layer.setStyle({
          fillColor: 'transparent',
          fillOpacity: 0
        });
      }

      hoveredCountry.value = null;

      emit('trigger-event', {
        name: 'country-hover-out',
        event: { country: feature.properties }
      });
    };

    const handleCountryClick = (e, feature) => {
      const isCurrentlySelected = selectedCountry.value?.id === feature.properties.id;

      if (isCurrentlySelected) {
        selectedCountry.value = null;
        setSelectedCountryData(null);

        e.target.setStyle({
          fillColor: 'transparent',
          fillOpacity: 0
        });

        emit('trigger-event', {
          name: 'country-deselected',
          event: { country: feature.properties }
        });
      } else {
        if (countryBoundaryLayer.value) {
          countryBoundaryLayer.value.eachLayer(layer => {
            layer.setStyle({
              fillColor: 'transparent',
              fillOpacity: 0
            });
          });
        }

        selectedCountry.value = feature.properties;
        setSelectedCountryData(feature.properties);

        e.target.setStyle({
          fillColor: props.content?.countrySelectedColor || '#0000ff',
          fillOpacity: props.content?.countrySelectedOpacity || 0.5
        });

        emit('trigger-event', {
          name: 'country-selected',
          event: { country: feature.properties }
        });
      }

      emit('trigger-event', {
        name: 'country-click',
        event: {
          country: feature.properties,
          coordinates: { lat: e.latlng.lat, lng: e.latlng.lng },
          action: isCurrentlySelected ? 'deselected' : 'selected'
        }
      });
    };

    const handleStateHover = (e, feature) => {
      const layer = e.target;

      hoveredState.value = feature.properties;

      layer.setStyle({
        fillColor: props.content?.stateHoverColor || '#ff0000',
        fillOpacity: props.content?.stateHoverOpacity || 0.3
      });

      emit('trigger-event', {
        name: 'state-hover',
        event: {
          state: feature.properties,
          coordinates: { lat: e.latlng.lat, lng: e.latlng.lng }
        }
      });
    };

    const handleStateHoverOut = (e, feature) => {
      const layer = e.target;

      if (selectedState.value?.id !== feature.properties.id) {
        layer.setStyle({
          fillColor: 'transparent',
          fillOpacity: 0
        });
      }

      hoveredState.value = null;

      emit('trigger-event', {
        name: 'state-hover-out',
        event: { state: feature.properties }
      });
    };

    const handleStateClick = (e, feature) => {
      const isCurrentlySelected = selectedState.value?.id === feature.properties.id;

      if (isCurrentlySelected) {
        selectedState.value = null;
        setSelectedStateData(null);

        e.target.setStyle({
          fillColor: 'transparent',
          fillOpacity: 0
        });

        emit('trigger-event', {
          name: 'state-deselected',
          event: { state: feature.properties }
        });
      } else {
        if (stateBoundaryLayer.value) {
          stateBoundaryLayer.value.eachLayer(layer => {
            layer.setStyle({
              fillColor: 'transparent',
              fillOpacity: 0
            });
          });
        }

        selectedState.value = feature.properties;
        setSelectedStateData(feature.properties);

        e.target.setStyle({
          fillColor: props.content?.stateSelectedColor || '#0000ff',
          fillOpacity: props.content?.stateSelectedOpacity || 0.5
        });

        emit('trigger-event', {
          name: 'state-selected',
          event: { state: feature.properties }
        });
      }

      emit('trigger-event', {
        name: 'state-click',
        event: {
          state: feature.properties,
          coordinates: { lat: e.latlng.lat, lng: e.latlng.lng },
          action: isCurrentlySelected ? 'deselected' : 'selected'
        }
      });
    };

    const renderCountryBoundaries = (boundaries) => {

      if (countryBoundaryLayer.value) {
        map.value.removeLayer(countryBoundaryLayer.value);
      }

      const geoJsonData = boundaryAPI.toGeoJSON(boundaries);

      countryBoundaryLayer.value = L.geoJSON(geoJsonData, {
        style: (feature) => {
          // Check if this feature is selected
          const isSelected = selectedCountry.value?.id === feature?.properties?.id;

          if (isSelected) {
            return {
              fillColor: props.content?.countrySelectedColor || '#0000ff',
              fillOpacity: props.content?.countrySelectedOpacity || 0.5,
              color: props.content?.countryBorderColor || '#666666',
              weight: props.content?.countryBorderWidth || 1,
              opacity: props.content?.countryBorderOpacity || 0.5
            };
          }

          return {
            fillColor: 'transparent',
            fillOpacity: 0,
            color: props.content?.countryBorderColor || '#666666',
            weight: props.content?.countryBorderWidth || 1,
            opacity: props.content?.countryBorderOpacity || 0.5
          };
        },
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: (e) => handleCountryHover(e, feature),
            mouseout: (e) => handleCountryHoverOut(e, feature),
            click: (e) => handleCountryClick(e, feature)
          });
        }
      }).addTo(map.value);
    };

    const renderStateBoundaries = (boundaries) => {
      if (stateBoundaryLayer.value) {
        map.value.removeLayer(stateBoundaryLayer.value);
      }

      const geoJsonData = boundaryAPI.toGeoJSON(boundaries);

      stateBoundaryLayer.value = L.geoJSON(geoJsonData, {
        style: (feature) => {
          // Check if this feature is selected
          const isSelected = selectedState.value?.id === feature?.properties?.id;

          if (isSelected) {
            return {
              fillColor: props.content?.stateSelectedColor || '#0000ff',
              fillOpacity: props.content?.stateSelectedOpacity || 0.5,
              color: props.content?.stateBorderColor || '#666666',
              weight: props.content?.stateBorderWidth || 1,
              opacity: props.content?.stateBorderOpacity || 0.5
            };
          }

          return {
            fillColor: 'transparent',
            fillOpacity: 0,
            color: props.content?.stateBorderColor || '#666666',
            weight: props.content?.stateBorderWidth || 1,
            opacity: props.content?.stateBorderOpacity || 0.5
          };
        },
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: (e) => handleStateHover(e, feature),
            mouseout: (e) => handleStateHoverOut(e, feature),
            click: (e) => handleStateClick(e, feature)
          });
        }
      }).addTo(map.value);
    };

    const updateBoundaries = async () => {
      if (!map.value) return;

      if (props.content?.enableCountryHover) {
        await loadCountryBoundaries();
      } else if (countryBoundaryLayer.value) {
        map.value.removeLayer(countryBoundaryLayer.value);
        countryBoundaryLayer.value = null;
      }

      if (props.content?.enableStateHover) {
        await loadStateBoundaries();
      } else if (stateBoundaryLayer.value) {
        map.value.removeLayer(stateBoundaryLayer.value);
        stateBoundaryLayer.value = null;
      }
    };

    // Debounced version to prevent excessive boundary updates during pan/zoom
    const debouncedUpdateBoundaries = () => {
      clearTimeout(boundaryDebounceTimer.value);
      boundaryDebounceTimer.value = setTimeout(() => {
        updateBoundaries();
      }, 250); // 250ms debounce delay
    };

    const updateCountryBoundaryStyles = () => {
      if (!countryBoundaryLayer.value) return;

      countryBoundaryLayer.value.eachLayer(layer => {
        const feature = layer.feature;
        const isSelected = selectedCountry.value?.id === feature?.properties?.id;

        if (isSelected) {
          layer.setStyle({
            fillColor: props.content?.countrySelectedColor || '#0000ff',
            fillOpacity: props.content?.countrySelectedOpacity || 0.5,
            color: props.content?.countryBorderColor || '#666666',
            weight: props.content?.countryBorderWidth || 1,
            opacity: props.content?.countryBorderOpacity || 0.5
          });
        } else {
          layer.setStyle({
            fillColor: 'transparent',
            fillOpacity: 0,
            color: props.content?.countryBorderColor || '#666666',
            weight: props.content?.countryBorderWidth || 1,
            opacity: props.content?.countryBorderOpacity || 0.5
          });
        }
      });
    };

    const updateStateBoundaryStyles = () => {
      if (!stateBoundaryLayer.value) return;

      stateBoundaryLayer.value.eachLayer(layer => {
        const feature = layer.feature;
        const isSelected = selectedState.value?.id === feature?.properties?.id;

        if (isSelected) {
          layer.setStyle({
            fillColor: props.content?.stateSelectedColor || '#0000ff',
            fillOpacity: props.content?.stateSelectedOpacity || 0.5,
            color: props.content?.stateBorderColor || '#666666',
            weight: props.content?.stateBorderWidth || 1,
            opacity: props.content?.stateBorderOpacity || 0.5
          });
        } else {
          layer.setStyle({
            fillColor: 'transparent',
            fillOpacity: 0,
            color: props.content?.stateBorderColor || '#666666',
            weight: props.content?.stateBorderWidth || 1,
            opacity: props.content?.stateBorderOpacity || 0.5
          });
        }
      });
    };

    const createMultiUserHeatmap = (users) => {
      const zoneToIntensity = {
        '1a': 0.1, '1b': 0.15, '2a': 0.2, '2b': 0.25, '3a': 0.3, '3b': 0.35,
        '4a': 0.4, '4b': 0.45, '5a': 0.5, '5b': 0.55, '6a': 0.6, '6b': 0.65,
        '7a': 0.7, '7b': 0.75, '8a': 0.8, '8b': 0.85, '9a': 0.9, '9b': 0.95,
        '10a': 1.0, '10b': 1.05, '11a': 1.1, '11b': 1.15, '12a': 1.2, '12b': 1.25,
        '13a': 1.3, '13b': 1.35
      };

      const heatmapData = users.map(user => {
        const intensity = zoneToIntensity[user.hardinessZone] || 0.7;
        return [user.lat, user.lng, intensity];
      });

      hardinessHeatmapLayer.value = L.heatLayer(heatmapData, {
        radius: props.content?.hardinessHeatmapRadius || 50,
        blur: 25,
        maxZoom: 17,
        max: 1.4,
        gradient: {
          0.0: '#d6d6ff', 0.1: '#c4c4f2', 0.15: '#ababd9', 0.2: '#ebb0eb',
          0.25: '#dd8fe8', 0.3: '#cf7ddb', 0.35: '#a66bff', 0.4: '#5a75ed',
          0.45: '#73a1ff', 0.5: '#5ec9e0', 0.55: '#47ba47', 0.6: '#78c756',
          0.65: '#abd669', 0.7: '#cddb70', 0.75: '#edda85', 0.8: '#ebcb57',
          0.85: '#dbb64f', 0.9: '#f5b678', 0.95: '#da9132', 1.0: '#e6781e',
          1.05: '#e6561e', 1.1: '#e88564', 1.15: '#d4594e', 1.2: '#b51228',
          1.25: '#962f1d', 1.3: '#751a00'
        }
      }).addTo(map.value);
    };

    const initializeMap = () => {
      if (!mapContainer.value) {
        return;
      }

      const lat = props.content?.initialLat || 51.505;
      const lng = props.content?.initialLng || -0.09;
      const zoom = props.content?.initialZoom || 13;

      try {
        if (map.value) {
          map.value.remove();
          map.value = null;
        }

        map.value = L.map(mapContainer.value, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          boxZoom: true,
          keyboard: true,
          zoomControl: true,
          tap: true,
          trackResize: true
        }).setView([lat, lng], zoom);

        // Ensure dragging is explicitly enabled
        if (map.value.dragging) {
          map.value.dragging.enable();
        }

        // Initialize map components (tile layer will be lazy-loaded by updateMapType)
        updateMapType();
        setupResizeObserver();

        // Wait for map to be fully ready before attaching event listeners
        map.value.whenReady(async () => {
          // Attach ALL event listeners inside whenReady to prevent null reference errors
          map.value.on('click', onMapClick);
          map.value.on('moveend', () => {
            debouncedUpdateBoundaries();
            debouncedUpdateMarkers(); // Update visible markers on pan (virtualization)
          });
          map.value.on('zoomend', () => {
            debouncedUpdateBoundaries();
            debouncedUpdateMarkers(); // Update visible markers on zoom (virtualization)
          });

          // Initialize map features after ready
          updateMarkers();
          updatePrivacyMode();
          updateHardinessHeatmap();
          await updateBoundaries(); // Initial load is not debounced

          emit('trigger-event', {
            name: 'map-ready',
            event: {}
          });
        });
      } catch (error) {
        // Silent fail - map initialization errors handled by re-init
      }
    };

    const reinitializeMap = () => {
      if (mapContainer.value) {
        initializeMap();
      }
    };

    // Focused watchers - More performant than single massive watcher
    // Watch map type changes
    watch(() => props.content?.mapType, () => {
      nextTick(() => updateMapType());
    });

    // Watch map position/zoom changes
    watch(() => [
      props.content?.initialLat,
      props.content?.initialLng,
      props.content?.initialZoom
    ], () => {
      nextTick(() => updateMapView());
    });

    // Watch clustering changes
    watch(() => [
      props.content?.enableClustering,
      props.content?.clusterMaxZoom
    ], () => {
      nextTick(() => updateMarkers());
    });

    // Watch geolocation request
    watch(() => props.content?.requestGeolocation, (newVal) => {
      if (newVal && !geolocationRequested.value) {
        requestUserLocation();
      }
    });

    // Watch privacy mode changes
    watch(() => [
      props.content?.showUserLocation,
      props.content?.centerOnUserLocation,
      props.content?.enablePrivacyMode
    ], () => {
      nextTick(() => updatePrivacyMode());
    });

    // Watch privacy radius changes
    watch(() => [
      props.content?.privacyRadius,
      props.content?.privacyRadiusMiles,
      props.content?.privacyUnit
    ], () => {
      nextTick(() => updatePrivacyCircle());
    });

    // Watch hardiness heatmap changes
    watch(() => [
      props.content?.showHardinessHeatmap,
      props.content?.hardinessHeatmapRadius,
      props.content?.userHardinessZone
    ], () => {
      nextTick(() => updateHardinessHeatmap());
    });

    // Watch online status changes
    watch(() => props.content?.isOnline, () => {
      updateMarkers();
      if (userLocationMarker.value) {
        updateUserLocationMarker();
      }
    });

    // Watch boundary settings changes
    watch(() => [
      props.content?.enableCountryHover,
      props.content?.enableStateHover,
      props.content?.countryMinZoom,
      props.content?.countryMaxZoom,
      props.content?.stateMinZoom,
      props.content?.stateMaxZoom
    ], () => {
      nextTick(() => updateBoundaries());
    });

    // Watch style properties separately
    watch(() => [
      props.content?.mapHeight,
      props.content?.mapStyle
    ], () => {
      nextTick(() => {
        setTimeout(() => {
          safeInvalidateSize();
        }, 100);
      });
    }, { deep: true });

    // Watch boundary styling properties (style-only updates, no re-fetch)
    watch(() => [
      props.content?.countryHoverColor,
      props.content?.countryHoverOpacity,
      props.content?.countryBorderColor,
      props.content?.countryBorderWidth,
      props.content?.countryBorderOpacity,
      props.content?.countrySelectedColor,
      props.content?.countrySelectedOpacity,
      props.content?.stateHoverColor,
      props.content?.stateHoverOpacity,
      props.content?.stateBorderColor,
      props.content?.stateBorderWidth,
      props.content?.stateBorderOpacity,
      props.content?.stateSelectedColor,
      props.content?.stateSelectedOpacity
    ], () => {
      nextTick(() => {
        updateCountryBoundaryStyles();
        updateStateBoundaryStyles();
      });
    }, { deep: true });

    // Watch processed markers and users data
    watch(processedMarkers, () => {
      updateMarkers();
    }, { deep: true });

    watch(processedUsersHardinessData, () => {
      nextTick(() => updateHardinessHeatmap());
    }, { deep: true });

    // Lifecycle
    onMounted(() => {
      nextTick(() => {
        initializeMap();
        if (props.content?.requestGeolocation) {
          requestUserLocation();
        }

        setTimeout(() => {
          safeInvalidateSize();
        }, 100);
      });
    });

    onBeforeUnmount(() => {
      // Clear all timers
      if (resizeTimeout.value) {
        clearTimeout(resizeTimeout.value);
        resizeTimeout.value = null;
      }

      if (geocodingDebounceTimer.value) {
        clearTimeout(geocodingDebounceTimer.value);
        geocodingDebounceTimer.value = null;
      }

      if (boundaryDebounceTimer.value) {
        clearTimeout(boundaryDebounceTimer.value);
        boundaryDebounceTimer.value = null;
      }

      if (markerDebounceTimer.value) {
        clearTimeout(markerDebounceTimer.value);
        markerDebounceTimer.value = null;
      }

      // Cancel pending geocoding requests
      if (geocodingAbortController.value) {
        geocodingAbortController.value.abort();
        geocodingAbortController.value = null;
      }

      // Disconnect observers
      if (resizeObserver.value) {
        resizeObserver.value.disconnect();
        resizeObserver.value = null;
      }

      // Clean up all map layers
      if (map.value) {
        // Remove all event listeners to prevent memory leaks
        map.value.off();

        // Remove all layers
        if (hardinessHeatmapLayer.value) {
          map.value.removeLayer(hardinessHeatmapLayer.value);
          hardinessHeatmapLayer.value = null;
        }

        if (countryBoundaryLayer.value) {
          map.value.removeLayer(countryBoundaryLayer.value);
          countryBoundaryLayer.value = null;
        }

        if (stateBoundaryLayer.value) {
          map.value.removeLayer(stateBoundaryLayer.value);
          stateBoundaryLayer.value = null;
        }

        if (markersLayer.value) {
          map.value.removeLayer(markersLayer.value);
          markersLayer.value = null;
        }

        if (clusterGroup.value) {
          map.value.removeLayer(clusterGroup.value);
          clusterGroup.value = null;
        }

        if (userLocationMarker.value) {
          userLocationMarker.value.off();
          map.value.removeLayer(userLocationMarker.value);
          userLocationMarker.value = null;
        }

        if (userMarkedLocationMarker.value) {
          userMarkedLocationMarker.value.off();
          map.value.removeLayer(userMarkedLocationMarker.value);
          userMarkedLocationMarker.value = null;
        }

        if (privacyCircle.value) {
          map.value.removeLayer(privacyCircle.value);
          privacyCircle.value = null;
        }

        // Remove all tile layers
        if (tileLayers.value) {
          Object.values(tileLayers.value).forEach(layer => {
            if (layer && map.value.hasLayer(layer)) {
              map.value.removeLayer(layer);
            }
          });
          tileLayers.value = {};
        }

        // Finally remove the map itself
        map.value.remove();
        map.value = null;
      }
    });

    return {
      // Template refs
      mapContainer,
      // Computed
      mapContainerStyle,
      mapStyle,
      showLocationInstructions,
      geolocationRequested,
      geolocationDenied,
      /* wwEditor:start */
      isEditing,
      /* wwEditor:end */
      // Expose for debugging if needed
      content: computed(() => props.content)
    };
  }
};
</script>

<style lang="scss" scoped>
.openstreet-map {
  position: relative;
  width: 100%;
  height: var(--map-height);
  min-height: 200px;

  .map-container {
    width: 100%;
    height: 100%;
    min-height: 200px;
    background: #f0f0f0;
    position: relative;
  }

  .location-instructions {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    text-align: center;
    pointer-events: none;

    p {
      margin: 0;
    }
  }
}

:global(.user-location-marker) {
  background: transparent;
  border: none;

  .user-location-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #4285f4;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    position: relative;

    &.online {
      background: #4CAF50;
    }

    &.offline {
      background: #9E9E9E;
    }

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: white;
    }
  }
}

:global(.marker-cluster) {
  background: rgba(181, 226, 140, 0.6) !important;
  border: 2px solid rgba(110, 204, 57, 0.8) !important;
  border-radius: 50% !important;
}

:global(.marker-cluster:hover) {
  background: rgba(181, 226, 140, 0.8) !important;
  border-color: rgba(110, 204, 57, 1) !important;
  box-shadow: none !important;
}

:global(.marker-cluster div) {
  background: transparent !important;
  color: #000 !important;
  font-weight: bold !important;
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.8) !important;
}

:global(.user-marked-location) {
  background: transparent;
  border: none;

  .user-marked-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #ff6b6b;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    position: relative;

    &.online {
      background: #4CAF50;
    }

    &.offline {
      background: #9E9E9E;
    }

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: white;
    }
  }
}

:global(.marker-popup) {
  text-align: center;

  h4 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: #666;
  }
}

@media (max-width: 768px) {
  .openstreet-map {
    .location-instructions {
      bottom: 5px;
      left: 5px;
      right: 5px;
      transform: none;
      font-size: 12px;
    }
  }
}
</style>
