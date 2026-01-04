export default {
  name: "OpenStreetMap",
  editor: {
    label: {
      en: "OpenStreet Map",
    },
    icon: "map",
  },
  properties: {
    // Map Configuration
    initialLat: {
      label: {
        en: "Initial Latitude",
      },
      type: "Number",
      section: "settings",
      defaultValue: 51.505,
      step: 0.001,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Latitude coordinate for map center"
      },
      /* wwEditor:end */
    },
    initialLng: {
      label: {
        en: "Initial Longitude",
      },
      type: "Number",
      section: "settings",
      defaultValue: -0.09,
      step: 0.001,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Longitude coordinate for map center"
      },
      /* wwEditor:end */
    },
    initialZoom: {
      label: {
        en: "Initial Zoom Level",
      },
      type: "Number",
      section: "settings",
      defaultValue: 13,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Zoom level from 1 (world) to 18 (street level)"
      },
      /* wwEditor:end */
    },
    mapHeight: {
      label: {
        en: "Map Height",
      },
      type: "Length",
      section: "style",
      defaultValue: "400px",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS height value (e.g., '400px', '100%', '50vh')"
      },
      /* wwEditor:end */
    },

    // Map Type Selection
    mapType: {
      label: {
        en: "Map Type",
      },
      type: "TextSelect",
      section: "settings",
      options: {
        options: [
          { value: "osm", label: "OpenStreetMap" },
          { value: "satellite", label: "Satellite" },
          { value: "terrain", label: "Terrain" },
          { value: "dark", label: "Dark Theme" },
          { value: "light", label: "Light Theme" }
        ]
      },
      defaultValue: "osm",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Valid values: osm | satellite | terrain | dark | light"
      },
      /* wwEditor:end */
    },
    allowMapTypeSelection: {
      label: {
        en: "Allow Map Type Selection",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Show map type selector control"
      },
      /* wwEditor:end */
    },

    // Vector Tiles Performance
    useVectorTiles: {
      label: {
        en: "Use Vector Tiles (Experimental)",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: false,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Enable vector tiles for better performance (requires additional setup)"
      },
      propertyHelp: "EXPERIMENTAL: Vector tiles provide better performance by generating boundary data as tiles. Currently falls back to GeoJSON mode. Full MVT support requires Leaflet.VectorGrid integration."
      /* wwEditor:end */
    },

    // Markers and Collections
    markers: {
      label: {
        en: "Markers",
      },
      type: "Array",
      section: "settings",
      bindable: true,
      defaultValue: [],
      options: {
        expandable: true,
        getItemLabel(item) {
          return item.name || item.title || item.label || `Marker ${item.id || 'Unknown'}`;
        },
        item: {
          type: "Object",
          defaultValue: { id: "marker1", name: "New Marker", lat: 51.505, lng: -0.09 },
          options: {
            item: {
              id: { label: { en: "ID" }, type: "Text" },
              name: { label: { en: "Name" }, type: "Text" },
              lat: { label: { en: "Latitude" }, type: "Number", step: 0.001 },
              lng: { label: { en: "Longitude" }, type: "Number", step: 0.001 },
              description: { label: { en: "Description" }, type: "Text" }
            }
          }
        }
      },
      /* wwEditor:start */
      bindingValidation: {
        type: "array",
        tooltip: "Array of marker objects with lat, lng, name properties"
      },
      /* wwEditor:end */
    },

    // Formula properties for dynamic field mapping
    markersLatFormula: {
      label: { en: "Latitude Field" },
      type: "Formula",
      section: "settings",
      options: content => ({
        template: Array.isArray(content.markers) && content.markers.length > 0 ? content.markers[0] : null,
      }),
      defaultValue: {
        type: "f",
        code: "context.mapping?.['lat']",
      },
      hidden: (content, sidepanelContent, boundProps) =>
        !Array.isArray(content.markers) || !content.markers?.length || !boundProps.markers,
      /* wwEditor:start */
      propertyHelp: {
        en: "Maps the latitude field from your bound marker data. This field only appears when Markers is bound to external data. Use this when your data source has a different field name (e.g., 'latitude' or 'y' instead of 'lat'). The formula receives each marker item and should return the latitude value. Example: context.mapping?.['latitude']"
      },
      /* wwEditor:end */
    },
    markersLngFormula: {
      label: { en: "Longitude Field" },
      type: "Formula",
      section: "settings",
      options: content => ({
        template: Array.isArray(content.markers) && content.markers.length > 0 ? content.markers[0] : null,
      }),
      defaultValue: {
        type: "f",
        code: "context.mapping?.['lng']",
      },
      hidden: (content, sidepanelContent, boundProps) =>
        !Array.isArray(content.markers) || !content.markers?.length || !boundProps.markers,
      /* wwEditor:start */
      propertyHelp: {
        en: "Maps the longitude field from your bound marker data. This field only appears when Markers is bound to external data. Use this when your data source has a different field name (e.g., 'longitude' or 'x' instead of 'lng'). The formula receives each marker item and should return the longitude value. Example: context.mapping?.['longitude']"
      },
      /* wwEditor:end */
    },
    markersNameFormula: {
      label: { en: "Name Field" },
      type: "Formula",
      section: "settings",
      options: content => ({
        template: Array.isArray(content.markers) && content.markers.length > 0 ? content.markers[0] : null,
      }),
      defaultValue: {
        type: "f",
        code: "context.mapping?.['name']",
      },
      hidden: (content, sidepanelContent, boundProps) =>
        !Array.isArray(content.markers) || !content.markers?.length || !boundProps.markers,
      /* wwEditor:start */
      propertyHelp: {
        en: "Maps the name/label field from your bound marker data. This field only appears when Markers is bound to external data. Use this when your data source has a different field name (e.g., 'title', 'label', or 'displayName' instead of 'name'). The formula receives each marker item and should return the display name. Example: context.mapping?.['title']"
      },
      /* wwEditor:end */
    },

    // Clustering
    enableClustering: {
      label: {
        en: "Enable Marker Clustering",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Group nearby markers into clusters"
      },
      /* wwEditor:end */
    },
    clusterMaxZoom: {
      label: {
        en: "Cluster Max Zoom",
      },
      type: "Number",
      section: "settings",
      defaultValue: 15,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
      hidden: content => !content?.enableClustering,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Maximum zoom level at which clusters are created (1-18)"
      },
      /* wwEditor:end */
    },

    // Geolocation
    requestGeolocation: {
      label: {
        en: "Request User Location",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Request browser geolocation permission"
      },
      /* wwEditor:end */
    },
    showUserLocation: {
      label: {
        en: "Show User Location",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Display marker at user's current location"
      },
      /* wwEditor:end */
    },
    centerOnUserLocation: {
      label: {
        en: "Center on User Location",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      hidden: content => !content?.showUserLocation,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Center map on user's location when detected"
      },
      /* wwEditor:end */
    },

    // Privacy Mode
    enablePrivacyMode: {
      label: {
        en: "Enable Privacy Mode",
      },
      type: "OnOff",
      section: "privacy",
      defaultValue: false,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Hide exact user location within privacy radius"
      },
      /* wwEditor:end */
    },
    privacyRadius: {
      label: {
        en: "Privacy Radius (km)",
      },
      type: "Number",
      section: "privacy",
      defaultValue: 1,
      min: 0.1,
      max: 50,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enablePrivacyMode,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Privacy radius in kilometers (0.1-50)"
      },
      /* wwEditor:end */
    },
    privacyRadiusMiles: {
      label: {
        en: "Privacy Radius (miles)",
      },
      type: "Number",
      section: "privacy",
      defaultValue: 0.62,
      min: 0.1,
      max: 31,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enablePrivacyMode,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Privacy radius in miles (0.1-31)"
      },
      /* wwEditor:end */
    },
    privacyUnit: {
      label: {
        en: "Privacy Unit",
      },
      type: "TextSelect",
      section: "privacy",
      options: {
        options: [
          { value: "km", label: "Kilometers" },
          { value: "miles", label: "Miles" }
        ]
      },
      defaultValue: "km",
      bindable: true,
      hidden: content => !content?.enablePrivacyMode,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Valid values: km | miles"
      },
      /* wwEditor:end */
    },

    // Click to Mark Location
    allowClickToMark: {
      label: {
        en: "Allow Click to Mark Location",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: false,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Allow users to click on map to mark their location"
      },
      propertyHelp: "When enabled, users can click on the map to set a location marker. Works at zoom levels >= Location Zoom Threshold."
      /* wwEditor:end */
    },
    locationZoomThreshold: {
      label: {
        en: "Location Zoom Threshold",
      },
      type: "Number",
      section: "settings",
      defaultValue: 8,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
      hidden: content => !content?.allowClickToMark,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Zoom level threshold for location selection (1-18)"
      },
      propertyHelp: "At this zoom level and higher, boundaries hide and users can click to mark locations. Below this level, country/state boundaries are shown and clickable. Default: 8"
      /* wwEditor:end */
    },

    // Reverse Geocoding Configuration
    enableReverseGeocoding: {
      label: {
        en: "Enable Reverse Geocoding",
      },
      type: "OnOff",
      section: "geocoding",
      defaultValue: false,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Enable automatic address lookup for clicked locations"
      },
      propertyHelp: "Automatically converts latitude/longitude coordinates to readable addresses using OpenStreetMap Nominatim service"
      /* wwEditor:end */
    },
    geocodingRateLimit: {
      label: {
        en: "Geocoding Rate Limit (ms)",
      },
      type: "Number",
      section: "geocoding",
      defaultValue: 1000,
      min: 500,
      max: 5000,
      step: 100,
      bindable: true,
      hidden: content => !content?.enableReverseGeocoding,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Minimum time between geocoding requests in milliseconds"
      },
      propertyHelp: "Rate limiting helps comply with OpenStreetMap usage policies (minimum 1 request per second)"
      /* wwEditor:end */
    },

    // Country Hover Effects
    enableCountryHover: {
      label: {
        en: "Enable Country Hover",
      },
      type: "OnOff",
      section: "countries",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Enable country boundaries with hover effects"
      },
      propertyHelp: "Shows country boundaries and highlights them on hover"
      /* wwEditor:end */
    },
    countryMinZoom: {
      label: {
        en: "Country Min Zoom Level",
      },
      type: "Number",
      section: "countries",
      defaultValue: 1,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Minimum zoom level to show country boundaries (1-18)"
      },
      propertyHelp: "Countries will only show when zoom level is >= this value"
      /* wwEditor:end */
    },
    countryMaxZoom: {
      label: {
        en: "Country Max Zoom Level",
      },
      type: "Number",
      section: "countries",
      defaultValue: 7,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Maximum zoom level to show country boundaries (1-18)"
      },
      propertyHelp: "Countries will only show when zoom level is <= this value. Default is 7 to hide boundaries at zoom 8+ (location selection mode)."
      /* wwEditor:end */
    },
    countryHoverColor: {
      label: {
        en: "Country Hover Color"
      },
      type: "Color",
      section: "countries",
      defaultValue: "#ff0000",
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS color value for country hover state"
      },
      /* wwEditor:end */
    },
    countryHoverOpacity: {
      label: {
        en: "Country Hover Opacity",
      },
      type: "Number",
      section: "countries",
      defaultValue: 0.3,
      min: 0,
      max: 1,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Opacity of hover color (0-1)"
      },
      /* wwEditor:end */
    },
    countryBorderColor: {
      label: {
        en: "Country Border Color"
      },
      type: "Color",
      section: "countries",
      defaultValue: "#666666",
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS color value for country borders"
      },
      /* wwEditor:end */
    },
    countryBorderWidth: {
      label: {
        en: "Country Border Width",
      },
      type: "Number",
      section: "countries",
      defaultValue: 1,
      min: 0.5,
      max: 5,
      step: 0.5,
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Border width in pixels (0.5-5)"
      },
      /* wwEditor:end */
    },
    countryBorderOpacity: {
      label: {
        en: "Country Border Opacity",
      },
      type: "Number",
      section: "countries",
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Opacity of country borders (0-1)"
      },
      /* wwEditor:end */
    },
    countrySelectedColor: {
      label: {
        en: "Country Selected Color"
      },
      type: "Color",
      section: "countries",
      defaultValue: "#0000ff",
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS color value for selected country"
      },
      /* wwEditor:end */
    },
    countrySelectedOpacity: {
      label: {
        en: "Country Selected Opacity",
      },
      type: "Number",
      section: "countries",
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enableCountryHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Opacity of selected country color (0-1)"
      },
      /* wwEditor:end */
    },

    // State/Province Hover Effects
    enableStateHover: {
      label: {
        en: "Enable State/Province Hover",
      },
      type: "OnOff",
      section: "states",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Enable state/province boundaries with hover effects"
      },
      propertyHelp: "Shows state/province boundaries and highlights them on hover"
      /* wwEditor:end */
    },
    stateMinZoom: {
      label: {
        en: "State Min Zoom Level",
      },
      type: "Number",
      section: "states",
      defaultValue: 4,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Minimum zoom level to show state boundaries (1-18)"
      },
      propertyHelp: "States will only show when zoom level is >= this value"
      /* wwEditor:end */
    },
    stateMaxZoom: {
      label: {
        en: "State Max Zoom Level",
      },
      type: "Number",
      section: "states",
      defaultValue: 7,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Maximum zoom level to show state boundaries (1-18)"
      },
      propertyHelp: "States will only show when zoom level is <= this value. Default is 7 to hide boundaries at zoom 8+ (location selection mode)."
      /* wwEditor:end */
    },
    stateHoverColor: {
      label: {
        en: "State Hover Color"
      },
      type: "Color",
      section: "states",
      defaultValue: "#ff0000",
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS color value for state hover"
      },
      /* wwEditor:end */
    },
    stateHoverOpacity: {
      label: {
        en: "State Hover Opacity",
      },
      type: "Number",
      section: "states",
      defaultValue: 0.3,
      min: 0,
      max: 1,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Opacity of hover color (0-1)"
      },
      /* wwEditor:end */
    },
    stateBorderColor: {
      label: {
        en: "State Border Color"
      },
      type: "Color",
      section: "states",
      defaultValue: "#666666",
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS color value for state borders"
      },
      /* wwEditor:end */
    },
    stateBorderWidth: {
      label: {
        en: "State Border Width",
      },
      type: "Number",
      section: "states",
      defaultValue: 1,
      min: 0.5,
      max: 5,
      step: 0.5,
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Border width in pixels (0.5-5)"
      },
      /* wwEditor:end */
    },
    stateBorderOpacity: {
      label: {
        en: "State Border Opacity",
      },
      type: "Number",
      section: "states",
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Opacity of state borders (0-1)"
      },
      /* wwEditor:end */
    },
    stateSelectedColor: {
      label: {
        en: "State Selected Color"
      },
      type: "Color",
      section: "states",
      defaultValue: "#0000ff",
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS color value for selected state"
      },
      /* wwEditor:end */
    },
    stateSelectedOpacity: {
      label: {
        en: "State Selected Opacity",
      },
      type: "Number",
      section: "states",
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      bindable: true,
      hidden: content => !content?.enableStateHover,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Opacity of selected state color (0-1)"
      },
      /* wwEditor:end */
    },
    selectedLocationMarkerColor: {
      label: {
        en: "Selected Location Marker Color"
      },
      type: "Color",
      section: "settings",
      defaultValue: "#FF5722",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Color for selected location markers"
      },
      /* wwEditor:end */
    },
    isOnline: {
      label: {
        en: "Is Online",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Whether to use online tile sources"
      },
      /* wwEditor:end */
    },

    // USDA Hardiness Zone from database
    userHardinessZone: {
      label: {
        en: "User Hardiness Zone",
      },
      type: "Text",
      section: "hardiness",
      defaultValue: "7a",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "USDA Hardiness Zone from user profile (1a-13b)"
      },
      /* wwEditor:end */
    },
    usersHardinessData: {
      label: {
        en: "Users Hardiness Data",
      },
      type: "Array",
      section: "hardiness",
      bindable: true,
      defaultValue: [],
      options: {
        expandable: true,
        getItemLabel(item) {
          return `User - Zone ${item.hardinessZone || 'Unknown'}` + (item.name ? ` (${item.name})` : '');
        },
        item: {
          type: "Object",
          defaultValue: { lat: 51.505, lng: -0.09, hardinessZone: "7a", name: "User" },
          options: {
            item: {
              lat: { label: { en: "Latitude" }, type: "Number", step: 0.001 },
              lng: { label: { en: "Longitude" }, type: "Number", step: 0.001 },
              hardinessZone: { label: { en: "Hardiness Zone" }, type: "Text" },
              name: { label: { en: "User Name" }, type: "Text" }
            }
          }
        }
      },
      /* wwEditor:start */
      bindingValidation: {
        type: "array",
        tooltip: "Array of users with lat, lng, hardinessZone properties"
      },
      /* wwEditor:end */
    },

    // Formula properties for dynamic field mapping
    usersLatFormula: {
      label: { en: "Users Latitude Field" },
      type: "Formula",
      section: "hardiness",
      options: content => ({
        template: Array.isArray(content.usersHardinessData) && content.usersHardinessData.length > 0 ? content.usersHardinessData[0] : null,
      }),
      defaultValue: {
        type: "f",
        code: "context.mapping?.['lat']",
      },
      hidden: (content, sidepanelContent, boundProps) =>
        !Array.isArray(content.usersHardinessData) || !content.usersHardinessData?.length || !boundProps.usersHardinessData,
      /* wwEditor:start */
      propertyHelp: {
        en: "Maps the latitude field from your bound user hardiness data. This field only appears when Users Hardiness Data is bound to external data (e.g., a Supabase query). Use this when your data source has a different field name (e.g., 'latitude' or 'user_lat' instead of 'lat'). The formula receives each user item and should return the latitude value. Example: context.mapping?.['latitude']"
      },
      /* wwEditor:end */
    },
    usersLngFormula: {
      label: { en: "Users Longitude Field" },
      type: "Formula",
      section: "hardiness",
      options: content => ({
        template: Array.isArray(content.usersHardinessData) && content.usersHardinessData.length > 0 ? content.usersHardinessData[0] : null,
      }),
      defaultValue: {
        type: "f",
        code: "context.mapping?.['lng']",
      },
      hidden: (content, sidepanelContent, boundProps) =>
        !Array.isArray(content.usersHardinessData) || !content.usersHardinessData?.length || !boundProps.usersHardinessData,
      /* wwEditor:start */
      propertyHelp: {
        en: "Maps the longitude field from your bound user hardiness data. This field only appears when Users Hardiness Data is bound to external data (e.g., a Supabase query). Use this when your data source has a different field name (e.g., 'longitude' or 'user_lng' instead of 'lng'). The formula receives each user item and should return the longitude value. Example: context.mapping?.['longitude']"
      },
      /* wwEditor:end */
    },
    usersZoneFormula: {
      label: { en: "Users Hardiness Zone Field" },
      type: "Formula",
      section: "hardiness",
      options: content => ({
        template: Array.isArray(content.usersHardinessData) && content.usersHardinessData.length > 0 ? content.usersHardinessData[0] : null,
      }),
      defaultValue: {
        type: "f",
        code: "context.mapping?.['hardinessZone']",
      },
      hidden: (content, sidepanelContent, boundProps) =>
        !Array.isArray(content.usersHardinessData) || !content.usersHardinessData?.length || !boundProps.usersHardinessData,
      /* wwEditor:start */
      propertyHelp: {
        en: "Maps the USDA hardiness zone field from your bound user data. This field only appears when Users Hardiness Data is bound to external data (e.g., a Supabase query). Use this when your data source has a different field name (e.g., 'zone', 'usda_zone', or 'growing_zone' instead of 'hardinessZone'). The formula receives each user item and should return the zone value (e.g., '7a', '8b'). Example: context.mapping?.['zone']"
      },
      /* wwEditor:end */
    },
    showHardinessHeatmap: {
      label: {
        en: "Show Hardiness Heatmap",
      },
      type: "OnOff",
      section: "hardiness",
      defaultValue: false,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Display heatmap visualization of hardiness zones"
      },
      /* wwEditor:end */
    },
    hardinessHeatmapRadius: {
      label: {
        en: "Heatmap Radius (km)",
      },
      type: "Number",
      section: "hardiness",
      defaultValue: 50,
      min: 10,
      max: 200,
      step: 10,
      bindable: true,
      hidden: content => !content?.showHardinessHeatmap,
      /* wwEditor:start */
      bindingValidation: {
        type: "number",
        tooltip: "Heatmap point radius in kilometers (10-200)"
      },
      /* wwEditor:end */
    },


    // Styling
    mapStyle: {
      label: {
        en: "Map Border Radius",
      },
      type: "Length",
      section: "style",
      defaultValue: "8px",
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "CSS border-radius value (e.g., '8px', '1rem')"
      },
      /* wwEditor:end */
    }
  },
  triggerEvents: [
    { name: "marker-click", label: "Marker clicked", event: { marker: {}, position: {} } },
    { name: "user-location-click", label: "User location marker clicked", event: { position: {}, type: "" } },
    { name: "marked-location-click", label: "Marked location clicked", event: { position: {}, type: "" } },
    { name: "location-granted", label: "Location permission granted", event: { position: {} } },
    { name: "location-denied", label: "Location permission denied", event: {} },
    { name: "location-marked", label: "Location marked by click", event: { position: {} } },
    { name: "map-click", label: "Map clicked", event: { position: {}, zoom: 0, mode: "" } },
    { name: "map-ready", label: "Map initialized", event: {} },
    { name: "privacy-mode-toggled", label: "Privacy mode toggled", event: { enabled: false, previousMode: "" } },
    // Reverse Geocoding Events
    { name: "location-geocoded", label: "Location geocoded", event: { geocoded: {}, coordinates: {} } },
    { name: "user-location-geocoded", label: "User location geocoded", event: { geocoded: {}, coordinates: {}, type: "" } },
    { name: "marked-location-geocoded", label: "Marked location geocoded", event: { geocoded: {}, coordinates: {}, type: "" } },
    // Country Interaction Events
    { name: "countries-loaded", label: "Country boundaries loaded", event: { countriesCount: 0 } },
    { name: "country-hover", label: "Country hovered", event: { country: {}, coordinates: {} } },
    { name: "country-hover-out", label: "Country hover ended", event: { country: {} } },
    { name: "country-click", label: "Country clicked", event: { country: {}, coordinates: {}, action: "" } },
    { name: "country-selected", label: "Country selected", event: { country: {} } },
    { name: "country-deselected", label: "Country deselected", event: { country: {} } },
    // State/Province Interaction Events
    { name: "states-loaded", label: "State boundaries loaded", event: { statesCount: 0 } },
    { name: "state-hover", label: "State hovered", event: { state: {}, coordinates: {} } },
    { name: "state-hover-out", label: "State hover ended", event: { state: {} } },
    { name: "state-click", label: "State clicked", event: { state: {}, coordinates: {}, action: "" } },
    { name: "state-selected", label: "State selected", event: { state: {} } },
    { name: "state-deselected", label: "State deselected", event: { state: {} } },
    // Map Bounds Events
    { name: "map-bounds-change", label: "Map bounds changed", event: { bounds: {}, zoom: 0, center: {} } },
    // Location Selection Events
    { name: "location-deselected", label: "Location deselected", event: { location: {}, position: {} } },
    // Error Events
    { name: "geocoding-error", label: "Geocoding error", event: { error: "", coordinates: {} } },
    { name: "supabase-error", label: "Supabase error", event: { error: "" } }
  ]
};
