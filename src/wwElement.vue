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
console.log('📦 Loading Leaflet dependencies...');
import L from 'leaflet';
console.log('✅ Leaflet loaded:', typeof L);
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
console.log('✅ Leaflet MarkerCluster loaded');
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.heat';
console.log('✅ Leaflet Heat loaded');
import { boundaryAPI, boundaryCache, getSupabaseClient } from './supabaseClient.js';
console.log('✅ Supabase client loaded');
import { vectorTileClient } from './vectorTileClient.js';
console.log('✅ Vector tile client loaded');

// Fix Leaflet's default marker icon issue
console.log('🔧 Fixing Leaflet marker icons...');
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});
console.log('✅ Leaflet marker icons fixed');

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
    console.log('🚀 OpenStreetMap setup() function called!');
    try {
      // CRITICAL: Ensure wwLib is available as global, with fallback
      console.log('🔍 OpenStreetMap: Checking wwLib availability...');
      console.log('typeof wwLib:', typeof wwLib);
      console.log('wwLib exists:', !!wwLib);
      console.log('wwLib.wwVariable exists:', !!(wwLib && wwLib.wwVariable));
      console.log('wwLib.wwVariable.useComponentVariable type:', typeof (wwLib && wwLib.wwVariable && wwLib.wwVariable.useComponentVariable));

      const hasWwLib = typeof wwLib !== 'undefined' && wwLib && wwLib.wwVariable && typeof wwLib.wwVariable.useComponentVariable === 'function';

      if (!hasWwLib) {
        console.warn('⚠️ OpenStreetMap: wwLib not fully available - component will use fallback mode');
        console.warn('Available global objects:', Object.keys(window || global || {}));
      } else {
        console.log('✅ OpenStreetMap: wwLib is fully available');
      }

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
      const selectedLocationMarkers = ref(null); // Layer group for selected location markers
      const selectedCountries = ref(new Set());
      const selectedStates = ref(new Set());
      const selectedLocations = ref([]);
      const selectedCountry = ref(null);
      const selectedState = ref(null);
      const hoveredCountry = ref(null);
      const hoveredState = ref(null);
      const geocodingDebounceTimer = ref(null);

      // Component state
      const geolocationRequested = ref(false);
      const geolocationDenied = ref(false);
      const showUserLocation = ref(false);
      const userExactLat = ref(null);
      const userExactLng = ref(null);

      // Template refs
      const mapContainer = ref(null);

    // Internal variables for NoCode users
    console.log('🔧 Setting up component variables...');
    const { value: selectedLocation, setValue: setSelectedLocation } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'selectedLocation',
          type: 'object',
          defaultValue: null,
        })
      : { value: ref(null), setValue: () => {} };
    console.log('selectedLocation variable setup:', { hasWwLib, value: selectedLocation.value });

    const { value: userLocation, setValue: setUserLocation } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'userLocation',
          type: 'object',
          defaultValue: null,
        })
      : { value: ref(null), setValue: () => {} };

    const { value: clickedLocation, setValue: setClickedLocation } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'clickedLocation',
          type: 'object',
          defaultValue: null,
        })
      : { value: ref(null), setValue: () => {} };

    const { value: selectedCountriesData, setValue: setSelectedCountriesData } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'selectedCountries',
          type: 'array',
          defaultValue: [],
        })
      : { value: ref([]), setValue: () => {} };

    const { value: selectedStatesData, setValue: setSelectedStatesData } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'selectedStates',
          type: 'array',
          defaultValue: [],
        })
      : { value: ref([]), setValue: () => {} };

    const { value: selectedLocationsData, setValue: setSelectedLocationsData } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'selectedLocations',
          type: 'array',
          defaultValue: [],
        })
      : { value: ref([]), setValue: () => {} };

    const { value: selectedCountryData, setValue: setSelectedCountryData } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'selectedCountry',
          type: 'object',
          defaultValue: null,
        })
      : { value: ref(null), setValue: () => {} };

    const { value: selectedStateData, setValue: setSelectedStateData } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'selectedState',
          type: 'object',
          defaultValue: null,
        })
      : { value: ref(null), setValue: () => {} };

    const { value: geocodedAddress, setValue: setGeocodedAddress } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'geocodedAddress',
          type: 'object',
          defaultValue: null,
        })
      : { value: ref(null), setValue: () => {} };

    const { value: currentZoomLevel, setValue: setCurrentZoomLevel } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'currentZoomLevel',
          type: 'number',
          defaultValue: 13,
        })
      : { value: ref(13), setValue: () => {} };

    const { value: locationContext, setValue: setLocationContext } = hasWwLib
      ? wwLib.wwVariable.useComponentVariable({
          uid: props.uid,
          name: 'locationContext',
          type: 'object',
          defaultValue: null,
        })
      : { value: ref(null), setValue: () => {} };

    // Computed styles
    const mapContainerStyle = computed(() => ({
      '--border-radius': props.content?.mapStyle || '8px',
      height: props.content?.mapHeight || '400px'
    }));

    const mapStyle = computed(() => ({
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

    // Helper: Get parent country for a state
    const getStateParentCountry = (stateId) => {
      if (!stateBoundaryLayer.value) return null;

      let parentCountry = null;
      stateBoundaryLayer.value.eachLayer(layer => {
        if (layer.feature?.properties?.id === stateId) {
          const stateCountryId = layer.feature.properties.country_id;

          if (countryBoundaryLayer.value) {
            countryBoundaryLayer.value.eachLayer(countryLayer => {
              if (countryLayer.feature?.properties?.id === stateCountryId) {
                parentCountry = countryLayer.feature.properties;
              }
            });
          }
        }
      });

      return parentCountry;
    };

    // Helper: Get parent state for a location
    const getLocationParentState = async (lat, lng) => {
      const supabase = getSupabaseClient();
      if (!supabase) return null; // Gracefully handle missing Supabase

      const zoom = map.value?.getZoom() || 13;
      const stateMinZoom = props.content?.stateMinZoom ?? 4;

      if (zoom < stateMinZoom) return null;

      try {
        const { data: stateData } = await supabase
          .schema('gis')
          .rpc('find_state_at_point', {
            point_lat: lat,
            point_lng: lng
          });

        if (stateData && stateData.length > 0) {
          return {
            id: stateData[0].id,
            name: stateData[0].name,
            name_en: stateData[0].name_en || stateData[0].name,
            adm1_code: stateData[0].adm1_code,
            admin: stateData[0].admin,
            country_id: stateData[0].country_id
          };
        }
      } catch (error) {
        console.error('Error finding parent state:', error);
      }

      return null;
    };

    // Helper: Get parent country for a location
    const getLocationParentCountry = async (lat, lng) => {
      const supabase = getSupabaseClient();
      if (!supabase) return null; // Gracefully handle missing Supabase

      try {
        const { data: countryData } = await supabase
          .schema('gis')
          .rpc('find_country_at_point', {
            point_lat: lat,
            point_lng: lng
          });

        if (countryData && countryData.length > 0) {
          return {
            id: countryData[0].id,
            name: countryData[0].name,
            iso_a2: countryData[0].iso_a2,
            iso_a3: countryData[0].iso_a3
          };
        }
      } catch (error) {
        console.error('Error finding parent country:', error);
      }

      return null;
    };

    // Helper: Update internal variables with current selections
    const updateSelectionVariables = () => {
      setSelectedCountriesData(Array.from(selectedCountries.value).map(id => {
        let countryData = null;

        if (countryBoundaryLayer.value) {
          countryBoundaryLayer.value.eachLayer(layer => {
            if (layer.feature?.properties?.id === id) {
              countryData = layer.feature.properties;
            }
          });
        }

        return countryData;
      }).filter(Boolean));

      setSelectedStatesData(Array.from(selectedStates.value).map(id => {
        let stateData = null;

        if (stateBoundaryLayer.value) {
          stateBoundaryLayer.value.eachLayer(layer => {
            if (layer.feature?.properties?.id === id) {
              stateData = layer.feature.properties;
            }
          });
        }

        return stateData;
      }).filter(Boolean));

      setSelectedLocationsData(selectedLocations.value);
    };

    // Helper: Update selected location markers on map
    const updateSelectedLocationMarkers = () => {
      if (!map.value) return;

      // Remove existing layer group
      if (selectedLocationMarkers.value) {
        map.value.removeLayer(selectedLocationMarkers.value);
      }

      // Create new layer group for selected locations
      selectedLocationMarkers.value = L.layerGroup();

      // Add marker for each selected location
      selectedLocations.value.forEach(location => {
        const markerColor = props.content?.selectedLocationMarkerColor || '#FF5722';
        const marker = L.marker([location.lat, location.lng], {
          icon: L.divIcon({
            className: 'selected-location-marker',
            html: `<div class="selected-location-dot" style="background-color: ${markerColor}; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        });

        // Add click handler for marker - toggle deselection
        marker.on('click', (e) => {
          // Stop event propagation to prevent map click
          L.DomEvent.stopPropagation(e);

          // Remove this location from selections
          selectedLocations.value = selectedLocations.value.filter(loc => loc.id !== location.id);

          // Check if we should deselect parent state
          const parentStateId = location.parentState?.id;
          if (parentStateId) {
            // Check if any other locations still exist in this state
            const hasOtherLocationsInState = selectedLocations.value.some(loc =>
              loc.parentState?.id === parentStateId
            );

            // If no more locations in this state, deselect the state
            if (!hasOtherLocationsInState) {
              selectedStates.value.delete(parentStateId);

              // Update state visual style
              if (stateBoundaryLayer.value) {
                stateBoundaryLayer.value.eachLayer(layer => {
                  if (layer.feature?.properties?.id === parentStateId) {
                    layer.setStyle({
                      fillColor: 'transparent',
                      fillOpacity: 0
                    });
                  }
                });
              }

              // Check if we should deselect parent country
              const parentCountryId = location.parentCountry?.id;
              if (parentCountryId) {
                // Check if any other states still exist in this country
                const hasOtherStatesInCountry = Array.from(selectedStates.value).some(stateId => {
                  let countryId = null;
                  if (stateBoundaryLayer.value) {
                    stateBoundaryLayer.value.eachLayer(layer => {
                      if (layer.feature?.properties?.id === stateId) {
                        countryId = layer.feature.properties.country_id;
                      }
                    });
                  }
                  return countryId === parentCountryId;
                });

                // Check if any other locations still exist in this country
                const hasOtherLocationsInCountry = selectedLocations.value.some(loc =>
                  loc.parentCountry?.id === parentCountryId
                );

                // If no more states or locations in this country, deselect the country
                if (!hasOtherStatesInCountry && !hasOtherLocationsInCountry) {
                  selectedCountries.value.delete(parentCountryId);

                  // Update country visual style
                  if (countryBoundaryLayer.value) {
                    countryBoundaryLayer.value.eachLayer(layer => {
                      if (layer.feature?.properties?.id === parentCountryId) {
                        layer.setStyle({
                          fillColor: 'transparent',
                          fillOpacity: 0
                        });
                      }
                    });
                  }
                }
              }
            }
          }

          // Update markers and variables
          updateSelectedLocationMarkers();
          updateSelectionVariables();
          updateLocationContext();

          emit('trigger-event', {
            name: 'location-deselected',
            event: {
              location: location,
              position: { lat: location.lat, lng: location.lng }
            }
          });
        });

        selectedLocationMarkers.value.addLayer(marker);
      });

      // Add layer group to map
      selectedLocationMarkers.value.addTo(map.value);
    };

    // Methods
    const setupTileLayers = () => {
      tileLayers.value = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
        }),
        terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenTopoMap contributors'
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© CartoDB, © OpenStreetMap contributors'
        }),
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '© CartoDB, © OpenStreetMap contributors'
        })
      };
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
      if (!map.value || !tileLayers.value) return;

      const newMapType = currentMapType.value;

      Object.values(tileLayers.value).forEach(layer => {
        if (map.value.hasLayer(layer)) {
          map.value.removeLayer(layer);
        }
      });

      const selectedLayer = tileLayers.value[newMapType];
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
          clusterGroup.value = L.markerClusterGroup({
            maxClusterRadius: 50,
            disableClusteringAtZoom: props.content?.clusterMaxZoom || 15,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            spiderfyOnMaxZoom: true
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
          markersLayer.value = L.layerGroup();

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

            markersLayer.value.addLayer(marker);
          });

          map.value.addLayer(markersLayer.value);
        }
      } catch (error) {
        // Silent fail - marker update errors handled gracefully
      }
    };

    const updateUserLocationMarker = () => {
      if (!userLocationMarker.value || !userExactLat.value || !userExactLng.value) return;

      try {
        const markerColor = props.content?.isOnline ? '#4CAF50' : '#9E9E9E';
        const newIcon = L.divIcon({
          className: 'user-location-marker',
          html: `<div class="user-location-dot" style="background-color: ${markerColor}; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);"></div>`,
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

        const markerColor = props.content?.isOnline ? '#4CAF50' : '#9E9E9E';
        userLocationMarker.value = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: `<div class="user-location-dot" style="background-color: ${markerColor}; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);"></div>`,
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

    const updateLocationContext = () => {
      const zoom = map.value?.getZoom() || 13;
      const threshold = props.content?.locationZoomThreshold || 8;

      if (zoom >= threshold) {
        // At or above threshold: location mode
        const contextData = {
          mode: 'location',
          zoom: zoom,
          countries: selectedCountriesData.value || [],
          states: selectedStatesData.value || [],
          locations: selectedLocationsData.value || []
        };

        // Build hierarchical location string
        const parts = [];
        if (selectedCountriesData.value?.length > 0) {
          parts.push(`Countries: ${selectedCountriesData.value.map(c => c.name).join(', ')}`);
        }
        if (selectedStatesData.value?.length > 0) {
          parts.push(`States: ${selectedStatesData.value.map(s => s.name).join(', ')}`);
        }
        if (selectedLocationsData.value?.length > 0) {
          parts.push(`Locations: ${selectedLocationsData.value.length}`);
        }
        contextData.hierarchicalLocation = parts.join(' / ');

        setLocationContext(contextData);
      } else {
        // Below threshold: boundary mode
        const contextData = {
          mode: 'boundary',
          zoom: zoom,
          countries: selectedCountriesData.value || [],
          states: selectedStatesData.value || [],
          locations: []
        };

        // Build hierarchical location string for boundary mode
        const parts = [];
        if (selectedCountriesData.value?.length > 0) {
          parts.push(`Countries: ${selectedCountriesData.value.map(c => c.name).join(', ')}`);
        }
        if (selectedStatesData.value?.length > 0) {
          parts.push(`States: ${selectedStatesData.value.map(s => s.name).join(', ')}`);
        }
        contextData.hierarchicalLocation = parts.length > 0 ? parts.join(' / ') : null;

        setLocationContext(contextData);
      }
    };

    const onMapClick = async (e) => {
      if (!map.value) return;

      const { lat, lng } = e.latlng;
      const zoom = map.value.getZoom();
      const threshold = props.content?.locationZoomThreshold || 8;

      // Detect geographic location (country/state) from clicked coordinates with zoom awareness
      const detected = await detectGeographicLocation(lat, lng, zoom);

      emit('trigger-event', {
        name: 'map-click',
        event: {
          position: { lat, lng },
          zoom: zoom,
          mode: zoom >= threshold ? 'location' : 'boundary',
          country: detected.country,
          state: detected.state
        }
      });

      // At location zoom threshold - add location to selections with hierarchical parents
      if (zoom >= threshold && props.content?.allowClickToMark) {
        // Get parent state and country
        const parentState = await getLocationParentState(lat, lng);
        const parentCountry = await getLocationParentCountry(lat, lng);

        // Add location to selections
        const locationData = {
          id: `loc-${Date.now()}`,
          lat,
          lng,
          timestamp: new Date().toISOString(),
          parentState: parentState,
          parentCountry: parentCountry
        };

        selectedLocations.value.push(locationData);

        // Auto-select parent state
        if (parentState?.id) {
          selectedStates.value.add(parentState.id);

          // Update parent state visual style
          if (stateBoundaryLayer.value) {
            stateBoundaryLayer.value.eachLayer(layer => {
              if (layer.feature?.properties?.id === parentState.id) {
                layer.setStyle({
                  fillColor: props.content?.stateSelectedColor || '#0000ff',
                  fillOpacity: props.content?.stateSelectedOpacity || 0.5
                });
              }
            });
          }
        }

        // Auto-select parent country
        if (parentCountry?.id) {
          selectedCountries.value.add(parentCountry.id);

          // Update parent country visual style
          if (countryBoundaryLayer.value) {
            countryBoundaryLayer.value.eachLayer(layer => {
              if (layer.feature?.properties?.id === parentCountry.id) {
                layer.setStyle({
                  fillColor: props.content?.countrySelectedColor || '#0000ff',
                  fillOpacity: props.content?.countrySelectedOpacity || 0.5
                });
              }
            });
          }
        }

        // Update internal variables and markers
        updateSelectionVariables();
        updateSelectedLocationMarkers();

        setClickedLocation(locationData);
      } else {
        // Clear clicked location in boundary mode
        setClickedLocation(null);
      }

      // Update location context with current zoom-based mode (now includes detected country/state)
      updateLocationContext();

      if (props.content?.enableReverseGeocoding) {
        debouncedReverseGeocode(lat, lng, 'location-geocoded');
      }

      // Only allow marking location at or above threshold
      if (!props.content?.allowClickToMark || zoom < threshold) return;

      try {
        if (userMarkedLocationMarker.value) {
          map.value.removeLayer(userMarkedLocationMarker.value);
        }

        const markerColor = props.content?.isOnline ? '#4CAF50' : '#9E9E9E';
        userMarkedLocationMarker.value = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-marked-location',
            html: `<div class="user-marked-dot" style="background-color: ${markerColor}; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);"></div>`,
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

    // Reverse Geocoding
    const reverseGeocode = async (lat, lng) => {
      if (!props.content?.enableReverseGeocoding) return null;

      try {
        const rateLimit = props.content?.geocodingRateLimit || 1000;

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'WeWebOpenStreetMapComponent/1.0'
            }
          }
        );

        if (!response.ok) {
          console.warn('Geocoding request failed:', response.status);
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

    // Geographic Detection (Country/State from coordinates) - Zoom-aware
    const detectGeographicLocation = async (lat, lng, currentZoom) => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return { country: null, state: null }; // Gracefully handle missing Supabase

        // Get zoom thresholds
        const stateMinZoom = props.content?.stateMinZoom ?? 4;
        const locationZoomThreshold = props.content?.locationZoomThreshold || 8;

        let detectedCountry = null;
        let detectedState = null;

        // Always try to detect country (available at all zoom levels)
        const { data: countryData, error: countryError } = await supabase
          .schema('gis')
          .rpc('find_country_at_point', {
            point_lat: lat,
            point_lng: lng
          });

        if (countryError) {
          console.warn('Country detection error:', countryError);
        }

        if (countryData && countryData.length > 0) {
          detectedCountry = {
            id: countryData[0].id,
            name: countryData[0].name,
            iso_a2: countryData[0].iso_a2,
            iso_a3: countryData[0].iso_a3
          };

          // Update selected country data
          selectedCountry.value = detectedCountry;
          setSelectedCountryData(detectedCountry);

          console.log('✅ Detected country:', detectedCountry.name, 'at zoom:', currentZoom);

          // Only detect state if zoom >= stateMinZoom
          if (currentZoom >= stateMinZoom) {
            const { data: stateData, error: stateError } = await supabase
              .schema('gis')
              .rpc('find_state_at_point', {
                point_lat: lat,
                point_lng: lng,
                country_id: countryData[0].id
              });

            if (stateError) {
              console.warn('State detection error:', stateError);
            }

            if (stateData && stateData.length > 0) {
              detectedState = {
                id: stateData[0].id,
                name: stateData[0].name,
                name_en: stateData[0].name_en || stateData[0].name,
                adm1_code: stateData[0].adm1_code,
                admin: stateData[0].admin
              };

              // Update selected state data
              selectedState.value = detectedState;
              setSelectedStateData(detectedState);

              console.log('✅ Detected state:', detectedState.name, 'at zoom:', currentZoom);
            }
          } else {
            // Clear state data when zoom is below state threshold
            selectedState.value = null;
            setSelectedStateData(null);
            console.log('🔍 Zoom too low for state detection (zoom:', currentZoom, '< min:', stateMinZoom + ')');
          }
        }

        return {
          country: detectedCountry,
          state: detectedState
        };

      } catch (error) {
        console.error('Geographic detection error:', error);
        return {
          country: null,
          state: null
        };
      }
    };

    // Country/State Boundary Rendering
    const loadCountryBoundaries = async () => {
      if (!props.content?.enableCountryHover || !map.value) {
        console.log('❌ Country boundaries loading skipped:', {
          enableCountryHover: props.content?.enableCountryHover,
          mapExists: !!map.value
        });
        return;
      }

      // Check if Supabase is available
      const supabase = getSupabaseClient();
      if (!supabase) {
        console.warn('⚠️ Country boundaries disabled: Supabase not configured');
        return;
      }

      try {
        console.log('🌍 Loading country boundaries...');

        const bounds = map.value.getBounds();
        const zoom = map.value.getZoom();

        // Check zoom level constraints
        const minZoom = props.content?.countryMinZoom ?? 1;
        const maxZoom = props.content?.countryMaxZoom ?? 18;

        if (zoom < minZoom || zoom > maxZoom) {
          console.log('❌ Country boundaries skipped - zoom out of range:', {
            currentZoom: zoom,
            minZoom,
            maxZoom
          });
          // Remove existing layer if present
          if (countryBoundaryLayer.value) {
            map.value.removeLayer(countryBoundaryLayer.value);
            countryBoundaryLayer.value = null;
          }
          return;
        }

        console.log('📍 Map bounds:', {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
          zoom: zoom
        });

        let boundaries;

        if (props.content?.useVectorTiles) {
          console.log('Using vector tiles for countries');
          await vectorTileClient.init();
          boundaries = await loadCountriesVectorTiles(bounds, zoom);
        } else {
          const cacheKey = boundaryCache.generateKey('countries', bounds, zoom);
          const cached = boundaryCache.get(cacheKey);

          if (cached) {
            console.log('Using cached country boundaries');
            boundaries = cached;
          } else {
            console.log('Fetching country boundaries from Supabase');
            boundaries = await boundaryAPI.getCountriesInBounds(bounds, zoom);
            boundaryCache.set(cacheKey, boundaries);
          }
        }

        if (!boundaries || boundaries.length === 0) {
          console.warn('⚠️ No country boundaries loaded');
          return;
        }

        console.log('✅ Boundaries loaded, count:', boundaries.length);
        console.log('📦 Sample boundary:', boundaries[0]);
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

      // Check if Supabase is available
      const supabase = getSupabaseClient();
      if (!supabase) {
        console.warn('⚠️ State boundaries disabled: Supabase not configured');
        return;
      }

      try {
        console.log('Loading state boundaries...');

        const bounds = map.value.getBounds();
        const zoom = map.value.getZoom();

        // Check zoom level constraints
        const minZoom = props.content?.stateMinZoom ?? 4;
        const maxZoom = props.content?.stateMaxZoom ?? 18;

        if (zoom < minZoom || zoom > maxZoom) {
          console.log('State boundaries skipped - zoom out of range:', {
            currentZoom: zoom,
            minZoom,
            maxZoom
          });
          // Remove existing layer if present
          if (stateBoundaryLayer.value) {
            map.value.removeLayer(stateBoundaryLayer.value);
            stateBoundaryLayer.value = null;
          }
          return;
        }

        let boundaries;

        if (props.content?.useVectorTiles) {
          console.log('Using vector tiles for states');
          await vectorTileClient.init();
          boundaries = await loadStatesVectorTiles(bounds, zoom);
        } else {
          const cacheKey = boundaryCache.generateKey('states', bounds, zoom);
          const cached = boundaryCache.get(cacheKey);

          if (cached) {
            console.log('Using cached state boundaries');
            boundaries = cached;
          } else {
            console.log('Fetching state boundaries from Supabase');
            boundaries = await boundaryAPI.getStatesInBounds(bounds, zoom);
            boundaryCache.set(cacheKey, boundaries);
          }
        }

        if (!boundaries || boundaries.length === 0) {
          console.warn('No state boundaries loaded');
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
        if (!supabase) return []; // Gracefully handle missing Supabase

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
          console.log('⚠️ No countries found in bounds');
          return [];
        }

        // Calculate data size
        const dataSize = new Blob([JSON.stringify(data)]).size;
        const dataSizeKB = (dataSize / 1024).toFixed(2);
        const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);

        // Performance metrics
        console.group('📊 Countries Load Performance');
        console.log('✅ Features loaded:', data.length);
        console.log('⏱️ Fetch time:', fetchTime.toFixed(2), 'ms');
        console.log('📦 Data size:', dataSizeMB > 1 ? `${dataSizeMB} MB` : `${dataSizeKB} KB`);
        console.log('⚡ Speed:', ((dataSize / 1024) / (fetchTime / 1000)).toFixed(2), 'KB/s');
        console.log('🎯 Zoom level:', zoom);
        console.groupEnd();

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
        if (!supabase) return []; // Gracefully handle missing Supabase

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
          console.log('⚠️ No states found in bounds');
          return [];
        }

        // Calculate data size
        const dataSize = new Blob([JSON.stringify(data)]).size;
        const dataSizeKB = (dataSize / 1024).toFixed(2);
        const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);

        // Performance metrics
        console.group('📊 States Load Performance');
        console.log('✅ Features loaded:', data.length);
        console.log('⏱️ Fetch time:', fetchTime.toFixed(2), 'ms');
        console.log('📦 Data size:', dataSizeMB > 1 ? `${dataSizeMB} MB` : `${dataSizeKB} KB`);
        console.log('⚡ Speed:', ((dataSize / 1024) / (fetchTime / 1000)).toFixed(2), 'KB/s');
        console.log('🎯 Zoom level:', zoom);
        console.groupEnd();

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

      // Only reset if not selected
      if (!selectedCountries.value.has(feature.properties.id)) {
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
      const countryId = feature.properties.id;
      const isCurrentlySelected = selectedCountries.value.has(countryId);

      if (isCurrentlySelected) {
        // Deselect country AND cascade deselect all child states and locations
        selectedCountries.value.delete(countryId);

        // Deselect all child states
        const childStateIds = [];
        if (stateBoundaryLayer.value) {
          stateBoundaryLayer.value.eachLayer(layer => {
            if (layer.feature?.properties?.country_id === countryId) {
              const stateId = layer.feature.properties.id;
              childStateIds.push(stateId);
              selectedStates.value.delete(stateId);

              // Update state visual style
              layer.setStyle({
                fillColor: 'transparent',
                fillOpacity: 0
              });
            }
          });
        }

        // Count and deselect all child locations
        const locationsBeforeCount = selectedLocations.value.length;
        selectedLocations.value = selectedLocations.value.filter(loc => {
          return loc.parentCountry?.id !== countryId;
        });
        const cascadedLocationsCount = locationsBeforeCount - selectedLocations.value.length;

        // Update location markers
        updateSelectedLocationMarkers();

        e.target.setStyle({
          fillColor: 'transparent',
          fillOpacity: 0
        });

        emit('trigger-event', {
          name: 'country-deselected',
          event: {
            country: feature.properties,
            cascadedStates: childStateIds.length,
            cascadedLocations: cascadedLocationsCount
          }
        });
      } else {
        // Select country (multi-select enabled - does NOT auto-select states/locations)
        selectedCountries.value.add(countryId);

        e.target.setStyle({
          fillColor: props.content?.countrySelectedColor || '#0000ff',
          fillOpacity: props.content?.countrySelectedOpacity || 0.5
        });

        emit('trigger-event', {
          name: 'country-selected',
          event: { country: feature.properties }
        });
      }

      // Update internal variables
      updateSelectionVariables();

      // Update location context after country selection
      updateLocationContext();

      emit('trigger-event', {
        name: 'country-click',
        event: {
          country: feature.properties,
          coordinates: { lat: e.latlng.lat, lng: e.latlng.lng },
          action: isCurrentlySelected ? 'deselected' : 'selected',
          selectedCountries: Array.from(selectedCountries.value),
          selectedStates: Array.from(selectedStates.value),
          selectedLocations: selectedLocations.value.length
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

      // Only reset if not selected
      if (!selectedStates.value.has(feature.properties.id)) {
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
      const stateId = feature.properties.id;
      const isCurrentlySelected = selectedStates.value.has(stateId);

      if (isCurrentlySelected) {
        // Deselect state and cascade to locations
        selectedStates.value.delete(stateId);

        // Remove all child locations in this state
        const removedLocationsCount = selectedLocations.value.length;
        selectedLocations.value = selectedLocations.value.filter(loc => {
          return loc.parentState?.id !== stateId;
        });
        const actualRemoved = removedLocationsCount - selectedLocations.value.length;

        // Update location markers
        updateSelectedLocationMarkers();

        // Check if parent country should be deselected
        // (only if no other states in same country are selected AND no locations in the country)
        const parentCountryId = feature.properties.country_id;
        if (parentCountryId) {
          let hasOtherStatesSelected = false;

          if (stateBoundaryLayer.value) {
            stateBoundaryLayer.value.eachLayer(layer => {
              const layerStateId = layer.feature?.properties?.id;
              const layerCountryId = layer.feature?.properties?.country_id;

              if (
                layerCountryId === parentCountryId &&
                layerStateId !== stateId &&
                selectedStates.value.has(layerStateId)
              ) {
                hasOtherStatesSelected = true;
              }
            });
          }

          // Check if any locations still exist in this country
          const hasLocationsInCountry = selectedLocations.value.some(loc =>
            loc.parentCountry?.id === parentCountryId
          );

          // If no other states OR locations in the same country are selected, deselect the country
          if (!hasOtherStatesSelected && !hasLocationsInCountry) {
            selectedCountries.value.delete(parentCountryId);

            // Update parent country visual style
            if (countryBoundaryLayer.value) {
              countryBoundaryLayer.value.eachLayer(layer => {
                if (layer.feature?.properties?.id === parentCountryId) {
                  layer.setStyle({
                    fillColor: 'transparent',
                    fillOpacity: 0
                  });
                }
              });
            }
          }
        }

        e.target.setStyle({
          fillColor: 'transparent',
          fillOpacity: 0
        });

        emit('trigger-event', {
          name: 'state-deselected',
          event: {
            state: feature.properties,
            cascadedLocations: actualRemoved
          }
        });
      } else {
        // Select state (multi-select enabled) and auto-select parent country
        selectedStates.value.add(stateId);

        // Auto-select parent country
        const parentCountry = getStateParentCountry(stateId);
        if (parentCountry?.id) {
          selectedCountries.value.add(parentCountry.id);

          // Update parent country visual style
          if (countryBoundaryLayer.value) {
            countryBoundaryLayer.value.eachLayer(layer => {
              if (layer.feature?.properties?.id === parentCountry.id) {
                layer.setStyle({
                  fillColor: props.content?.countrySelectedColor || '#0000ff',
                  fillOpacity: props.content?.countrySelectedOpacity || 0.5
                });
              }
            });
          }
        }

        e.target.setStyle({
          fillColor: props.content?.stateSelectedColor || '#0000ff',
          fillOpacity: props.content?.stateSelectedOpacity || 0.5
        });

        emit('trigger-event', {
          name: 'state-selected',
          event: {
            state: feature.properties,
            parentCountry: parentCountry
          }
        });
      }

      // Update internal variables
      updateSelectionVariables();

      // Update location context after state selection
      updateLocationContext();

      emit('trigger-event', {
        name: 'state-click',
        event: {
          state: feature.properties,
          coordinates: { lat: e.latlng.lat, lng: e.latlng.lng },
          action: isCurrentlySelected ? 'deselected' : 'selected',
          selectedCountries: Array.from(selectedCountries.value),
          selectedStates: Array.from(selectedStates.value),
          selectedLocations: selectedLocations.value.length
        }
      });
    };

    const renderCountryBoundaries = (boundaries) => {
      console.log('🎨 Rendering country boundaries:', boundaries.length);

      if (countryBoundaryLayer.value) {
        map.value.removeLayer(countryBoundaryLayer.value);
      }

      const geoJsonData = boundaryAPI.toGeoJSON(boundaries);
      console.log('📄 GeoJSON features:', geoJsonData.features.length);

      countryBoundaryLayer.value = L.geoJSON(geoJsonData, {
        style: (feature) => {
          // Check if this feature is selected (using Set)
          const isSelected = selectedCountries.value.has(feature?.properties?.id);

          if (isSelected) {
            return {
              fillColor: props.content?.countrySelectedColor || '#0000ff',
              fillOpacity: props.content?.countrySelectedOpacity || 0.5,
              color: props.content?.countryBorderColor || '#666666',
              weight: props.content?.countryBorderWidth || 1,
              opacity: props.content?.countryBorderOpacity || 0.5,
              interactive: true
            };
          }

          return {
            fillColor: 'transparent',
            fillOpacity: 0,
            color: props.content?.countryBorderColor || '#666666',
            weight: props.content?.countryBorderWidth || 1,
            opacity: props.content?.countryBorderOpacity || 0.5,
            interactive: true
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
          // Check if this feature is selected (using Set)
          const isSelected = selectedStates.value.has(feature?.properties?.id);

          if (isSelected) {
            return {
              fillColor: props.content?.stateSelectedColor || '#0000ff',
              fillOpacity: props.content?.stateSelectedOpacity || 0.5,
              color: props.content?.stateBorderColor || '#666666',
              weight: props.content?.stateBorderWidth || 1,
              opacity: props.content?.stateBorderOpacity || 0.5,
              interactive: true
            };
          }

          return {
            fillColor: 'transparent',
            fillOpacity: 0,
            color: props.content?.stateBorderColor || '#666666',
            weight: props.content?.stateBorderWidth || 1,
            opacity: props.content?.stateBorderOpacity || 0.5,
            interactive: true
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

    const updateCountryBoundaryStyles = () => {
      if (!countryBoundaryLayer.value) return;

      countryBoundaryLayer.value.eachLayer(layer => {
        const feature = layer.feature;
        const isSelected = selectedCountries.value.has(feature?.properties?.id);

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
        const isSelected = selectedStates.value.has(feature?.properties?.id);

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
      console.log('🗺️ Initializing map...');
      console.log('Map container ref:', mapContainer.value);
      console.log('Map container element:', mapContainer.value?.tagName);

      if (!mapContainer.value) {
        console.error('❌ Map container not found - cannot initialize map');
        return;
      }

      const lat = props.content?.initialLat || 51.505;
      const lng = props.content?.initialLng || -0.09;
      const zoom = props.content?.initialZoom || 13;

      console.log('Map config:', { lat, lng, zoom, content: props.content });

      try {
        if (map.value) {
          console.log('Removing existing map instance');
          map.value.remove();
          map.value = null;
        }

        /* wwEditor:start */
        // In editor mode, disable dragging so component can be moved
        const allowInteraction = !isEditing.value;
        /* wwEditor:end */

        console.log('Creating Leaflet map instance...');
        map.value = L.map(mapContainer.value, {
          /* wwEditor:start */
          dragging: allowInteraction,
          touchZoom: allowInteraction,
          doubleClickZoom: allowInteraction,
          scrollWheelZoom: allowInteraction,
          boxZoom: allowInteraction,
          keyboard: allowInteraction,
          /* wwEditor:end */
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
        console.log('✅ Map instance created successfully');

        /* wwEditor:start */
        // Ensure dragging follows editor state
        if (map.value.dragging) {
          if (allowInteraction) {
            map.value.dragging.enable();
          } else {
            map.value.dragging.disable();
          }
        }
        /* wwEditor:end */
        // Ensure dragging is explicitly enabled in production
        if (map.value.dragging) {
          map.value.dragging.enable();
        }

        setupTileLayers();
        updateMapType();

        map.value.on('click', onMapClick);

        setupResizeObserver();

        console.log('Setting up map ready callback...');
        map.value.whenReady(async () => {
          console.log('🗺️ Map is ready, initializing features...');
          updateMarkers();
          updatePrivacyMode();
          updateHardinessHeatmap();
          await updateBoundaries();

          // Initialize location context
          updateLocationContext();

          map.value.on('moveend', updateBoundaries);
          map.value.on('zoomend', () => {
            updateBoundaries();
            updateLocationContext();
            setCurrentZoomLevel(map.value.getZoom());
          });

          // Track zoom changes
          map.value.on('zoom', () => {
            setCurrentZoomLevel(map.value.getZoom());
          });

          console.log('✅ Map fully initialized and ready');
          emit('trigger-event', {
            name: 'map-ready',
            event: {}
          });
        });
      } catch (error) {
        console.error('❌ Map initialization failed:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          wwLibAvailable: typeof wwLib !== 'undefined',
          mapContainerRef: !!mapContainer.value
        });
      }
    };

    const reinitializeMap = () => {
      if (mapContainer.value) {
        initializeMap();
      }
    };

    // CRITICAL: Watch ALL properties that affect component rendering
    watch(() => [
      props.content?.mapType,
      props.content?.initialLat,
      props.content?.initialLng,
      props.content?.initialZoom,
      props.content?.enableClustering,
      props.content?.clusterMaxZoom,
      props.content?.requestGeolocation,
      props.content?.showUserLocation,
      props.content?.centerOnUserLocation,
      props.content?.enablePrivacyMode,
      props.content?.privacyRadius,
      props.content?.privacyRadiusMiles,
      props.content?.privacyUnit,
      props.content?.allowClickToMark,
      props.content?.locationZoomThreshold,
      props.content?.showHardinessHeatmap,
      props.content?.hardinessHeatmapRadius,
      props.content?.userHardinessZone,
      props.content?.isOnline,
      props.content?.allowMapTypeSelection,
      props.content?.useVectorTiles,
      props.content?.enableReverseGeocoding,
      props.content?.enableCountryHover,
      props.content?.enableStateHover,
      props.content?.geocodingRateLimit,
      props.content?.countryMinZoom,
      props.content?.countryMaxZoom,
      props.content?.stateMinZoom,
      props.content?.stateMaxZoom
    ], (newVals, oldVals) => {
      // Handle specific property changes
      if (newVals[0] !== oldVals?.[0]) { // mapType changed
        nextTick(() => updateMapType());
      }
      if (newVals[1] !== oldVals?.[1] || newVals[2] !== oldVals?.[2] || newVals[3] !== oldVals?.[3]) { // position/zoom changed
        nextTick(() => updateMapView());
      }
      if (newVals[4] !== oldVals?.[4] || newVals[5] !== oldVals?.[5]) { // clustering changed
        nextTick(() => updateMarkers());
      }
      if (newVals[6] !== oldVals?.[6] && newVals[6] && !geolocationRequested.value) { // requestGeolocation enabled
        requestUserLocation();
      }
      if (newVals[7] !== oldVals?.[7] || newVals[8] !== oldVals?.[8] || newVals[9] !== oldVals?.[9]) { // privacy/location changed
        nextTick(() => updatePrivacyMode());
      }
      if (newVals[10] !== oldVals?.[10] || newVals[11] !== oldVals?.[11] || newVals[12] !== oldVals?.[12]) { // privacy radius changed
        nextTick(() => updatePrivacyCircle());
      }
      if (newVals[13] !== oldVals?.[13] || newVals[14] !== oldVals?.[14]) { // allowClickToMark or locationZoomThreshold changed
        nextTick(() => updateLocationContext());
      }
      if (newVals[15] !== oldVals?.[15] || newVals[16] !== oldVals?.[16] || newVals[17] !== oldVals?.[17]) { // hardiness changed
        nextTick(() => updateHardinessHeatmap());
      }
      if (newVals[18] !== oldVals?.[18]) { // isOnline changed
        updateMarkers();
        if (userLocationMarker.value) {
          updateUserLocationMarker();
        }
      }
      if (newVals[21] !== oldVals?.[21] || newVals[22] !== oldVals?.[22] || newVals[24] !== oldVals?.[24] || newVals[25] !== oldVals?.[25] || newVals[26] !== oldVals?.[26] || newVals[27] !== oldVals?.[27] || newVals[28] !== oldVals?.[28]) { // boundary enable toggles and zoom levels changed
        nextTick(() => {
          updateBoundaries();
          updateLocationContext();
        });
      }
    }, { deep: true });

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
      props.content?.stateSelectedOpacity,
      props.content?.selectedLocationMarkerColor
    ], () => {
      nextTick(() => {
        updateCountryBoundaryStyles();
        updateStateBoundaryStyles();
        updateSelectedLocationMarkers(); // Re-render markers with new color
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
      console.log('🎯 OpenStreetMap component mounted');
      nextTick(() => {
        console.log('🔄 Next tick - initializing component...');
        try {
          initializeMap();
          if (props.content?.requestGeolocation) {
            console.log('Requesting user location...');
            requestUserLocation();
          }

          setTimeout(() => {
            safeInvalidateSize();
          }, 100);
        } catch (error) {
          console.error('❌ OpenStreetMap: Failed to initialize map:', error);
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            wwLibAvailable: typeof wwLib !== 'undefined',
            mapContainerRef: !!mapContainer.value
          });
        }
      });
    });

    onBeforeUnmount(() => {
      if (hardinessHeatmapLayer.value) {
        map.value?.removeLayer(hardinessHeatmapLayer.value);
        hardinessHeatmapLayer.value = null;
      }

      if (resizeObserver.value) {
        resizeObserver.value.disconnect();
        resizeObserver.value = null;
      }

      if (resizeTimeout.value) {
        clearTimeout(resizeTimeout.value);
      }

      if (map.value) {
        map.value.remove();
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
    } catch (error) {
      console.error('❌ OpenStreetMap setup() failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      return {};
    }
  }
};
</script>

<style lang="scss" scoped>
.openstreet-map {
  position: relative;
  width: 100%;

  .map-container {
    width: 100%;
    height: 100%;
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
