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
      userExactLat: null,
      userExactLng: null,
      privacyRadiusValue: 1,
      privacyUnit: 'km',
      tileLayers: {},
      resizeObserver: null,
      resizeTimeout: null,
      /* wwEditor:start */
      editorOverlay: null
      /* wwEditor:end */
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
    },

    currentMapType() {
      return this.content?.mapType || 'osm';
    }
  },

  watch: {
    'content.initialLat': function() { this.updateMapView(); },
    'content.initialLng': function() { this.updateMapView(); },
    'content.initialZoom': function() { this.updateMapView(); },
    'content.mapType': function(newType) {
      console.log('Map type watcher triggered:', newType);
      this.$nextTick(() => {
        this.updateMapType();
      });
    },
    'content.enableClustering': function() { this.updateMarkers(); },
    'content.clusterMaxZoom': function() { this.updateMarkers(); },
    'content.enablePrivacyMode': function() {
      this.$nextTick(() => {
        this.updatePrivacyMode();
      });
    },
    'content.privacyRadius': function() {
      this.$nextTick(() => {
        this.updatePrivacyCircle();
      });
    },
    'content.privacyRadiusMiles': function() {
      this.$nextTick(() => {
        this.updatePrivacyCircle();
      });
    },
    'content.privacyUnit': function() {
      this.$nextTick(() => {
        this.updatePrivacyCircle();
      });
    },
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
      handler(newVal) {
        this.$nextTick(() => {
          if (newVal && this.map) {
            this.setupEditorEventForwarding();
          } else if (this.editorOverlay) {
            this.editorOverlay.remove();
            this.editorOverlay = null;
          }
        });
      },
      immediate: true
    }
    /* wwEditor:end */
  },

  mounted() {
    this.$nextTick(() => {
      this.initializeMap();
      if (this.content?.requestGeolocation) {
        this.requestUserLocation();
      }

      // Apply interaction fixes multiple times to ensure they stick
      setTimeout(() => {
        this.applyInteractionFixes();
        /* wwEditor:start */
        if (this.isEditing) {
          this.setupEditorEventForwarding();
        }
        /* wwEditor:end */
      }, 200);

      setTimeout(() => {
        this.applyInteractionFixes();
      }, 500);
    });
  },

  beforeUnmount() {
    // Clean up editor overlay
    /* wwEditor:start */
    if (this.editorOverlay) {
      this.editorOverlay.remove();
      this.editorOverlay = null;
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

        // Create map with optimized interaction settings
        this.map = L.map(this.$refs.mapContainer, {
          dragging: true,
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: true,
          boxZoom: true,
          keyboard: true,
          zoomControl: true,
          attributionControl: true,
          tap: true,
          tapTolerance: 15,
          touchZoom: 'center',
          wheelPxPerZoomLevel: 60
        }).setView([lat, lng], zoom);

        // Apply immediate interaction fixes
        this.applyInteractionFixes();

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

          // Final interaction setup after map is ready
          setTimeout(() => {
            this.finalizeInteractions();
            /* wwEditor:start */
            this.setupEditorEventForwarding();
            /* wwEditor:end */
          }, 100);

          this.$emit('trigger-event', {
            name: 'map-ready',
            event: {}
          });
        });
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    },

    applyInteractionFixes() {
      if (!this.map) return;

      const container = this.map.getContainer();
      if (!container) return;

      // Apply critical CSS overrides
      const frontDocument = wwLib?.getFrontDocument ? wwLib.getFrontDocument() : document;

      // Remove existing style if present and recreate
      const existingStyle = frontDocument.getElementById('map-interaction-fix');
      if (existingStyle) {
        existingStyle.remove();
      }

      const style = frontDocument.createElement('style');
      style.id = 'map-interaction-fix';
      style.innerHTML = `
        .openstreet-map, .openstreet-map * {
          touch-action: pan-x pan-y !important;
          -ms-touch-action: pan-x pan-y !important;
        }
        .leaflet-container {
          cursor: grab !important;
          touch-action: pan-x pan-y !important;
          pointer-events: auto !important;
          -ms-touch-action: pan-x pan-y !important;
        }
        .leaflet-container:active {
          cursor: grabbing !important;
        }
        .leaflet-map-pane, .leaflet-tile-pane, .leaflet-objects-pane, .leaflet-pane {
          pointer-events: auto !important;
          touch-action: pan-x pan-y !important;
          -ms-touch-action: pan-x pan-y !important;
        }
        .leaflet-control-zoom, .leaflet-control-zoom *, .leaflet-control {
          pointer-events: auto !important;
          touch-action: auto !important;
          -ms-touch-action: auto !important;
          cursor: pointer !important;
        }
      `;
      frontDocument.head.appendChild(style);

      // Force enable interactions immediately
      if (this.map.dragging) this.map.dragging.enable();
      if (this.map.touchZoom) this.map.touchZoom.enable();
      if (this.map.scrollWheelZoom) this.map.scrollWheelZoom.enable();
      if (this.map.doubleClickZoom) this.map.doubleClickZoom.enable();

      // Apply direct styles to container as backup
      container.style.setProperty('touch-action', 'pan-x pan-y', 'important');
      container.style.setProperty('pointer-events', 'auto', 'important');
      container.style.setProperty('cursor', 'grab', 'important');

      const leafletContainer = container.querySelector('.leaflet-container');
      if (leafletContainer) {
        leafletContainer.style.setProperty('touch-action', 'pan-x pan-y', 'important');
        leafletContainer.style.setProperty('pointer-events', 'auto', 'important');
        leafletContainer.style.setProperty('cursor', 'grab', 'important');
      }
    },

    finalizeInteractions() {
      if (!this.map) return;

      // Final check - ensure all interactions are enabled
      const interactions = ['dragging', 'touchZoom', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard'];
      interactions.forEach(interaction => {
        if (this.map[interaction] && !this.map[interaction].enabled()) {
          this.map[interaction].enable();
        }
      });

      console.log('Map interactions finalized:', {
        dragging: this.map.dragging.enabled(),
        touchZoom: this.map.touchZoom.enabled(),
        scrollWheelZoom: this.map.scrollWheelZoom.enabled()
      });
    },

    /* wwEditor:start */
    setupEditorEventForwarding() {
      if (!this.map) return;

      const container = this.map.getContainer();
      if (!container) return;

      console.log('Setting up editor event forwarding...');

      // Remove existing overlay if present
      if (this.editorOverlay) {
        this.editorOverlay.remove();
        this.editorOverlay = null;
      }

      // Create a transparent overlay that captures ALL events over the map
      const frontDocument = wwLib?.getFrontDocument ? wwLib.getFrontDocument() : document;
      const overlay = frontDocument.createElement('div');
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        background: transparent;
        pointer-events: auto;
        cursor: grab;
        touch-action: pan-x pan-y;
      `;
      overlay.className = 'editor-interaction-overlay';

      // Get the leaflet container for event simulation
      const leafletContainer = container.querySelector('.leaflet-container');
      if (!leafletContainer) {
        console.warn('Leaflet container not found');
        return;
      }

      // Helper function to create and dispatch events
      const forwardEvent = (originalEvent, targetElement) => {
        const rect = targetElement.getBoundingClientRect();
        const x = originalEvent.clientX - rect.left;
        const y = originalEvent.clientY - rect.top;

        // Create event with proper coordinates
        let simulatedEvent;
        try {
          simulatedEvent = new originalEvent.constructor(originalEvent.type, {
            bubbles: true,
            cancelable: true,
            clientX: originalEvent.clientX,
            clientY: originalEvent.clientY,
            screenX: originalEvent.screenX,
            screenY: originalEvent.screenY,
            button: originalEvent.button,
            buttons: originalEvent.buttons,
            deltaY: originalEvent.deltaY,
            deltaX: originalEvent.deltaX,
            shiftKey: originalEvent.shiftKey,
            ctrlKey: originalEvent.ctrlKey,
            altKey: originalEvent.altKey,
            metaKey: originalEvent.metaKey
          });
        } catch (e) {
          // Fallback for events that can't be constructed
          return;
        }

        targetElement.dispatchEvent(simulatedEvent);
      };

      // Mouse events
      overlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.style.cursor = 'grabbing';
        forwardEvent(e, leafletContainer);
      });

      overlay.addEventListener('mousemove', (e) => {
        e.preventDefault();
        e.stopPropagation();
        forwardEvent(e, leafletContainer);
      });

      overlay.addEventListener('mouseup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.style.cursor = 'grab';
        forwardEvent(e, leafletContainer);
      });

      // Wheel events for zooming
      overlay.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        forwardEvent(e, leafletContainer);
      });

      // Touch events for mobile
      overlay.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.touches && e.touches.length > 0) {
          const touch = e.touches[0];
          const mouseEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0
          });
          leafletContainer.dispatchEvent(mouseEvent);
        }
      });

      overlay.addEventListener('touchmove', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.touches && e.touches.length > 0) {
          const touch = e.touches[0];
          const mouseEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: touch.clientX,
            clientY: touch.clientY
          });
          leafletContainer.dispatchEvent(mouseEvent);
        }
      });

      overlay.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const mouseEvent = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          button: 0
        });
        leafletContainer.dispatchEvent(mouseEvent);
      });

      // Add overlay to map container
      container.style.position = 'relative';
      container.appendChild(overlay);
      this.editorOverlay = overlay;

      console.log('Editor event forwarding overlay created');
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

      const newMapType = this.currentMapType;

      // Update selectedMapType
      this.selectedMapType = newMapType;

      // Remove all existing tile layers
      Object.values(this.tileLayers).forEach(layer => {
        if (this.map.hasLayer(layer)) {
          this.map.removeLayer(layer);
        }
      });

      // Add the selected layer
      const selectedLayer = this.tileLayers[newMapType];
      if (selectedLayer) {
        selectedLayer.addTo(this.map);
        console.log(`Map type changed to: ${newMapType}`);
      } else {
        console.warn(`Unknown map type: ${newMapType}, available types:`, Object.keys(this.tileLayers));
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

      // Store the EXACT coordinates for internal use
      this.userExactLat = latitude;
      this.userExactLng = longitude;

      try {
        // Remove existing marker if any
        if (this.userLocationMarker) {
          this.map.removeLayer(this.userLocationMarker);
        }

        // Create marker at EXACT location (will be shown/hidden based on privacy mode)
        this.userLocationMarker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div class="user-location-dot"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        // Show exact marker ONLY when privacy mode is OFF
        if (!this.content?.enablePrivacyMode) {
          this.userLocationMarker.addTo(this.map);
          this.userLocationMarker.bindPopup('Your exact location');
        }

        // Center map on user location if requested
        if (this.content?.centerOnUserLocation) {
          this.map.setView([latitude, longitude], this.content?.initialZoom || 15);
        }

        // Update privacy circle (will show/hide based on privacy mode)
        this.updatePrivacyMode();

        this.$emit('trigger-event', {
          name: 'location-granted',
          event: {
            position: { lat: latitude, lng: longitude }
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
        // Remove existing marked location marker
        if (this.userMarkedLocationMarker) {
          this.map.removeLayer(this.userMarkedLocationMarker);
        }

        // Create new marked location marker
        this.userMarkedLocationMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-marked-location',
            html: '<div class="user-marked-dot"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        });

        // Show marker only if privacy mode is OFF
        if (!this.content?.enablePrivacyMode) {
          this.userMarkedLocationMarker.addTo(this.map);
          this.userMarkedLocationMarker.bindPopup('Your marked location');
        }

        // Update privacy circle to reflect new location
        this.updatePrivacyCircle();

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
      if (!this.map) return;

      // Handle user location marker visibility
      if (this.userLocationMarker) {
        if (this.content?.enablePrivacyMode) {
          // Privacy ON: Hide exact marker
          if (this.map.hasLayer(this.userLocationMarker)) {
            this.map.removeLayer(this.userLocationMarker);
          }
        } else {
          // Privacy OFF: Show exact marker
          if (!this.map.hasLayer(this.userLocationMarker)) {
            this.userLocationMarker.addTo(this.map);
            this.userLocationMarker.bindPopup('Your exact location');
          }
        }
      }

      // Handle privacy circle
      this.updatePrivacyCircle();

      // Handle marked location marker (click-to-mark)
      if (this.userMarkedLocationMarker) {
        if (this.content?.enablePrivacyMode) {
          // Privacy ON: Hide exact marked location
          if (this.map.hasLayer(this.userMarkedLocationMarker)) {
            this.map.removeLayer(this.userMarkedLocationMarker);
          }
        } else {
          // Privacy OFF: Show exact marked location
          if (!this.map.hasLayer(this.userMarkedLocationMarker)) {
            this.userMarkedLocationMarker.addTo(this.map);
          }
        }
      }
    },

    updatePrivacyCircle() {
      // Remove existing circle
      if (this.privacyCircle) {
        this.map.removeLayer(this.privacyCircle);
        this.privacyCircle = null;
      }

      // Only show circle in privacy mode AND when we have a location
      if (this.content?.enablePrivacyMode && this.map) {
        let centerLat, centerLng;

        if (this.userExactLat && this.userExactLng) {
          // Use geolocation coordinates with random offset
          const radius = this.getPrivacyRadiusInKm();
          const offset = this.generateRandomOffset(radius);
          centerLat = this.userExactLat + offset.lat;
          centerLng = this.userExactLng + offset.lng;
        } else if (this.userMarkedLocationMarker) {
          // Use marked location coordinates with random offset
          const markedPos = this.userMarkedLocationMarker.getLatLng();
          const radius = this.getPrivacyRadiusInKm();
          const offset = this.generateRandomOffset(radius);
          centerLat = markedPos.lat + offset.lat;
          centerLng = markedPos.lng + offset.lng;
        } else {
          return; // No location to show privacy circle for
        }

        const radiusInMeters = this.getPrivacyRadiusInKm() * 1000;

        this.privacyCircle = L.circle([centerLat, centerLng], {
          radius: radiusInMeters,
          color: '#ff6b6b',
          fillColor: '#ff6b6b',
          fillOpacity: 0.2,
          weight: 2,
          dashArray: '5, 5'
        }).addTo(this.map);

        this.privacyCircle.bindPopup(`Privacy radius: ${this.getPrivacyRadiusInKm()} ${this.content?.privacyUnit || 'km'} - Position randomized for privacy`);
      }
    },

    togglePrivacyMode() {
      console.log('Privacy mode toggle clicked');

      // Simple alert to test if the click is working
      alert('Privacy toggle clicked! Current mode: ' + (this.content?.enablePrivacyMode ? 'Private' : 'Exact'));

      // Emit trigger event
      this.$emit('trigger-event', {
        name: 'privacy-mode-toggled',
        event: {
          enabled: !this.content?.enablePrivacyMode,
          previousMode: this.content?.enablePrivacyMode ? 'private' : 'exact'
        }
      });
    },

    getPrivacyRadiusInKm() {
      const unit = this.content?.privacyUnit || 'km';
      let radius;

      if (unit === 'miles') {
        radius = this.content?.privacyRadiusMiles || 0.62;
        return radius * 1.60934; // Convert miles to km
      } else {
        radius = this.content?.privacyRadius || 1;
        return radius;
      }
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

  }
};
</script>

<style lang="scss" scoped>
.openstreet-map {
  position: relative;
  width: 100%;
  height: var(--map-height);

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
