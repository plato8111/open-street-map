export default {
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
      defaultValue: 13,
      min: 1,
      max: 18,
      step: 1,
      bindable: true,
    },
    mapHeight: {
      label: {
        en: "Map Height",
      },
      type: "Length",
      defaultValue: "100%",
      bindable: true,
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
    },
    showUserLocation: {
      label: {
        en: "Show User Location",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
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
    },

    // Click to Mark Location
    allowClickToMark: {
      label: {
        en: "Allow Click to Mark Location",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: true,
      bindable: true,
    },

    // Editor Settings
    enableEditorInteraction: {
      label: {
        en: "Enable Editor Interaction",
      },
      type: "OnOff",
      section: "settings",
      defaultValue: false,
      bindable: true,
      /* wwEditor:start */
      bindingValidation: {
        type: "boolean",
        tooltip: "Allow map interaction in WeWeb editor"
      },
      propertyHelp: "When enabled, you can interact with the map directly in the WeWeb editor"
      /* wwEditor:end */
    },

    editorInteractionMethod: {
      label: {
        en: "Editor Interaction Method",
      },
      type: "TextSelect",
      section: "settings",
      options: {
        options: [
          { value: "overlay", label: "Overlay Method (Recommended)" },
          { value: "direct", label: "Direct Method" },
          { value: "simple", label: "Simple Method" }
        ]
      },
      defaultValue: "overlay",
      bindable: true,
      hidden: content => !content?.enableEditorInteraction,
      /* wwEditor:start */
      bindingValidation: {
        type: "string",
        tooltip: "Choose the method for editor interaction"
      },
      propertyHelp: "Try different methods if map interaction doesn't work"
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
    }
  },
  triggerEvents: [
    { name: "marker-click", label: "Marker clicked", event: { marker: {}, position: {} } },
    { name: "location-granted", label: "Location permission granted", event: { position: {} } },
    { name: "location-denied", label: "Location permission denied", event: {} },
    { name: "location-marked", label: "Location marked by click", event: { position: {} } },
    { name: "map-ready", label: "Map initialized", event: {} }
  ]
};
