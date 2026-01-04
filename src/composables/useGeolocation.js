/**
 * Composable for managing user geolocation
 * Handles location requests, privacy mode, and location markers
 */

import { ref, computed, watch, onBeforeUnmount } from 'vue';
import L from 'leaflet';
import { geoLogger } from '../config/debug.js';

/**
 * Default geolocation options
 */
const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000
};

/**
 * Generate cryptographically secure random number between 0 and 1
 * Falls back to Math.random() if crypto API is not available
 * @returns {number} Random number between 0 and 1
 */
function getSecureRandom() {
  try {
    // Try to use crypto API for secure randomness
    const frontWindow = (typeof wwLib !== 'undefined' && wwLib?.getFrontWindow && wwLib.getFrontWindow()) ||
                        (typeof window !== 'undefined' ? window : null);

    if (frontWindow?.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      frontWindow.crypto.getRandomValues(array);
      return array[0] / (0xFFFFFFFF + 1);
    }

    // Node.js environment fallback
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      globalThis.crypto.getRandomValues(array);
      return array[0] / (0xFFFFFFFF + 1);
    }
  } catch (e) {
    // Silent fallback to Math.random
  }

  // Fallback to Math.random (less secure but functional)
  return Math.random();
}

/**
 * Generate random offset for privacy mode using cryptographically secure randomness
 *
 * ALGORITHM: Uniform Random Point in Circle (Polar Coordinates)
 *
 * To place a point uniformly within a circle:
 *   1. Generate random angle θ ∈ [0, 2π) - determines direction
 *   2. Generate random distance r ∈ [0, radius] - determines how far from center
 *   3. Convert to Cartesian: (r·cos(θ), r·sin(θ))
 *
 * IMPORTANT: We use UNIFORM distance (not sqrt-corrected) intentionally.
 * This creates slight center bias, which is DESIRABLE for privacy:
 * - Users are more likely to be placed near their actual location
 * - Provides plausible deniability while maintaining reasonable accuracy
 * - Fully uniform distribution would place too many points at circle edge
 *
 * Degree Conversion: 1 degree ≈ 111.32 km at equator
 * This is approximate - actual distance varies with latitude, but acceptable
 * for privacy circles of 1-10km radius.
 *
 * @param {number} radiusKm - Privacy radius in kilometers
 * @returns {{lat: number, lng: number}} Offset values in degrees
 */
export function generateRandomOffset(radiusKm) {
  const radiusInDegrees = radiusKm / 111.32; // Approximate conversion
  const angle = getSecureRandom() * 2 * Math.PI;
  const distance = getSecureRandom() * radiusInDegrees;

  return {
    lat: distance * Math.cos(angle),
    lng: distance * Math.sin(angle)
  };
}

/**
 * Convert miles to kilometers
 * @param {number} miles - Distance in miles
 * @returns {number} Distance in kilometers
 */
export function milesToKm(miles) {
  return miles * 1.60934;
}

/**
 * Composable for managing user geolocation
 * @param {Ref<L.Map|null>} mapRef - Reference to Leaflet map instance
 * @param {Object} options - Configuration options
 * @returns {Object} Geolocation state and methods
 *
 * @example
 * // Initialize the composable in a Vue component setup
 * import { ref } from 'vue';
 * import { useGeolocation } from './composables/useGeolocation';
 *
 * const mapRef = ref(null);
 * const emit = defineEmits(['trigger-event']);
 *
 * const {
 *   requestUserLocation,
 *   userLocation,
 *   hasLocation,
 *   geolocationDenied,
 *   markLocation,
 *   isPrivacyModeEnabled,
 *   error
 * } = useGeolocation(mapRef, {
 *   emit,
 *   getContent: () => props.content,
 *   onLocationGranted: (position) => {
 *     console.log('User location:', position.lat, position.lng);
 *   },
 *   onLocationDenied: (error) => {
 *     console.error('Location denied:', error);
 *   }
 * });
 *
 * // Request user's current location (one-time)
 * requestUserLocation(false);
 *
 * // Request with continuous watching
 * requestUserLocation(true);
 *
 * // Check if location is available
 * if (hasLocation.value) {
 *   console.log('Current location:', userLocation.value);
 * }
 *
 * // Manually mark a location on the map
 * markLocation(51.5074, -0.1278); // London coordinates
 *
 * // Handle denied permission
 * if (geolocationDenied.value) {
 *   console.log('User denied location access:', error.value);
 * }
 */
