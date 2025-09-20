<template>
  <div class="openstreet-map" :style="mapContainerStyle">
    <!-- Map Type Selector -->
    <div v-if="content?.allowMapTypeSelection" class="map-type-selector">
      <select v-model="selectedMapType" @change="changeMapType" class="map-type-select">
        <option value="osm">OpenStreetMap</option>
        <option value="satellite">Satellite</option>
        <option value="terrain">Terrain</option>
        <option value="dark">Dark Theme</option>
        <option value="light">Light Theme</option>
      </select>
    </div>

    <!-- Privacy Mode Controls -->
    <div v-if="content?.enablePrivacyMode && showUserLocation" class="privacy-controls">
      <label class="privacy-label">Privacy Radius:</label>
      <input
        v-model.number="privacyRadiusValue"
        type="number"
        :min="0.1"
        :max="content?.privacyUnit === 'km' ? 50 : 31"
        :step="0.1"
        class="privacy-input"
        @change="updatePrivacyRadius"
      />
      <select v-model="privacyUnit" @change="updatePrivacyRadius" class="privacy-unit-select">
        <option value="km">km</option>
        <option value="miles">miles</option>
      </select>
    </div>

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
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

export default {
  props: {
    uid: { type: String, required: true },
    content: { type: Object, required: true },
    /* wwEditor:start */
    wwEditorState: { type: Object, required: true },
    /* wwEditor:end */
  },
  emits: ['trigger-event'],
  data() {
    return {
      map: null,
      markersLayer: null,
      clusterGroup: null,
      userLocationMarker: null,
      userMarkedLocationMarker: null,
      privacyCircle: null,
      selectedMapType: 'osm',
      geolocationRequested: false,
      geolocationDenied: false,
      showUserLocation: false,
      privacyRadiusValue: 1,
      privacyUnit: 'km',
      tileLayers: {},
      resizeObserver: null,
      resizeTimeout: null,
      interactionOverlay: null
    };
  },
  computed: {
    /* wwEditor:start */
    isEditing() {
      return this.wwEditorState?.isEditing;
    },
    /* wwEditor:end */

    mapContainerStyle() {
      return {
        '--map-height': this.content?.mapHeight || '100%',
        '--border-radius': this.content?.mapStyle || '8px'
      };
    },

    mapStyle() {
      return {
        height: 'var(--map-height)',
        borderRadius: 'var(--border-radius)',
        overflow: 'hidden'
      };
    },

    processedMarkers() {
      const markers = this.content?.markers || [];
      if (!Array.isArray(markers)) return [];

      const { resolveMappingFormula } = wwLib?.wwFormula?.useFormula() || {};

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

        const lat = resolveMappingFormula(this.content?.markersLatFormula, marker) ?? marker.lat;
        const lng = resolveMappingFormula(this.content?.markersLngFormula, marker) ?? marker.lng;
        const name = resolveMappingFormula(this.content?.markersNameFormula, marker) ?? marker.name;

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
    },

    showLocationInstructions() {
      return this.content?.allowClickToMark && (!this.showUserLocation || this.geolocationDenied);
    }
  },

  watch: {
    'content.initialLat': function() { this.updateMapView(); },
    'content.initialLng': function() { this.updateMapView(); },
    'content.initialZoom': function() { this.updateMapView(); },
    'content.mapType': function() { this.updateMapType(); },
    'content.enableClustering': function() { this.updateMarkers(); },
    'content.clusterMaxZoom': function() { this.updateMarkers(); },
    'content.enablePrivacyMode': function() { this.updatePrivacyMode(); },
    'content.privacyRadius': function() { this.updatePrivacyMode(); },
    'content.privacyRadiusMiles': function() { this.updatePrivacyMode(); },
    'content.privacyUnit': function() { this.updatePrivacyMode(); },
    'content.mapHeight': function() {
      this.$nextTick(() => {
        setTimeout(() => {
          this.safeInvalidateSize();
        }, 100);
      });
    },
    processedMarkers: {
      handler() { this.updateMarkers(); },
      deep: true
    },
    /* wwEditor:start */
    isEditing: {
      handler() {
        this.$nextTick(() => {
          // Always call setupEditorInteraction when editing state changes
          this.setupEditorInteraction();
        });
      },
      immediate: true
    },
    'content.enableEditorInteraction': function() {
      this.$nextTick(() => {
        this.setupEditorInteraction();
      });
    },
    'content.editorInteractionMethod': function() {
      this.$nextTick(() => {
        this.setupEditorInteraction();
      });
    }
    /* wwEditor:end */
  },

  mounted() {
    this.$nextTick(() => {
      // CRITICAL: Apply global CSS fixes immediately
      this.applyGlobalInteractionFixes();

      this.initializeMap();
      if (this.content?.requestGeolocation) {
        this.requestUserLocation();
      }
    });
  },

  beforeUnmount() {
    // Clean up interaction overlay
    /* wwEditor:start */
    if (this.interactionOverlay && this.interactionOverlay.parentNode) {
      this.interactionOverlay.parentNode.removeChild(this.interactionOverlay);
      this.interactionOverlay = null;
    }
    /* wwEditor:end */

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up resize timeout
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    // Clean up map
    if (this.map) {
      this.map.remove();
    }
  },

  methods: {
    initializeMap() {
      if (!this.$refs.mapContainer) {
        console.warn('Map container not ready');
        return;
      }

      const lat = this.content?.initialLat || 51.505;
      const lng = this.content?.initialLng || -0.09;
      const zoom = this.content?.initialZoom || 13;

      try {
        // Remove any existing map first
        if (this.map) {
          this.map.remove();
          this.map = null;
        }

        // Simple map creation with basic settings
        this.map = L.map(this.$refs.mapContainer, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          boxZoom: true,
          keyboard: true,
          zoomControl: true,
          attributionControl: true
        }).setView([lat, lng], zoom);

        this.setupTileLayers();
        this.selectedMapType = this.content?.mapType || 'osm';
        this.updateMapType();

        if (this.content?.allowClickToMark) {
          this.map.on('click', this.onMapClick);
        }

        // Set up resize observer for dynamic resizing
        this.setupResizeObserver();

        // Wait for map to be fully initialized before adding markers
        this.map.whenReady(() => {
          this.updateMarkers();
          this.initializePrivacyMode();

          this.$emit('trigger-event', {
            name: 'map-ready',
            event: {}
          });
        });
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    },

    /* wwEditor:start */
    setupEditorInteraction() {
      if (!this.map) return;

      const mapContainer = this.map.getContainer();
      if (!mapContainer) return;

      console.log('Setting up editor interaction...');

      // Clean up existing overlay if any
      if (this.interactionOverlay && this.interactionOverlay.parentNode) {
        this.interactionOverlay.parentNode.removeChild(this.interactionOverlay);
        this.interactionOverlay = null;
      }

      // CRITICAL: Force enable all map interactions multiple times
      if (this.map) {
        this.map.dragging.enable();
        this.map.touchZoom.enable();
        this.map.doubleClickZoom.enable();
        this.map.scrollWheelZoom.enable();
        this.map.boxZoom.enable();
        this.map.keyboard.enable();

        console.log('Map interactions enabled:', {
          dragging: this.map.dragging.enabled(),
          touchZoom: this.map.touchZoom.enabled(),
          scrollWheelZoom: this.map.scrollWheelZoom.enabled()
        });
      }

      this.forceContainerInteraction();

      // Apply method-specific interaction if enabled
      if (this.content?.enableEditorInteraction) {
        const method = this.content?.editorInteractionMethod || 'overlay';
        switch (method) {
          case 'overlay':
            this.setupOverlayMethod(mapContainer);
            break;
          case 'direct':
            this.setupDirectMethod(mapContainer);
            break;
          case 'simple':
            this.setupSimpleMethod(mapContainer);
            break;
          default:
            this.setupOverlayMethod(mapContainer);
        }
      }

      setTimeout(() => {
        this.safeInvalidateSize();
        // Re-enable interactions after invalidate
        if (this.map) {
          this.map.dragging.enable();
          this.map.touchZoom.enable();
          this.map.scrollWheelZoom.enable();
        }
      }, 200);
    },

    forceContainerInteraction() {
      if (!this.map) return;

      const mapContainer = this.map.getContainer();
      if (!mapContainer) return;

      console.log('Forcing container interaction styles...');

      // CRITICAL: Apply aggressive CSS fixes
      const containerStyles = {
        'pointer-events': 'auto !important',
        'touch-action': 'pan-x pan-y !important',
        '-ms-touch-action': 'pan-x pan-y !important',
        'cursor': 'grab',
        'position': 'relative',
        'overflow': 'hidden',
        'user-select': 'none',
        '-webkit-user-select': 'none',
        '-moz-user-select': 'none',
        '-ms-user-select': 'none'
      };

      Object.entries(containerStyles).forEach(([prop, value]) => {
        mapContainer.style.setProperty(prop, value, 'important');
      });

      const leafletContainer = mapContainer.querySelector('.leaflet-container');
      if (leafletContainer) {
        Object.entries(containerStyles).forEach(([prop, value]) => {
          leafletContainer.style.setProperty(prop, value, 'important');
        });
      }

      // Force all child elements to be interactive with !important
      const allElements = mapContainer.querySelectorAll('*');
      allElements.forEach(el => {
        el.style.setProperty('pointer-events', 'auto', 'important');

        if (el.classList.contains('leaflet-control-zoom') || el.classList.contains('leaflet-control')) {
          el.style.setProperty('touch-action', 'auto', 'important');
          el.style.setProperty('-ms-touch-action', 'auto', 'important');
        } else {
          el.style.setProperty('touch-action', 'pan-x pan-y', 'important');
          el.style.setProperty('-ms-touch-action', 'pan-x pan-y', 'important');
        }
      });

      // CRITICAL: Override any WeWeb container styles
      const parentElements = [];
      let parent = mapContainer.parentElement;
      while (parent && parentElements.length < 5) {
        parentElements.push(parent);
        parent = parent.parentElement;
      }

      parentElements.forEach(el => {
        if (el.style) {
          el.style.setProperty('pointer-events', 'auto', 'important');
          el.style.setProperty('touch-action', 'pan-x pan-y', 'important');
          el.style.setProperty('-ms-touch-action', 'pan-x pan-y', 'important');
        }
      });
    },

    setupOverlayMethod(mapContainer) {

      // Create an overlay div that captures events and redirects them to the map
      const frontDocument = wwLib?.getFrontDocument ? wwLib.getFrontDocument() : document;
      const interactionOverlay = frontDocument.createElement('div');
      interactionOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
        pointer-events: auto;
        background: transparent;
        -ms-touch-action: inherit;
        touch-action: inherit;
      `;
      interactionOverlay.className = 'map-interaction-overlay';

      // Function to simulate events on the map
      const simulateMapEvent = (originalEvent) => {
        const mapElement = mapContainer.querySelector('.leaflet-container');
        if (!mapElement) return;

        const rect = mapElement.getBoundingClientRect();
        const x = originalEvent.clientX - rect.left;
        const y = originalEvent.clientY - rect.top;

        // Create a new event with the correct coordinates
        const simulatedEvent = new originalEvent.constructor(originalEvent.type, {
          bubbles: originalEvent.bubbles,
          cancelable: originalEvent.cancelable,
          clientX: originalEvent.clientX,
          clientY: originalEvent.clientY,
          button: originalEvent.button,
          buttons: originalEvent.buttons,
          deltaY: originalEvent.deltaY,
          shiftKey: originalEvent.shiftKey,
          ctrlKey: originalEvent.ctrlKey,
          altKey: originalEvent.altKey,
          metaKey: originalEvent.metaKey
        });

        // Dispatch the event directly to the map element
        mapElement.dispatchEvent(simulatedEvent);
      };

      // Add event listeners to the overlay
      interactionOverlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        simulateMapEvent(e);
      });

      interactionOverlay.addEventListener('mousemove', (e) => {
        e.preventDefault();
        e.stopPropagation();
        simulateMapEvent(e);
      });

      interactionOverlay.addEventListener('mouseup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        simulateMapEvent(e);
      });

      interactionOverlay.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        simulateMapEvent(e);
      });

      interactionOverlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        simulateMapEvent(e);
      });

      interactionOverlay.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        simulateMapEvent(e);
      });

      // Add touch events
      interactionOverlay.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // For touch events, we need to pass through the touches
        const mapElement = mapContainer.querySelector('.leaflet-container');
        if (mapElement) {
          const touchEvent = new TouchEvent(e.type, {
            bubbles: e.bubbles,
            cancelable: e.cancelable,
            touches: e.touches,
            targetTouches: e.targetTouches,
            changedTouches: e.changedTouches
          });
          mapElement.dispatchEvent(touchEvent);
        }
      });

      interactionOverlay.addEventListener('touchmove', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mapElement = mapContainer.querySelector('.leaflet-container');
        if (mapElement) {
          const touchEvent = new TouchEvent(e.type, {
            bubbles: e.bubbles,
            cancelable: e.cancelable,
            touches: e.touches,
            targetTouches: e.targetTouches,
            changedTouches: e.changedTouches
          });
          mapElement.dispatchEvent(touchEvent);
        }
      });

      interactionOverlay.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mapElement = mapContainer.querySelector('.leaflet-container');
        if (mapElement) {
          const touchEvent = new TouchEvent(e.type, {
            bubbles: e.bubbles,
            cancelable: e.cancelable,
            touches: e.touches,
            targetTouches: e.targetTouches,
            changedTouches: e.changedTouches
          });
          mapElement.dispatchEvent(touchEvent);
        }
      });

      // Append the overlay to the map container
      mapContainer.appendChild(interactionOverlay);

      // Store reference for cleanup
      this.interactionOverlay = interactionOverlay;
    },

    setupDirectMethod(mapContainer) {
      // Direct event handling approach
      mapContainer.style.pointerEvents = 'auto';
      mapContainer.style.position = 'relative';
      mapContainer.style.zIndex = '1000';
      mapContainer.style.touchAction = 'pan-x pan-y';
      mapContainer.style.msTouchAction = 'pan-x pan-y';

      const leafletContainer = mapContainer.querySelector('.leaflet-container');
      if (leafletContainer) {
        leafletContainer.style.pointerEvents = 'auto';
        leafletContainer.style.touchAction = 'pan-x pan-y';
        leafletContainer.style.msTouchAction = 'pan-x pan-y';
      }
    },

    setupSimpleMethod(mapContainer) {
      // Simple approach - just force styles
      mapContainer.style.cssText += `
        pointer-events: auto !important;
        position: relative !important;
        z-index: 999 !important;
        -ms-touch-action: pan-x pan-y !important;
        touch-action: pan-x pan-y !important;
        cursor: grab !important;
      `;

      const leafletContainer = mapContainer.querySelector('.leaflet-container');
      if (leafletContainer) {
        leafletContainer.style.cssText += `
          pointer-events: auto !important;
          -ms-touch-action: pan-x pan-y !important;
          touch-action: pan-x pan-y !important;
          cursor: grab !important;
        `;
      }

      // Force all child elements to be interactive
      const allElements = mapContainer.querySelectorAll('*');
      allElements.forEach(el => {
        el.style.pointerEvents = 'auto';
        if (el.classList.contains('leaflet-control-zoom')) {
          el.style.touchAction = 'auto';
          el.style.msTouchAction = 'auto';
        } else {
          el.style.touchAction = 'pan-x pan-y';
          el.style.msTouchAction = 'pan-x pan-y';
        }
      });
    },
    /* wwEditor:end */

    setupResizeObserver() {
      const frontWindow = wwLib?.getFrontWindow ? wwLib.getFrontWindow() : window;
      if (!this.$refs.mapContainer || !frontWindow.ResizeObserver) return;

      this.resizeObserver = new frontWindow.ResizeObserver(() => {
        // Debounce the resize to avoid too many calls
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
          this.safeInvalidateSize();
        }, 150);
      });

      this.resizeObserver.observe(this.$refs.mapContainer);
    },

    safeInvalidateSize() {
      if (!this.map) return;

      const container = this.map.getContainer();
      if (!container) return;

      // Check if container has dimensions
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.warn('Map container has no dimensions, skipping invalidateSize');
        return;
      }

      // Check if map panes are ready
      const mapPane = container.querySelector('.leaflet-map-pane');
      if (!mapPane) {
        console.warn('Map panes not ready, skipping invalidateSize');
        return;
      }

      try {
        this.map.invalidateSize();
      } catch (error) {
        console.warn('Failed to invalidate map size:', error);
      }
    },

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

    updateMapType() {
      if (!this.map || !this.tileLayers) return;

      Object.values(this.tileLayers).forEach(layer => {
        if (this.map.hasLayer(layer)) {
          this.map.removeLayer(layer);
        }
      });

      const selectedLayer = this.tileLayers[this.selectedMapType];
      if (selectedLayer) {
        selectedLayer.addTo(this.map);
      }
    },

    changeMapType() {
      this.updateMapType();
    },

    updateMapView() {
      if (!this.map) return;

      const lat = this.content?.initialLat || 51.505;
      const lng = this.content?.initialLng || -0.09;
      const zoom = this.content?.initialZoom || 13;

      this.map.setView([lat, lng], zoom);
    },

    updateMarkers() {
      if (!this.map || !this.map.getContainer()) return;

      try {
        if (this.markersLayer) {
          this.map.removeLayer(this.markersLayer);
        }
        if (this.clusterGroup) {
          this.map.removeLayer(this.clusterGroup);
        }

        const markers = this.processedMarkers;
        if (!markers.length) return;

        if (this.content?.enableClustering) {
          this.clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            disableClusteringAtZoom: this.content?.clusterMaxZoom || 15
          });

          markers.forEach(markerData => {
            const marker = L.marker([markerData.lat, markerData.lng]);

            if (markerData.name || markerData.description) {
              const popupContent = `
                <div class="marker-popup">
                  ${markerData.name ? `<h4>${markerData.name}</h4>` : ''}
                  ${markerData.description ? `<p>${markerData.description}</p>` : ''}
                </div>
              `;
              marker.bindPopup(popupContent);
            }

            marker.on('click', () => {
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

            if (markerData.name || markerData.description) {
              const popupContent = `
                <div class="marker-popup">
                  ${markerData.name ? `<h4>${markerData.name}</h4>` : ''}
                  ${markerData.description ? `<p>${markerData.description}</p>` : ''}
                </div>
              `;
              marker.bindPopup(popupContent);
            }

            marker.on('click', () => {
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

    requestUserLocation() {
      if (!navigator.geolocation) return;

      this.geolocationRequested = true;

      navigator.geolocation.getCurrentPosition(
        this.onLocationSuccess,
        this.onLocationError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    },

    onLocationSuccess(position) {
      if (!this.map) {
        console.warn('Map not ready for location update');
        return;
      }

      const { latitude, longitude } = position.coords;
      this.showUserLocation = true;

      let displayLat = latitude;
      let displayLng = longitude;

      if (this.content?.enablePrivacyMode) {
        const radius = this.getPrivacyRadiusInKm();
        const offset = this.generateRandomOffset(radius);
        displayLat += offset.lat;
        displayLng += offset.lng;
      }

      try {
        if (this.userLocationMarker) {
          this.map.removeLayer(this.userLocationMarker);
        }

        // CRITICAL: Use WeWeb-compliant document for marker creation
        const frontDocument = wwLib?.getFrontDocument ? wwLib.getFrontDocument() : document;

        this.userLocationMarker = L.marker([displayLat, displayLng], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div class="user-location-dot"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        this.userLocationMarker.addTo(this.map);
        this.userLocationMarker.bindPopup('Your location (approximate)');

        if (this.content?.centerOnUserLocation) {
          this.map.setView([displayLat, displayLng], this.content?.initialZoom || 15);
        }

        this.updatePrivacyCircle(displayLat, displayLng);

        this.$emit('trigger-event', {
          name: 'location-granted',
          event: {
            position: { lat: displayLat, lng: displayLng }
          }
        });
      } catch (error) {
        console.error('Error adding user location marker:', error);
      }
    },

    onLocationError() {
      this.geolocationDenied = true;
      this.$emit('trigger-event', {
        name: 'location-denied',
        event: {}
      });
    },

    onMapClick(e) {
      if (!this.content?.allowClickToMark || !this.map) return;

      const { lat, lng } = e.latlng;

      try {
        if (this.userMarkedLocationMarker) {
          this.map.removeLayer(this.userMarkedLocationMarker);
        }

        this.userMarkedLocationMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-marked-location',
            html: '<div class="user-marked-dot"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        this.userMarkedLocationMarker.addTo(this.map);
        this.userMarkedLocationMarker.bindPopup('Your marked location');

        this.$emit('trigger-event', {
          name: 'location-marked',
          event: {
            position: { lat, lng }
          }
        });
      } catch (error) {
        console.error('Error adding marked location marker:', error);
      }
    },

    initializePrivacyMode() {
      this.privacyRadiusValue = this.content?.privacyRadius || 1;
      this.privacyUnit = this.content?.privacyUnit || 'km';
    },

    updatePrivacyMode() {
      this.updatePrivacyRadius();
    },

    updatePrivacyRadius() {
      if (this.userLocationMarker && this.content?.enablePrivacyMode) {
        const center = this.userLocationMarker.getLatLng();
        this.updatePrivacyCircle(center.lat, center.lng);
      }
    },

    updatePrivacyCircle(lat, lng) {
      if (!this.content?.enablePrivacyMode || !this.map) return;

      if (this.privacyCircle) {
        this.map.removeLayer(this.privacyCircle);
      }

      const radiusInMeters = this.getPrivacyRadiusInKm() * 1000;

      this.privacyCircle = L.circle([lat, lng], {
        radius: radiusInMeters,
        color: '#ff6b6b',
        fillColor: '#ff6b6b',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '5, 5'
      }).addTo(this.map);

      this.privacyCircle.bindPopup(`Privacy radius: ${this.privacyRadiusValue} ${this.privacyUnit}`);
    },

    getPrivacyRadiusInKm() {
      if (this.privacyUnit === 'miles') {
        return this.privacyRadiusValue * 1.60934;
      }
      return this.privacyRadiusValue;
    },

    generateRandomOffset(radiusKm) {
      const radiusInDegrees = radiusKm / 111.32;
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * radiusInDegrees;

      return {
        lat: distance * Math.cos(angle),
        lng: distance * Math.sin(angle)
      };
    },

    emergencyInteractionFix() {
      if (!this.map) return;

      console.log('Applying emergency interaction fix...');

      // CRITICAL: Force interaction events on map
      const container = this.map.getContainer();
      if (!container) return;

      // Add global CSS override using WeWeb-compliant approach
      const frontDocument = wwLib?.getFrontDocument ? wwLib.getFrontDocument() : document;
      if (!frontDocument.getElementById('leaflet-interaction-fix')) {
        const style = frontDocument.createElement('style');
        style.id = 'leaflet-interaction-fix';
        style.innerHTML = `
          /* CRITICAL: Use simple working configuration from GitHub */
          .leaflet-map-container {
            touch-action: pan-x pan-y !important;
            cursor: grab !important;
          }

          .leaflet-dragging .leaflet-map-container {
            cursor: grabbing !important;
          }

          /* Zoom controls must be clickable */
          .leaflet-control-zoom,
          .leaflet-control-zoom * {
            touch-action: auto !important;
            pointer-events: auto !important;
            cursor: pointer !important;
            background: white !important;
            border: 1px solid #ccc !important;
          }
        `;
        frontDocument.head.appendChild(style);
      }

      // Force re-enable interactions periodically
      const forceInteractions = () => {
        if (this.map && this.map.dragging) {
          this.map.dragging.enable();
          this.map.touchZoom.enable();
          this.map.scrollWheelZoom.enable();
          console.log('Re-enabled interactions. Dragging:', this.map.dragging.enabled());
        }
      };

      // Re-enable every 500ms for 5 seconds
      for (let i = 0; i < 10; i++) {
        setTimeout(forceInteractions, i * 500);
      }

      // CRITICAL: Add direct drag event forwarding
      this.setupDragEventForwarding(container);

      // CRITICAL: Ensure zoom controls are fully interactive
      const zoomControls = container.querySelectorAll('.leaflet-control-zoom, .leaflet-control-zoom *');
      zoomControls.forEach(control => {
        control.style.setProperty('pointer-events', 'auto', 'important');
        control.style.setProperty('cursor', 'pointer', 'important');
        control.style.setProperty('touch-action', 'auto', 'important');
      });

      // Force container to be draggable
      container.draggable = false; // Disable HTML5 drag
      container.style.userSelect = 'none';
      container.style.webkitUserSelect = 'none';
      container.style.mozUserSelect = 'none';
    },

    applyGlobalInteractionFixes() {
      console.log('Applying global interaction fixes...');

      // WeWeb-compliant CSS override approach
      const frontDocument = wwLib?.getFrontDocument ? wwLib.getFrontDocument() : document;
      if (!frontDocument.getElementById('weweb-map-interaction-override')) {
        const style = frontDocument.createElement('style');
        style.id = 'weweb-map-interaction-override';
        style.innerHTML = `
          /* CRITICAL: Override WeWeb framework defaults */
          .openstreet-map {
            pointer-events: auto !important;
            touch-action: none !important;
            -ms-touch-action: none !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
          }

          .leaflet-container {
            pointer-events: auto !important;
            touch-action: pan-x pan-y pinch-zoom !important;
            -ms-touch-action: pan-x pan-y pinch-zoom !important;
            -webkit-touch-action: pan-x pan-y pinch-zoom !important;
            -moz-touch-action: pan-x pan-y pinch-zoom !important;
          }

          .leaflet-map-pane,
          .leaflet-tile-pane,
          .leaflet-objects-pane,
          .leaflet-pane {
            pointer-events: auto !important;
            touch-action: none !important;
            -ms-touch-action: none !important;
          }

          /* CRITICAL: Ensure all controls work properly */
          .leaflet-control-zoom,
          .leaflet-control-zoom *,
          .leaflet-control-attribution,
          .leaflet-control-attribution *,
          .leaflet-control,
          .leaflet-control * {
            touch-action: auto !important;
            -ms-touch-action: auto !important;
            pointer-events: auto !important;
            cursor: pointer !important;
          }

          .leaflet-control-zoom-in,
          .leaflet-control-zoom-out {
            pointer-events: auto !important;
            cursor: pointer !important;
            background-color: white !important;
            border: 1px solid #ccc !important;
            color: black !important;
          }

          /* Force interaction on WeWeb elements */
          [class*="ww-"] .leaflet-container,
          [class*="ww-"] .leaflet-container * {
            pointer-events: auto !important;
            touch-action: pan-x pan-y !important;
          }

          /* Override any display or visibility blocks */
          .leaflet-container {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }

          /* Ensure proper z-index */
          .leaflet-container {
            z-index: 1 !important;
          }

          .leaflet-pane {
            z-index: 400 !important;
          }
        `;
        frontDocument.head.appendChild(style);
      }
    },

    finalInteractionSetup() {
      if (!this.map) return;

      console.log('Applying final interaction setup...');

      const container = this.map.getContainer();
      if (!container) return;

      // CRITICAL: Separate handling for map vs controls
      const mapPane = container.querySelector('.leaflet-map-pane');
      const zoomControls = container.querySelectorAll('.leaflet-control-zoom a');

      // Ensure map pane is draggable with more specific targeting
      if (mapPane) {
        mapPane.style.setProperty('touch-action', 'none', 'important');
        mapPane.style.setProperty('pointer-events', 'auto', 'important');
        mapPane.style.setProperty('cursor', 'grab', 'important');

        // CRITICAL: Enable dragging on ALL map layers
        const allPanes = container.querySelectorAll('.leaflet-pane');
        allPanes.forEach(pane => {
          pane.style.setProperty('touch-action', 'none', 'important');
          pane.style.setProperty('pointer-events', 'auto', 'important');
        });
      }

      // Ensure zoom controls are clickable
      zoomControls.forEach(control => {
        control.style.setProperty('pointer-events', 'auto', 'important');
        control.style.setProperty('cursor', 'pointer', 'important');
        control.style.setProperty('touch-action', 'auto', 'important');
        control.style.setProperty('background-color', 'white', 'important');
        control.style.setProperty('border', '1px solid #ccc', 'important');
        control.style.setProperty('color', 'black', 'important');

        // Remove any event listeners that might be blocking
        control.style.pointerEvents = 'auto';
      });

      // Final check: Ensure all Leaflet interactions are enabled
      if (this.map.dragging) this.map.dragging.enable();
      if (this.map.touchZoom) this.map.touchZoom.enable();
      if (this.map.scrollWheelZoom) this.map.scrollWheelZoom.enable();

      console.log('Final interaction status:', {
        dragging: this.map.dragging?.enabled(),
        touchZoom: this.map.touchZoom?.enabled(),
        scrollWheelZoom: this.map.scrollWheelZoom?.enabled()
      });
    },

    setupDragEventForwarding(container) {
      if (!this.map || !container) return;

      console.log('Setting up simplified drag event forwarding...');

      // CRITICAL: Set proper touch-action for pan/zoom
      container.style.setProperty('touch-action', 'pan-x pan-y pinch-zoom', 'important');
      container.style.setProperty('pointer-events', 'auto', 'important');

      // CRITICAL: Ensure Leaflet's drag handler is enabled
      if (this.map.dragging && !this.map.dragging.enabled()) {
        this.map.dragging.enable();
        console.log('Re-enabled Leaflet dragging');
      }

      console.log('Simplified drag event forwarding setup complete');
    }
  }
};
</script>

<style lang="scss" scoped>
.openstreet-map {
  position: relative;
  width: 100%;
  height: var(--map-height);

  .map-type-selector {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1000;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;

    .map-type-select {
      border: none;
      padding: 8px 12px;
      font-size: 14px;
      background: white;
      cursor: pointer;
      outline: none;

      &:focus {
        background: #f5f5f5;
      }
    }
  }

  .privacy-controls {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;

    .privacy-label {
      font-weight: 500;
      margin: 0;
    }

    .privacy-input {
      width: 60px;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 4px 6px;
      font-size: 13px;
    }

    .privacy-unit-select {
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 4px 6px;
      font-size: 13px;
      background: white;
    }
  }

  .map-container {
    width: 100%;
    height: 100%;
    background: #f0f0f0;
    position: relative;

    .leaflet-container {
      width: 100%;
      height: 100%;
      cursor: grab;
      touch-action: none !important;
    }

    .leaflet-container:active {
      cursor: grabbing;
    }

    // Ensure all map controls are interactive
    .leaflet-control-container,
    .leaflet-pane,
    .leaflet-map-pane,
    .leaflet-tile-pane,
    .leaflet-objects-pane,
    .leaflet-control {
      pointer-events: auto !important;
      // Critical: Use pan-x pan-y for proper touch handling
      -ms-touch-action: pan-x pan-y !important;
      touch-action: pan-x pan-y !important;
    }

    // Ensure zoom controls work
    .leaflet-control-zoom {
      pointer-events: auto !important;
      z-index: 1000;
      // Zoom controls need auto touch-action
      -ms-touch-action: auto !important;
      touch-action: auto !important;
    }

    // Ensure drag interactions work
    .leaflet-grab {
      cursor: grab !important;
    }

    .leaflet-grabbing {
      cursor: grabbing !important;
    }

    // Critical: Override any WeWeb default touch-action for all elements
    * {
      -ms-touch-action: pan-x pan-y !important;
      touch-action: pan-x pan-y !important;
    }

    // Specific override for interaction elements
    .leaflet-interactive {
      pointer-events: auto !important;
      -ms-touch-action: auto !important;
      touch-action: auto !important;
    }
    /* wwEditor:end */
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

/* Global styles for Leaflet markers */
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

/* Mobile responsive */
@media (max-width: 768px) {
  .openstreet-map {
    .map-type-selector {
      top: 5px;
      right: 5px;
    }

    .privacy-controls {
      top: 5px;
      left: 5px;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      font-size: 12px;

      .privacy-input {
        width: 50px;
        font-size: 12px;
      }

      .privacy-unit-select {
        font-size: 12px;
      }
    }

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
