<template>
  <div class="openstreet-map" :style="mapContainerStyle">
    <!-- Map Container -->
    <div ref="mapContainer" class="map-container" :style="mapStyle"></div>

    <!-- Location Instructions -->
    <div v-if="showLocationInstructions" class="location-instructions">
      <p v-if="!geolocationRequested && content.allowClickToMark">
        Click on the map to mark your location
      </p>
      <p v-else-if="geolocationDenied && content.allowClickToMark">
        Location access denied. Click on the map to mark your location
      </p>
    </div>
  </div>
</template>

<script>
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
  data() {
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

    // Setup component variables
    console.log('🔧 Setting up component variables...');
    let selectedLocation = null, setSelectedLocation = () => {};
    let userLocation = null, setUserLocation = () => {};
    let clickedLocation = null, setClickedLocation = () => {};
    let selectedCountriesData = [], setSelectedCountriesData = () => {};
    let selectedStatesData = [], setSelectedStatesData = () => {};
    let selectedLocationsData = [], setSelectedLocationsData = () => {};
    let selectedCountryData = null, setSelectedCountryData = () => {};
    let selectedStateData = null, setSelectedStateData = () => {};
    let geocodedAddress = null, setGeocodedAddress = () => {};
    let currentZoomLevel = 13, setCurrentZoomLevel = () => {};
    let locationContext = null, setLocationContext = () => {};

    if (hasWwLib) {
      try {
        ({ value: selectedLocation, setValue: setSelectedLocation } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'selectedLocation', type: 'object', defaultValue: null
        }));
        ({ value: userLocation, setValue: setUserLocation } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'userLocation', type: 'object', defaultValue: null
        }));
        ({ value: clickedLocation, setValue: setClickedLocation } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'clickedLocation', type: 'object', defaultValue: null
        }));
        ({ value: selectedCountriesData, setValue: setSelectedCountriesData } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'selectedCountries', type: 'array', defaultValue: []
        }));
        ({ value: selectedStatesData, setValue: setSelectedStatesData } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'selectedStates', type: 'array', defaultValue: []
        }));
        ({ value: selectedLocationsData, setValue: setSelectedLocationsData } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'selectedLocations', type: 'array', defaultValue: []
        }));
        ({ value: selectedCountryData, setValue: setSelectedCountryData } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'selectedCountry', type: 'object', defaultValue: null
        }));
        ({ value: selectedStateData, setValue: setSelectedStateData } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'selectedState', type: 'object', defaultValue: null
        }));
        ({ value: geocodedAddress, setValue: setGeocodedAddress } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'geocodedAddress', type: 'object', defaultValue: null
        }));
        ({ value: currentZoomLevel, setValue: setCurrentZoomLevel } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'currentZoomLevel', type: 'number', defaultValue: 13
        }));
        ({ value: locationContext, setValue: setLocationContext } = wwLib.wwVariable.useComponentVariable({
          uid: this.uid, name: 'locationContext', type: 'object', defaultValue: null
        }));
      } catch (error) {
        console.error('Error setting up component variables:', error);
      }
    }

    return {
      // Map instances
      map: null,
      markersLayer: null,
      clusterGroup: null,
      userLocationMarker: null,
      userMarkedLocationMarker: null,
      privacyCircle: null,
      tileLayers: {},
      resizeObserver: null,
      resizeTimeout: null,
      hardinessHeatmapLayer: null,
      countryBoundaryLayer: null,
      stateBoundaryLayer: null,
      selectedLocationMarkers: null,

      // Component state
      geolocationRequested: false,
      geolocationDenied: false,
      showUserLocation: false,
      userExactLat: null,
      userExactLng: null,

      // Selection state
      selectedCountries: new Set(),
      selectedStates: new Set(),
      selectedLocations: [],
      selectedCountry: null,
      selectedState: null,
      hoveredCountry: null,
      hoveredState: null,
      geocodingDebounceTimer: null,

      // Component variables
      selectedLocation,
      userLocation,
      clickedLocation,
      selectedCountriesData,
      selectedStatesData,
      selectedLocationsData,
      selectedCountryData,
      selectedStateData,
      geocodedAddress,
      currentZoomLevel,
      locationContext,

      // Setters
      setSelectedLocation,
      setUserLocation,
      setClickedLocation,
      setSelectedCountriesData,
      setSelectedStatesData,
      setSelectedLocationsData,
      setSelectedCountryData,
      setSelectedStateData,
      setGeocodedAddress,
      setCurrentZoomLevel,
      setLocationContext,

      // wwLib availability
      hasWwLib
    };
  },
  computed: {
    isEditing() {
      /* wwEditor:start */
      return this.wwEditorState?.isEditing;
      /* wwEditor:end */
    },
    mapContainerStyle() {
      return {
        '--border-radius': this.content.mapStyle || '8px',
        height: this.content.mapHeight || '400px'
      };
    },
    mapStyle() {
      return {
        borderRadius: 'var(--border-radius)',
        overflow: 'hidden'
      };
    },
    currentMapType() {
      return this.content.mapType || 'osm';
    },
    showLocationInstructions() {
      return this.content.allowClickToMark && (!this.showUserLocation || this.geolocationDenied);
    }
  },
  watch: {
    content: {
      handler() {
        this.$nextTick(() => {
          if (this.map) {
            this.updateMapType();
            this.updateMapView();
            this.updateMarkers();
            this.updatePrivacyMode();
            this.updateHardinessHeatmap();
            this.updateBoundaries();
            this.updateLocationContext();
          }
        });
      },
      deep: true
    }
  },
  mounted() {
    console.log('🎯 OpenStreetMap component mounted');
    this.$nextTick(() => {
      console.log('🔄 Next tick - initializing component...');
      try {
        this.initializeMap();
        if (this.content.requestGeolocation) {
          console.log('Requesting user location...');
          this.requestUserLocation();
        }
        setTimeout(() => {
          this.safeInvalidateSize();
        }, 100);
      } catch (error) {
        console.error('❌ OpenStreetMap: Failed to initialize map:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          wwLibAvailable: typeof wwLib !== 'undefined',
          mapContainer: !!this.$refs.mapContainer
        });
      }
    });
  },
  beforeDestroy() {
    if (this.hardinessHeatmapLayer) {
      this.map?.removeLayer(this.hardinessHeatmapLayer);
      this.hardinessHeatmapLayer = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    if (this.map) {
      this.map.remove();
    }
  },
  methods: {
    // Map initialization
    initializeMap() {
      console.log('🗺️ Initializing map...');
      console.log('Map container:', this.$refs.mapContainer);

      if (!this.$refs.mapContainer) {
        console.error('❌ Map container not found - cannot initialize map');
        return;
      }

      const lat = this.content.initialLat || 51.505;
      const lng = this.content.initialLng || -0.09;
      const zoom = this.content.initialZoom || 13;

      console.log('Map config:', { lat, lng, zoom });

      try {
        if (this.map) {
          console.log('Removing existing map instance');
          this.map.remove();
          this.map = null;
        }

        /* wwEditor:start */
        const allowInteraction = !this.isEditing;
        /* wwEditor:end */

        console.log('Creating Leaflet map instance...');
        this.map = L.map(this.$refs.mapContainer, {
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

        this.setupTileLayers();
        this.updateMapType();

        this.map.on('click', this.onMapClick);

        this.setupResizeObserver();

        console.log('Setting up map ready callback...');
        this.map.whenReady(() => {
          console.log('🗺️ Map is ready, initializing features...');
          this.updateMarkers();
          this.updatePrivacyMode();
          this.updateHardinessHeatmap();
          this.updateBoundaries();
          this.updateLocationContext();

          this.map.on('moveend', this.updateBoundaries);
          this.map.on('zoomend', () => {
            this.updateBoundaries();
            this.updateLocationContext();
            this.setCurrentZoomLevel(this.map.getZoom());
          });

          this.map.on('zoom', () => {
            this.setCurrentZoomLevel(this.map.getZoom());
          });

          console.log('✅ Map fully initialized and ready');
          this.$emit('trigger-event', {
            name: 'map-ready',
            event: {}
          });
        });
      } catch (error) {
        console.error('❌ Map initialization failed:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
      }
    },

    // Tile layers setup
    setupTileLayers() {
      this.tileLayers = {
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
    },

    // Map updates
    updateMapType() {
      if (!this.map || !this.tileLayers) return;

      Object.values(this.tileLayers).forEach(layer => {
        if (this.map.hasLayer(layer)) {
          this.map.removeLayer(layer);
        }
      });

      const selectedLayer = this.tileLayers[this.currentMapType];
      if (selectedLayer) {
        selectedLayer.addTo(this.map);
      }
    },

    updateMapView() {
      if (!this.map) return;

      const lat = this.content.initialLat || 51.505;
      const lng = this.content.initialLng || -0.09;
      const zoom = this.content.initialZoom || 13;

      this.map.setView([lat, lng], zoom);
    },

    updateMarkers() {
      if (!this.map) return;

      try {
        if (this.markersLayer) {
          this.map.removeLayer(this.markersLayer);
        }
        if (this.clusterGroup) {
          this.map.removeLayer(this.clusterGroup);
        }

        const markers = this.content.markers || [];
        if (!Array.isArray(markers) || !markers.length) return;

        if (this.content.enableClustering) {
          this.clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            disableClusteringAtZoom: this.content.clusterMaxZoom || 15,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            spiderfyOnMaxZoom: true
          });

          markers.forEach(markerData => {
            const marker = L.marker([markerData.lat, markerData.lng]);
            marker.on('click', () => {
              this.setSelectedLocation({
                marker: markerData,
                position: { lat: markerData.lat, lng: markerData.lng }
              });
              this.$emit('trigger-event', {
                name: 'marker-click',
                event: {
                  marker: markerData,
                  position: { lat: markerData.lat, lng: markerData.lng }
                }
              });
            });
            this.clusterGroup.addLayer(marker);
          });

          this.map.addLayer(this.clusterGroup);
        } else {
          this.markersLayer = L.layerGroup();

          markers.forEach(markerData => {
            const marker = L.marker([markerData.lat, markerData.lng]);
            marker.on('click', () => {
              this.setSelectedLocation({
                marker: markerData,
                position: { lat: markerData.lat, lng: markerData.lng }
              });
              this.$emit('trigger-event', {
                name: 'marker-click',
                event: {
                  marker: markerData,
                  position: { lat: markerData.lat, lng: markerData.lng }
                }
              });
            });
            this.markersLayer.addLayer(marker);
          });

          this.map.addLayer(this.markersLayer);
        }
      } catch (error) {
        console.error('Error updating markers:', error);
      }
    },

    // Map event handlers
    onMapClick(e) {
      if (!this.map) return;

      const { lat, lng } = e.latlng;
      const zoom = this.map.getZoom();

      this.$emit('trigger-event', {
        name: 'map-click',
        event: {
          position: { lat, lng },
          zoom: zoom,
          mode: zoom >= (this.content.locationZoomThreshold || 8) ? 'location' : 'boundary'
        }
      });

      if (zoom >= (this.content.locationZoomThreshold || 8) && this.content.allowClickToMark) {
        const locationData = {
          id: `loc-${Date.now()}`,
          lat,
          lng,
          timestamp: new Date().toISOString()
        };

        this.selectedLocations.push(locationData);
        this.updateSelectedLocationMarkers();

        this.setClickedLocation(locationData);
      } else {
        this.setClickedLocation(null);
      }

      this.updateLocationContext();

      if (this.content.enableReverseGeocoding) {
        this.debouncedReverseGeocode(lat, lng, 'location-geocoded');
      }

      if (!this.content.allowClickToMark || zoom < (this.content.locationZoomThreshold || 8)) return;

      try {
        if (this.userMarkedLocationMarker) {
          this.map.removeLayer(this.userMarkedLocationMarker);
        }

        const markerColor = this.content.isOnline ? '#4CAF50' : '#9E9E9E';
        this.userMarkedLocationMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-marked-location',
            html: `<div class="user-marked-dot" style="background-color: ${markerColor}; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        if (!this.content.enablePrivacyMode) {
          this.userMarkedLocationMarker.addTo(this.map);
        }

        this.updatePrivacyCircle();

        this.$emit('trigger-event', {
          name: 'location-marked',
          event: { position: { lat, lng } }
        });

        if (this.content.enableReverseGeocoding) {
          this.debouncedReverseGeocode(lat, lng, 'marked-location-geocoded');
        }
      } catch (error) {
        console.error('Error marking location:', error);
      }
    },

    // Location methods
    requestUserLocation() {
      const frontWindow = (wwLib?.getFrontWindow && wwLib.getFrontWindow()) || (typeof window !== 'undefined' ? window : null);
      if (!frontWindow || !frontWindow.navigator?.geolocation) return;

      this.geolocationRequested = true;

      frontWindow.navigator.geolocation.getCurrentPosition(
        this.onLocationSuccess,
        this.onLocationError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    },

    onLocationSuccess(position) {
      if (!this.map) return;

      const { latitude, longitude } = position.coords;
      this.showUserLocation = true;
      this.userExactLat = latitude;
      this.userExactLng = longitude;

      this.setUserLocation({
        lat: latitude,
        lng: longitude,
        timestamp: new Date().toISOString()
      });

      try {
        if (this.userLocationMarker) {
          this.map.removeLayer(this.userLocationMarker);
        }

        const markerColor = this.content.isOnline ? '#4CAF50' : '#9E9E9E';
        this.userLocationMarker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: `<div class="user-location-dot" style="background-color: ${markerColor}; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        if (!this.content.enablePrivacyMode) {
          this.userLocationMarker.addTo(this.map);
        }

        if (this.content.centerOnUserLocation) {
          this.map.setView([latitude, longitude], this.content.initialZoom || 15);
        }

        this.updatePrivacyMode();

        this.$emit('trigger-event', {
          name: 'location-granted',
          event: { position: { lat: latitude, lng: longitude } }
        });

        if (this.content.enableReverseGeocoding) {
          this.debouncedReverseGeocode(latitude, longitude, 'user-location-geocoded');
        }
      } catch (error) {
        console.error('Error handling location success:', error);
      }
    },

    onLocationError() {
      this.geolocationDenied = true;
      this.$emit('trigger-event', {
        name: 'location-denied',
        event: {}
      });
    },

    // Utility methods
    safeInvalidateSize() {
      if (!this.map) return;

      const container = this.map.getContainer();
      if (!container) return;

      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        return;
      }

      const mapPane = container.querySelector('.leaflet-map-pane');
      if (!mapPane) {
        return;
      }

      try {
        this.map.invalidateSize();
      } catch (error) {
        // Silent fail - map size invalidation not critical
      }
    },

    setupResizeObserver() {
      const frontWindow = (wwLib?.getFrontWindow && wwLib.getFrontWindow()) || (typeof window !== 'undefined' ? window : null);
      if (!this.$refs.mapContainer || !frontWindow || !frontWindow.ResizeObserver) return;

      this.resizeObserver = new frontWindow.ResizeObserver(() => {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
          this.safeInvalidateSize();
        }, 150);
      });

      this.resizeObserver.observe(this.$refs.mapContainer);
    },

    // Placeholder methods for features not fully implemented in this simplified version
    updatePrivacyMode() {
      // Simplified implementation
    },

    updatePrivacyCircle() {
      // Simplified implementation
    },

    updateHardinessHeatmap() {
      // Simplified implementation
    },

    updateBoundaries() {
      // Simplified implementation
    },

    updateLocationContext() {
      // Simplified implementation
    },

    updateSelectedLocationMarkers() {
      // Simplified implementation
    },

    debouncedReverseGeocode(lat, lng, eventName) {
      // Simplified implementation
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