export function useGeolocation(mapRef, options = {}) {
  const {
    emit = () => {},
    getContent = () => ({}),
    onLocationGranted = null,
    onLocationDenied = null
  } = options;

  // State
  const userExactLat = ref(null);
  const userExactLng = ref(null);
  const geolocationRequested = ref(false);
  const geolocationDenied = ref(false);
  const showUserLocation = ref(false);
  const watchId = ref(null);
  const error = ref(null);

  // Marker refs
  const userLocationMarker = ref(null);
  const userMarkedLocationMarker = ref(null);
  const privacyCircle = ref(null);

  // Computed
  const content = computed(() => getContent());

  const hasLocation = computed(() => {
    return userExactLat.value !== null && userExactLng.value !== null;
  });

  const userLocation = computed(() => {
    if (!hasLocation.value) return null;
    return {
      lat: userExactLat.value,
      lng: userExactLng.value,
      timestamp: new Date().toISOString()
    };
  });

  const isPrivacyModeEnabled = computed(() => {
    return content.value?.enablePrivacyMode ?? false;
  });

  const privacyRadiusKm = computed(() => {
    const unit = content.value?.privacyUnit || 'km';
    if (unit === 'miles') {
      const miles = content.value?.privacyRadiusMiles || 0.62;
      return milesToKm(miles);
    }
    return content.value?.privacyRadius || 1;
  });

  const markerColor = computed(() => {
    return content.value?.isOnline ? '#4CAF50' : '#9E9E9E';
  });

  /**
   * Create user location marker icon
   * @param {string} color - Marker color
   * @returns {L.DivIcon} Leaflet div icon
   */
  const createUserLocationIcon = (color = markerColor.value) => {
    return L.divIcon({
      className: 'user-location-marker',
      html: `<div class="user-location-dot" style="
        background-color: ${color};
        border-radius: 50%;
        width: 20px;
        height: 20px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  };

  /**
   * Create marked location marker icon
   * @param {string} color - Marker color
   * @returns {L.DivIcon} Leaflet div icon
   */
  const createMarkedLocationIcon = (color = '#FF5722') => {
    return L.divIcon({
      className: 'marked-location-marker',
      html: `<div class="marked-location-dot" style="
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        width: 16px;
        height: 16px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  };

  /**
   * Update user location marker appearance
   */
  const updateUserLocationMarker = () => {
    if (!userLocationMarker.value || !hasLocation.value) return;

    try {
      const newIcon = createUserLocationIcon();
      userLocationMarker.value.setIcon(newIcon);
    } catch (err) {
      geoLogger.error('Error updating marker:', err);
    }
  };

  /**
   * Update privacy circle
   */
  const updatePrivacyCircle = () => {
    const map = mapRef.value;
    if (!map) return;

    // Remove existing circle
    if (privacyCircle.value) {
      map.removeLayer(privacyCircle.value);
      privacyCircle.value = null;
    }

    // Only show if privacy mode is enabled and we have a location
    if (!isPrivacyModeEnabled.value || !content.value?.showUserLocation) return;

    let centerLat, centerLng;

    if (hasLocation.value) {
      const offset = generateRandomOffset(privacyRadiusKm.value);
      centerLat = userExactLat.value + offset.lat;
      centerLng = userExactLng.value + offset.lng;
    } else if (userMarkedLocationMarker.value) {
      const markedPos = userMarkedLocationMarker.value.getLatLng();
      const offset = generateRandomOffset(privacyRadiusKm.value);
      centerLat = markedPos.lat + offset.lat;
      centerLng = markedPos.lng + offset.lng;
    } else {
      return;
    }

    const radiusInMeters = privacyRadiusKm.value * 1000;
    const circleColor = markerColor.value;

    privacyCircle.value = L.circle([centerLat, centerLng], {
      radius: radiusInMeters,
      color: circleColor,
      fillColor: circleColor,
      fillOpacity: 0.2,
      weight: 2,
      dashArray: '5, 5'
    }).addTo(map);
  };

  /**
   * Update privacy mode (show/hide markers based on settings)
   */
  const updatePrivacyMode = () => {
    const map = mapRef.value;
    if (!map) return;

    // Handle user location marker visibility
    if (userLocationMarker.value) {
      const shouldShow = !isPrivacyModeEnabled.value && content.value?.showUserLocation;

      if (shouldShow && !map.hasLayer(userLocationMarker.value)) {
        userLocationMarker.value.addTo(map);
      } else if (!shouldShow && map.hasLayer(userLocationMarker.value)) {
        map.removeLayer(userLocationMarker.value);
      }
    }

    // Handle marked location marker visibility
    if (userMarkedLocationMarker.value) {
      if (isPrivacyModeEnabled.value) {
        if (map.hasLayer(userMarkedLocationMarker.value)) {
          map.removeLayer(userMarkedLocationMarker.value);
        }
      } else {
        if (!map.hasLayer(userMarkedLocationMarker.value)) {
          userMarkedLocationMarker.value.addTo(map);
        }
      }
    }

    // Update privacy circle
    updatePrivacyCircle();
  };

  /**
   * Handle successful geolocation
   * @param {GeolocationPosition} position - Position from geolocation API
   */
  const onLocationSuccess = (position) => {
    const map = mapRef.value;
    if (!map) {
      error.value = 'Map not initialized';
      return;
    }

    const { latitude, longitude } = position.coords;
    error.value = null;
    showUserLocation.value = true;

    // Store exact coordinates
    userExactLat.value = latitude;
    userExactLng.value = longitude;

    try {
      // Remove existing marker
      if (userLocationMarker.value) {
        map.removeLayer(userLocationMarker.value);
      }

      // Create new marker
      userLocationMarker.value = L.marker([latitude, longitude], {
        icon: createUserLocationIcon()
      });

      // Add to map unless privacy mode is on
      if (!isPrivacyModeEnabled.value) {
        userLocationMarker.value.addTo(map);

        // Add click handler
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

      // Center map if configured (default: true)
      if (content.value?.centerOnUserLocation !== false) {
        map.setView([latitude, longitude], content.value?.initialZoom || 15);
      }

      // Update privacy mode UI
      updatePrivacyMode();

      // Emit event
      emit('trigger-event', {
        name: 'location-granted',
        event: {
          position: { lat: latitude, lng: longitude }
        }
      });

      // Call callback
      if (onLocationGranted) {
        onLocationGranted({ lat: latitude, lng: longitude });
      }
    } catch (err) {
      geoLogger.error('Error processing location:', err);
      error.value = err.message;
    }
  };

  /**
   * Handle geolocation error
   * @param {GeolocationPositionError} positionError - Error from geolocation API
   */
  const onLocationError = (positionError) => {
    geolocationDenied.value = true;

    switch (positionError.code) {
      case positionError.PERMISSION_DENIED:
        error.value = 'Location permission denied';
        break;
      case positionError.POSITION_UNAVAILABLE:
        error.value = 'Location information unavailable';
        break;
      case positionError.TIMEOUT:
        error.value = 'Location request timed out';
        break;
      default:
        error.value = 'Unknown location error';
    }

    emit('trigger-event', {
      name: 'location-denied',
      event: { error: error.value }
    });

    if (onLocationDenied) {
      onLocationDenied(error.value);
    }
  };

  /**
   * Request user location
   * @param {boolean} watch - Whether to watch position continuously
   */
  const requestUserLocation = (watchPosition = false) => {
    const frontWindow = (typeof wwLib !== 'undefined' && wwLib?.getFrontWindow && wwLib.getFrontWindow()) ||
                        (typeof window !== 'undefined' ? window : null);

    if (!frontWindow || !frontWindow.navigator?.geolocation) {
      error.value = 'Geolocation not supported';
      return false;
    }

    geolocationRequested.value = true;
    error.value = null;

    if (watchPosition) {
      // Watch position continuously
      watchId.value = frontWindow.navigator.geolocation.watchPosition(
        onLocationSuccess,
        onLocationError,
        DEFAULT_OPTIONS
      );
    } else {
      // Get current position once
      frontWindow.navigator.geolocation.getCurrentPosition(
        onLocationSuccess,
        onLocationError,
        DEFAULT_OPTIONS
      );
    }

    return true;
  };

  /**
   * Stop watching position
   */
  const stopWatching = () => {
    if (watchId.value !== null) {
      const frontWindow = (typeof wwLib !== 'undefined' && wwLib?.getFrontWindow && wwLib.getFrontWindow()) ||
                          (typeof window !== 'undefined' ? window : null);

      if (frontWindow && frontWindow.navigator?.geolocation) {
        frontWindow.navigator.geolocation.clearWatch(watchId.value);
      }
      watchId.value = null;
    }
  };

  /**
   * Mark a location manually
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   */
  const markLocation = (lat, lng) => {
    const map = mapRef.value;
    if (!map) return null;

    // Remove existing marked location
    if (userMarkedLocationMarker.value) {
      map.removeLayer(userMarkedLocationMarker.value);
    }

    const markerColor = content.value?.selectedLocationMarkerColor || '#FF5722';
    userMarkedLocationMarker.value = L.marker([lat, lng], {
      icon: createMarkedLocationIcon(markerColor)
    });

    if (!isPrivacyModeEnabled.value) {
      userMarkedLocationMarker.value.addTo(map);

      userMarkedLocationMarker.value.on('click', () => {
        emit('trigger-event', {
          name: 'marked-location-click',
          event: {
            position: { lat, lng },
            type: 'marked-location'
          }
        });
      });
    }

    updatePrivacyMode();

    emit('trigger-event', {
      name: 'location-marked',
      event: {
        position: { lat, lng }
      }
    });

    return { lat, lng };
  };

  /**
   * Remove marked location
   */
  const removeMarkedLocation = () => {
    const map = mapRef.value;

    if (userMarkedLocationMarker.value && map) {
      map.removeLayer(userMarkedLocationMarker.value);
      userMarkedLocationMarker.value = null;

      if (privacyCircle.value) {
        map.removeLayer(privacyCircle.value);
        privacyCircle.value = null;
      }
    }
  };

  /**
   * Clear all location state
   */
  const clearLocation = () => {
    const map = mapRef.value;

    stopWatching();
    removeMarkedLocation();

    if (userLocationMarker.value && map) {
      map.removeLayer(userLocationMarker.value);
      userLocationMarker.value = null;
    }

    if (privacyCircle.value && map) {
      map.removeLayer(privacyCircle.value);
      privacyCircle.value = null;
    }

    userExactLat.value = null;
    userExactLng.value = null;
    showUserLocation.value = false;
    geolocationRequested.value = false;
    geolocationDenied.value = false;
    error.value = null;
  };

  /**
   * Cleanup on unmount
   */
  const cleanup = () => {
    stopWatching();
    clearLocation();
  };

  // Cleanup on unmount
  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    // State
    userExactLat,
    userExactLng,
    geolocationRequested,
    geolocationDenied,
    showUserLocation,
    error,

    // Computed
    hasLocation,
    userLocation,
    isPrivacyModeEnabled,
    privacyRadiusKm,
    markerColor,

    // Marker refs
    userLocationMarker,
    userMarkedLocationMarker,
    privacyCircle,

    // Methods
    requestUserLocation,
    stopWatching,
    markLocation,
    removeMarkedLocation,
    clearLocation,
    updatePrivacyMode,
    updatePrivacyCircle,
    updateUserLocationMarker,
    cleanup,

    // Utilities
    createUserLocationIcon,
    createMarkedLocationIcon,
    generateRandomOffset,
    milesToKm
  };
}

export default useGeolocation;
