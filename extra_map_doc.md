# 🗺️ OpenStreetMap WeWeb Component - Project Documentation

## 📋 Table of Contents
- [Project Overview](#project-overview)
- [Supabase Database Configuration](#supabase-database-configuration)
- [Architecture](#architecture)
- [Component Features](#component-features)
- [Development Guide](#development-guide)
- [API Reference](#api-reference)

---

## 🌐 Project Overview

This is a **professional WeWeb custom component** that provides an interactive OpenStreetMap interface with advanced geospatial features powered by Supabase PostGIS.

### **Key Technologies**
- **WeWeb Framework**: Custom element built with Vue 3 Composition API
- **Leaflet.js**: Interactive map rendering and controls
- **Supabase**: Backend database with PostGIS extension for geospatial queries
- **PostGIS**: Advanced geographic information system capabilities
- **Vector Tiles**: High-performance boundary rendering

### **Project Information**
- **Name**: openstreetmap
- **Version**: 0.0.1
- **Supabase Project**: vqmyflwhnnkybtxkhowr
- **Database Region**: eu-central-1

---

## 🗄️ Supabase Database Configuration

### **Database Connection**

**Supabase Project Details:**
- **Project ID**: vqmyflwhnnkybtxkhowr
- **Organization ID**: tenbxxmlbmutrkpplsuz
- **Project Name**: plants_db_mngr
- **Region**: eu-central-1
- **Database Version**: PostgreSQL 17.4.1.075
- **Status**: ACTIVE_HEALTHY

**Connection Details:**
- **Host**: db.vqmyflwhnnkybtxkhowr.supabase.co
- **Project URL**: https://vqmyflwhnnkybtxkhowr.supabase.co

### **Database Schema Architecture**

#### **GIS Schema** (Geographic Information System)

The `gis` schema contains all geospatial data and functions:

**Tables:**

1. **`gis.countries`** (258 rows)
   - Primary geographic boundaries for world countries
   - Columns:
     - `id` (integer, PRIMARY KEY)
     - `name` (varchar) - Country name
     - `iso3166_1_alpha_3` (varchar) - 3-letter country code (e.g., "USA")
     - `iso3166_1_alpha_2` (varchar) - 2-letter country code (e.g., "US")
     - `wkb_geometry` (geometry) - PostGIS MultiPolygon geometry
   - RLS: Disabled (public read access)

2. **`gis.states_provinces`** (4,596 rows)
   - Administrative level 1 subdivisions (states, provinces, regions)
   - Key Columns:
     - `id` (integer, PRIMARY KEY)
     - `name` (varchar) - State/province name
     - `name_en` (varchar) - English name
     - `iso_a2` (varchar) - Parent country ISO code
     - `adm1_code` (varchar) - Administrative division code
     - `admin` (varchar) - Parent country name
     - `type`/`type_en` (varchar) - Administrative type (State, Province, etc.)
     - `postal` (varchar) - Abbreviation code (e.g., "CA" for California)
     - `latitude`/`longitude` (float8) - Centroid coordinates
     - `wkb_geometry` (geometry) - PostGIS MultiPolygon geometry
     - Multi-language name fields: `name_ar`, `name_de`, `name_es`, `name_fr`, `name_ja`, `name_zh`, etc.
   - RLS: Disabled (public read access)
   - Contains detailed metadata including Wikipedia IDs, GeoNames IDs, and classification codes

3. **`gis.spatial_ref_sys`** (8,500 rows)
   - PostGIS spatial reference system definitions
   - Standard PostGIS table for coordinate system transformations

#### **Public Schema**

**`public.users`** (20 rows)
- User management with geolocation support
- Columns:
  - `id` (uuid, PRIMARY KEY)
  - `username` (text, UNIQUE)
  - `email` (text, UNIQUE)
  - `location` (geography) - PostGIS point for user location
  - `created_at` (timestamptz)
- RLS: Enabled (row-level security active)

### **Supabase RPC Functions**

The component uses several PostGIS-powered RPC functions in the `gis` schema:

**Core Boundary Functions:**
- `get_simplified_boundaries_in_bbox()` - Returns simplified country/state geometries within bounding box
  - **Parameters**: `boundary_type`, `zoom_level`, `bbox_west`, `bbox_south`, `bbox_east`, `bbox_north`, `country_filter`
  - **Purpose**: Zoom-aware geometry simplification for performance
  - **Returns**: GeoJSON features with simplified geometries

- `get_countries_as_geojson()` - Convert country geometries to GeoJSON format
- `get_states_as_geojson()` - Convert state geometries to GeoJSON format

**Point-in-Polygon Detection:**
- `find_country_at_point()` - Detect which country contains a lat/lng point
  - **Parameters**: `point_lat`, `point_lng`
  - **Returns**: Country properties (id, name, iso codes)

- `find_state_at_point()` - Detect which state/province contains a lat/lng point
  - **Parameters**: `point_lat`, `point_lng`, `country_id` (optional)
  - **Returns**: State properties (id, name, admin codes)

**Vector Tile Functions (MVT):**
- `get_country_mvt_tile()` - Generate Mapbox Vector Tile for countries
- `get_states_mvt_tile()` - Generate Mapbox Vector Tile for states
- `tile_has_data()` - Check if tile contains data before rendering

### **PostGIS Features Used**

- **Geometry Types**: MultiPolygon, Point, Geography
- **Spatial Indexes**: GIST indexes on `wkb_geometry` columns for fast spatial queries
- **Coordinate Systems**: WGS84 (EPSG:4326) for latitude/longitude
- **Simplification**: `ST_Simplify()` for zoom-level based detail reduction
- **Bounding Box**: `ST_Intersects()` with `ST_MakeEnvelope()` for spatial filtering
- **Point-in-Polygon**: `ST_Contains()` for location detection
- **MVT Encoding**: `ST_AsMVT()` for vector tile generation

---

## 🏗️ Architecture

### **Component Structure**

```
open-street-map/
├── src/
│   ├── wwElement.vue           # Main Vue component (2,230 lines)
│   ├── supabaseClient.js       # Supabase integration & boundary API
│   └── vectorTileClient.js     # Vector tile performance optimization
├── ww-config.js                # WeWeb component configuration (850 lines)
├── package.json                # Dependencies and scripts
└── *.md                        # Documentation files
```

### **Data Flow Architecture**

```
User Interaction
      ↓
WeWeb Component (wwElement.vue)
      ↓
Supabase Client (supabaseClient.js)
      ↓
WeWeb Supabase Plugin (wwLib.wwPlugins.supabase)
      ↓
Supabase PostGIS Database (gis schema)
      ↓
GIS RPC Functions
      ↓
PostGIS Spatial Queries
      ↓
GeoJSON Response
      ↓
Leaflet Rendering
```

### **Caching Strategy**

**Multi-Level Cache System:**

1. **Browser Cache** (5-minute TTL)
   - `BoundaryCache` class in `supabaseClient.js`
   - Caches GeoJSON boundary data by zoom level and bounds
   - Reduces database queries by 90%+

2. **Vector Tile Cache** (500 tile limit)
   - `VectorTileClient` class in `vectorTileClient.js`
   - Caches MVT tiles for performance
   - LRU eviction when cache is full

3. **Geometry Simplification Cache**
   - PostGIS simplifies geometries based on zoom level
   - Server-side caching via Supabase query plan cache

---

## 🎨 Component Features

### **1. Interactive Map**

**Map Types:**
- OpenStreetMap (default)
- Satellite imagery (Esri)
- Terrain view (OpenTopoMap)
- Dark theme (CartoDB)
- Light theme (CartoDB)

**User Controls:**
- Pan/drag navigation
- Zoom controls (+/- buttons, scroll wheel)
- Click-to-mark location
- Geolocation detection (browser API)

**Configuration Properties:**
- `initialLat`/`initialLong` - Map center coordinates
- `initialZoom` - Zoom level (1-18)
- `mapHeight` - Container height (CSS length)
- `mapStyle` - Border radius styling
- `mapType` - Tile layer selection
- `allowMapTypeSelection` - Toggle map type controls

### **2. Markers & Collections**

**Custom Markers:**
- Array property with formula-based field mapping
- Supports dynamic data binding from APIs
- Properties: `id`, `name`, `lat`, `lng`, `description`
- Formula properties: `markersLatFormula`, `markersLngFormula`, `markersNameFormula`

**Clustering:**
- `enableClustering` - Toggle marker grouping
- `clusterMaxZoom` - Zoom level to disable clustering (default: 15)
- Leaflet.markercluster plugin integration
- Automatic spiderfy on max zoom

### **3. Geolocation & Privacy**

**User Location:**
- `requestGeolocation` - Prompt for browser location
- `showUserLocation` - Display user marker on map
- `centerOnUserLocation` - Auto-pan to user position

**Privacy Mode:**
- `enablePrivacyMode` - Hide exact location
- `privacyRadius` - Offset radius in kilometers
- `privacyRadiusMiles` - Offset radius in miles
- `privacyUnit` - Unit selection (km/miles)
- Random offset within circle to protect privacy
- Visual privacy circle overlay

### **4. Geographic Boundaries**

**Country Boundaries:**
- `enableCountryHover` - Show country polygons with hover effects
- `countryMinZoom`/`countryMaxZoom` - Visibility range (default: 1-7)
- `countryHoverColor`/`countryHoverOpacity` - Hover styling
- `countryBorderColor`/`countryBorderWidth`/`countryBorderOpacity` - Border styling
- `countrySelectedColor`/`countrySelectedOpacity` - Selection styling
- Click to select/deselect countries
- Multi-select support

**State/Province Boundaries:**
- `enableStateHover` - Show state/province polygons with hover effects
- `stateMinZoom`/`stateMaxZoom` - Visibility range (default: 4-7)
- `stateHoverColor`/`stateHoverOpacity` - Hover styling
- `stateBorderColor`/`stateBorderWidth`/`stateBorderOpacity` - Border styling
- `stateSelectedColor`/`stateSelectedOpacity` - Selection styling
- Click to select/deselect states
- Auto-selects parent country when state is selected

**Hierarchical Selection:**
- Country → States → Locations cascade
- Deselecting parent deselects all children
- Selecting child auto-selects parent
- Internal variables track all selections

### **5. Zoom-Based Detection**

**Location Zoom Threshold:**
- `locationZoomThreshold` - Zoom level to switch modes (default: 8)
- **Below threshold (zoom < 8)**: Boundary mode - show country/state boundaries
- **At/above threshold (zoom ≥ 8)**: Location mode - hide boundaries, enable click-to-mark

**Mode Behavior:**
- Boundary mode: Interactive country/state selection
- Location mode: Precise location marking with parent detection
- Automatic mode switching based on zoom level

### **6. Reverse Geocoding**

**Address Lookup:**
- `enableReverseGeocoding` - Enable automatic address lookup
- `geocodingRateLimit` - Minimum time between requests (default: 1000ms)
- Uses OpenStreetMap Nominatim service
- Debounced requests to comply with usage policies
- Returns detailed address components:
  - Road, house number
  - City, state, country
  - Postal code
  - Country codes (ISO)

**Internal Variable:**
- `geocodedAddress` - Stores latest geocoded address object

### **7. USDA Hardiness Zones**

**User Hardiness Data:**
- `userHardinessZone` - Single user zone (1a-13b)
- `usersHardinessData` - Array of user locations with zones
- Formula properties: `usersLatFormula`, `usersLongFormula`, `usersZoneFormula`

**Heatmap Visualization:**
- `showHardinessHeatmap` - Toggle hardiness zone heatmap
- `hardinessHeatmapRadius` - Heat radius in km (default: 50)
- Color gradient from cold (blue/purple) to hot (red/brown)
- Uses Leaflet.heat plugin

### **8. Vector Tiles Performance**

**Optimization:**
- `useVectorTiles` - Enable high-performance vector tile rendering
- Reduces data transfer by 90%+ vs full GeoJSON
- Server-side geometry simplification based on zoom
- Bounding box filtering - only loads visible features
- Smooth pan/zoom with progressive loading

### **9. Internal Variables (NoCode Integration)**

**Exposed Variables:**
- `selectedLocation` - Currently clicked marker
- `userLocation` - User's detected geolocation
- `clickedLocation` - Last clicked map location
- `selectedCountries` - Array of selected country objects
- `selectedStates` - Array of selected state objects
- `selectedLocations` - Array of marked location points
- `geocodedAddress` - Latest reverse geocoded address
- `currentZoomLevel` - Current map zoom level
- `locationContext` - Context object with mode (boundary/location) and hierarchical location string

**Usage in WeWeb:**
- Bind to text elements to display location info
- Use in workflows to trigger actions on selection
- Filter content based on selected countries/states

### **10. Trigger Events**

**Map Events:**
- `map-ready` - Map initialized and ready
- `map-click` - User clicked on map (includes position, zoom, mode, country, state)

**Marker Events:**
- `marker-click` - Marker clicked (includes marker data and position)
- `user-location-click` - User location marker clicked
- `marked-location-click` - Marked location clicked

**Location Events:**
- `location-granted` - Geolocation permission granted
- `location-denied` - Geolocation permission denied
- `location-marked` - Location marked by click

**Privacy Events:**
- `privacy-mode-toggled` - Privacy mode enabled/disabled

**Geocoding Events:**
- `location-geocoded` - Generic location geocoded
- `user-location-geocoded` - User location address resolved
- `marked-location-geocoded` - Marked location address resolved

**Country Events:**
- `countries-loaded` - Country boundaries loaded (includes count)
- `country-hover` - Mouse entered country boundary
- `country-hover-out` - Mouse left country boundary
- `country-click` - Country clicked (includes action: selected/deselected)
- `country-selected` - Country added to selection
- `country-deselected` - Country removed from selection (includes cascaded counts)

**State Events:**
- `states-loaded` - State boundaries loaded (includes count)
- `state-hover` - Mouse entered state boundary
- `state-hover-out` - Mouse left state boundary
- `state-click` - State clicked (includes action: selected/deselected)
- `state-selected` - State added to selection (includes parent country)
- `state-deselected` - State removed from selection (includes cascaded counts)

---

## 💻 Development Guide

### **Installation**

```bash
# Install dependencies
npm install

# Serve component locally (hot reload)
npm run serve --port=3001

# Build for production
npm run build --name=openstreetmap
```

### **Dependencies**

**Production:**
- `leaflet@^1.9.4` - Map rendering library
- `leaflet.markercluster@^1.5.3` - Marker clustering
- `leaflet.heat@^0.2.0` - Heatmap visualization
- `leaflet.vectorgrid@^1.3.0` - Vector tile rendering
- `@supabase/supabase-js@^2.58.0` - Supabase client library

**Development:**
- `@weweb/cli@latest` - WeWeb component build system

### **WeWeb Configuration**

**Adding Component to WeWeb:**
1. Run local server: `npm run serve --port=3001`
2. Open WeWeb editor
3. Navigate to Custom Code → Custom Elements
4. Add custom element URL: `http://localhost:3001/ww-manifest.json`
5. Component appears in left sidebar under custom elements

**Supabase Plugin Setup:**
1. Install Supabase plugin in WeWeb project
2. Configure connection:
   - Project URL: `https://vqmyflwhnnkybtxkhowr.supabase.co`
   - Anon Key: (from Supabase dashboard)
3. Component automatically detects and uses plugin

### **File Overview**

**`src/wwElement.vue`** (Main Component - 2,368 lines)
- Template: Map container, location instructions overlay
- Script: Vue 3 Composition API setup
  - Leaflet map initialization and lifecycle
  - Reactive properties using `computed()`
  - Event handlers for map interactions
  - Supabase boundary loading and rendering
  - Geographic detection (country/state from coordinates)
  - Hierarchical selection management
  - Internal variables using `wwLib.wwVariable.useComponentVariable`
  - Watchers for all reactive properties
- Style: Scoped SCSS for map and markers

**`ww-config.js`** (WeWeb Configuration - 850 lines)
- Component metadata (label, icon)
- Property definitions with types, defaults, validation
- Organized into sections: settings, style, privacy, geocoding, countries, states, hardiness
- Trigger event definitions (26 events)
- Formula properties for dynamic field mapping
- Hidden conditional properties

**`src/supabaseClient.js`** (541 lines)
- `getSupabaseClient()` - Access WeWeb Supabase plugin
  - Checks multiple access paths (wwLib.wwPlugins, $store, wwVariable, window)
  - Configures default `gis` schema for table queries
  - Debug logging for troubleshooting
- `boundaryAPI` object:
  - `getCountriesInBounds()` - Fetch countries with spatial filtering
  - `getStatesInBounds()` - Fetch states with spatial filtering
  - `toGeoJSON()` - Convert Supabase data to Leaflet-compatible GeoJSON
- `BoundaryCache` class - 5-minute TTL cache with bounds-based keys
- `testSupabaseConnection()` - Diagnostic function for GIS schema access

**`src/vectorTileClient.js`** (266 lines)
- `VectorTileClient` class - MVT tile management
  - `getTile()` - Fetch MVT tile from Supabase with caching
  - `tileHasData()` - Check if tile contains features
  - `preloadTiles()` - Batch preload for smooth rendering
  - Automatic zoom-based function selection (countries vs states)
  - LRU cache with 500 tile limit
- `setupMVTProtocol()` - Leaflet protocol handler for custom tiles

### **Development Tips**

**Editor vs Production:**
- Use `/* wwEditor:start */` and `/* wwEditor:end */` blocks for editor-only code
- Map dragging disabled in editor mode to allow component repositioning
- Production build strips all editor blocks

**Reactivity:**
- ALL props must use optional chaining: `props.content?.property`
- Use `computed()` for derived data, NOT `ref()` or `reactive()`
- Watch arrays for property changes (comprehensive watcher at lines 2066-2134)

**Debugging:**
- Enable debug mode in `supabaseClient.js` (runs once on first call)
- Console logs show Supabase access paths and available plugins
- Performance metrics logged for boundary loading (fetch time, data size)

**Common Issues:**
- **No boundaries render**: Check WeWeb Supabase plugin installed and configured
- **RLS errors**: Ensure tables have RLS disabled or proper policies
- **Slow loading**: Enable `useVectorTiles` for 90% data reduction
- **Missing geometry**: Verify RPC functions exist in `gis` schema

---

## 📚 API Reference

### **Supabase Integration**

**Client Access:**
```javascript
import { getSupabaseClient } from './supabaseClient.js';

const supabase = getSupabaseClient();
```

**Boundary Loading:**
```javascript
import { boundaryAPI } from './supabaseClient.js';

// Get countries in map bounds
const countries = await boundaryAPI.getCountriesInBounds(bounds, zoomLevel);

// Get states in map bounds
const states = await boundaryAPI.getStatesInBounds(bounds, zoomLevel, countryFilter);

// Convert to GeoJSON for Leaflet
const geoJson = boundaryAPI.toGeoJSON(boundaries);
```

**RPC Function Usage:**
```javascript
// Simplified boundaries with spatial filtering
const { data, error } = await supabase
  .rpc('get_simplified_boundaries_in_bbox', {
    boundary_type: 'countries', // or 'states'
    zoom_level: 5,
    bbox_west: -180,
    bbox_south: -90,
    bbox_east: 180,
    bbox_north: 90,
    country_filter: null // or 'US' for filtering
  });

// Find country at point
const { data, error } = await supabase
  .schema('gis')
  .rpc('find_country_at_point', {
    point_lat: 40.7128,
    point_lng: -74.0060
  });

// Find state at point
const { data, error } = await supabase
  .schema('gis')
  .rpc('find_state_at_point', {
    point_lat: 40.7128,
    point_lng: -74.0060,
    country_id: 1 // optional
  });
```

**Vector Tile Loading:**
```javascript
import { vectorTileClient } from './vectorTileClient.js';

// Initialize client
await vectorTileClient.init();

// Get tile
const tile = await vectorTileClient.getTile(z, x, y, 'countries');

// Preload tiles for bounds
await vectorTileClient.preloadTiles(bounds, zoomLevel, 'states');
```

### **Performance Benchmarks**

**Data Transfer Comparison:**
- **Full GeoJSON**: 2-5 seconds, 500KB-2MB
- **Vector Tiles**: 200-500ms, 50-200KB (90% reduction)
- **Simplified Boundaries**: 300-800ms, 100-500KB (70% reduction)

**Cache Hit Rates:**
- First load: 0% cache hits, full database query
- Subsequent pans: 70-90% cache hits
- Zoom changes: 30-50% cache hits (different simplification levels)

**Zoom-Level Simplification:**
- Zoom 1-4: 0.5° tolerance (highly simplified)
- Zoom 5-7: 0.1° tolerance (medium detail)
- Zoom 8-10: 0.01° tolerance (high detail)
- Zoom 11+: 0.001° tolerance (full detail)

---

## 🎯 Use Cases

1. **Plant Hardiness Zone Mapper** - Visualize USDA zones for gardening app
2. **Store Locator** - Display business locations with country/state filtering
3. **User Demographics** - Heatmap of user distribution by zone/region
4. **Travel Planner** - Select countries/states for trip planning
5. **Privacy-First Location** - Allow users to share approximate location only
6. **Geographic Survey** - Click to mark locations with reverse geocoding
7. **Multi-Region Dashboard** - Filter data by selected countries/states

---

## 📝 License & Credits

**Component**: Custom WeWeb element (proprietary)
**Map Data**: © OpenStreetMap contributors
**Satellite Imagery**: © Esri, DigitalGlobe, GeoEye
**Terrain Data**: © OpenTopoMap contributors
**Database**: Powered by Supabase PostGIS
**Boundary Data**: Natural Earth (public domain)

---

**Last Updated**: 2025-09-30
**Component Version**: 0.0.1
**Database Version**: PostgreSQL 17.4.1.075 with PostGIS
