# OpenStreetMap WeWeb Component

A powerful, feature-rich OpenStreetMap component for [WeWeb.io](https://www.weweb.io/) with Supabase PostGIS integration for country/state boundary selection, geolocation, reverse geocoding, and privacy modes.

## Quick Start

Get a basic map running in minutes:

### 1. Add the Component

Add the OpenStreetMap component to your WeWeb page from the component library.

### 2. Minimal Configuration

The component works out of the box with sensible defaults:

| Property | Default | Description |
|----------|---------|-------------|
| `initialLat` | `51.505` | Map center latitude |
| `initialLng` | `-0.09` | Map center longitude |
| `initialZoom` | `13` | Zoom level (1-18) |
| `mapHeight` | `400px` | Map container height |

### 3. First Map Display

Simply drag the component onto your page. It will display an OpenStreetMap centered on London by default. Adjust the `initialLat`, `initialLng`, and `initialZoom` properties to center on your desired location.

### 4. Optional: Enable Features

- **User Location**: Set `requestGeolocation` to `true` to show user's location
- **Markers**: Bind an array to the `markers` property (see Markers section)
- **Boundaries**: Enable `enableCountryHover` and/or `enableStateHover` for boundary selection (requires Supabase setup)

## Features

- Interactive OpenStreetMap with multiple tile layer options (OSM, Satellite, Terrain, Dark, Light)
- Country and state/province boundary selection with hover effects
- Hierarchical selection (selecting a state auto-selects its parent country)
- Location point marking with parent country/state detection
- User geolocation with privacy circle mode
- Reverse geocoding via Nominatim
- Marker clustering support
- Heatmap visualization support (requires bound data source)
- Optimized boundary loading with pre-simplified geometries

## Prerequisites

1. **WeWeb Account** - [Sign up at weweb.io](https://www.weweb.io/)
2. **Supabase Project** - [Create a project at supabase.com](https://supabase.com/)
   - PostGIS extension must be enabled
3. **WeWeb Supabase Plugin** - Must be installed and configured in your WeWeb project

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase Database

#### Enable PostGIS Extension

In your Supabase SQL Editor, run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

#### Run Migrations

Execute the migrations in order from the `supabase/migrations/` folder:

1. **001_create_gis_schema.sql** - Creates the GIS schema and base tables
2. **002_create_rpc_functions.sql** - Creates RPC functions for spatial queries
3. **003_create_mvt_functions.sql** - Creates Mapbox Vector Tile functions
4. **004_add_rls_policies.sql** - Adds Row Level Security policies (read-only public access)
5. **005_add_simplified_geometry.sql** - Adds pre-simplified geometry columns for performance
6. **006_add_input_validation.sql** - Adds input validation to RPC functions

You can run these via:
- Supabase Dashboard SQL Editor
- Supabase CLI: `supabase db push`
- Direct psql connection

#### Load Geographic Data

**Option A: Use Sample Data (for testing)**

Run the scripts in `supabase/scripts/`:

```sql
-- Load sample countries
\i supabase/scripts/load_countries.sql

-- Load sample US states
\i supabase/scripts/load_states.sql
```

**Option B: Load Natural Earth Data (for production)**

1. Download GeoJSON files from [Natural Earth Data](https://www.naturalearthdata.com/):
   - `ne_110m_admin_0_countries.geojson` (countries)
   - `ne_10m_admin_1_states_provinces.geojson` (states/provinces)

2. Use the provided loading functions:

```sql
-- Load countries from GeoJSON file
SELECT gis.load_countries_from_geojson('{"type":"FeatureCollection","features":[...]}');

-- Load states from GeoJSON file
SELECT gis.load_states_from_geojson('{"type":"FeatureCollection","features":[...]}');

-- Generate simplified geometries (run after loading data)
SELECT gis.simplify_country_geometries();
SELECT gis.simplify_state_geometries();
```

### 3. Configure WeWeb Supabase Plugin

In your WeWeb project:

1. Install the Supabase plugin from the WeWeb marketplace
2. Configure it with your Supabase URL and anon key
3. The component will automatically detect and use the Supabase connection

## Local Development

### Serve Locally

```bash
npm run serve --port=8080
```

Then in WeWeb Editor:
1. Open the Developer popup
2. Add your custom element URL (e.g., `http://localhost:8080`)

### Build for Release

```bash
npm run build --name=open-street-map
```

## Configuration Options

### Map Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mapType` | TextSelect | `osm` | Base map style (osm, satellite, terrain, dark, light) |
| `allowMapTypeSelection` | Boolean | `false` | Show map type selector dropdown |
| `initialLat` | Number | `51.505` | Initial map center latitude |
| `initialLng` | Number | `-0.09` | Initial map center longitude |
| `initialZoom` | Number | `13` | Initial zoom level |
| `mapHeight` | Text | `400px` | Map container height |

### Boundary Selection

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enableCountryHover` | Boolean | `false` | Enable country boundary display and interaction |
| `enableStateHover` | Boolean | `false` | Enable state/province boundary display |
| `countryMinZoom` | Number | `1` | Minimum zoom to show countries |
| `countryMaxZoom` | Number | `18` | Maximum zoom to show countries |
| `stateMinZoom` | Number | `4` | Minimum zoom to show states |
| `stateMaxZoom` | Number | `18` | Maximum zoom to show states |
| `useVectorTiles` | Boolean | `false` | Use optimized vector tile loading |

### Styling

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `countryHoverColor` | Color | `#ff0000` | Country hover fill color |
| `countrySelectedColor` | Color | `#0000ff` | Country selected fill color |
| `countryBorderColor` | Color | `#666666` | Country border color |
| `stateHoverColor` | Color | `#ff0000` | State hover fill color |
| `stateSelectedColor` | Color | `#0000ff` | State selected fill color |
| `stateBorderColor` | Color | `#666666` | State border color |

### Markers

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `markers` | Array | `[]` | Array of marker objects with lat, lng, name |
| `markersLatFormula` | Formula | - | Formula to extract latitude from bound marker data |
| `markersLngFormula` | Formula | - | Formula to extract longitude from bound marker data |
| `markersNameFormula` | Formula | - | Formula to extract display name from bound marker data |
| `enableClustering` | Boolean | `true` | Enable marker clustering |
| `clusterMaxZoom` | Number | `15` | Zoom level to disable clustering |

### Heatmap & Hardiness Zones

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `showHardinessHeatmap` | Boolean | `false` | Show USDA hardiness zone heatmap |
| `hardinessHeatmapRadius` | Number | `50` | Heatmap point radius in pixels |
| `users` | Array | `[]` | Array of user data with lat, lng, hardinessZone |
| `usersLatFormula` | Formula | - | Formula to extract latitude from user data |
| `usersLngFormula` | Formula | - | Formula to extract longitude from user data |
| `usersZoneFormula` | Formula | - | Formula to extract hardiness zone from user data |
| `userHardinessZone` | TextSelect | `7a` | Current user's hardiness zone |

### Geolocation & Privacy

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `requestGeolocation` | Boolean | `false` | Request user's location on load |
| `showUserLocation` | Boolean | `true` | Show user location marker |
| `centerOnUserLocation` | Boolean | `false` | Center map on user location when found |
| `enablePrivacyMode` | Boolean | `false` | Show privacy circle instead of exact location |
| `privacyRadius` | Number | `1` | Privacy radius in km |
| `privacyRadiusMiles` | Number | `0.62` | Privacy radius in miles |
| `privacyUnit` | TextSelect | `km` | Privacy radius unit (km or miles) |
| `allowClickToMark` | Boolean | `true` | Allow clicking to mark locations |
| `isOnline` | Boolean | `true` | Whether user is considered "online" (affects marker color) |
| `selectedLocationMarkerColor` | Color | `#FF5722` | Color for marked location markers |

## Internal Variables

These variables are exposed for NoCode workflows:

| Variable | Type | Description |
|----------|------|-------------|
| `mapReady` | Boolean | Whether the map has finished initializing |
| `selectedLocation` | Object | Currently selected marker location |
| `userLocation` | Object | User's geolocation coordinates `{lat, lng}` |
| `clickedLocation` | Object | Last clicked location with parent country/state info |
| `selectedCountries` | Array | Array of selected country data |
| `selectedStates` | Array | Array of selected state data |
| `selectedLocations` | Array | Array of marked locations |
| `selectedCountry` | Object | Single selected country (from click detection) |
| `selectedState` | Object | Single selected state (from click detection) |
| `hoveredCountry` | Object | Currently hovered country data |
| `hoveredState` | Object | Currently hovered state data |
| `geocodedAddress` | Object | Reverse geocoded address data |
| `currentZoomLevel` | Number | Current map zoom level |
| `locationContext` | Object | Hierarchical location context |
| `userHardinessZone` | String | Detected or set hardiness zone |

## Trigger Events

### Map Events
| Event | Description | Event Data |
|-------|-------------|------------|
| `map-ready` | Map has finished initializing | `{}` |
| `map-click` | User clicked on the map | `{coordinates: {lat, lng}}` |
| `map-bounds-change` | Map viewport changed (pan/zoom) | `{bounds, zoom}` |
| `zoom-change` | Map zoom level changed | `{zoom}` |

### Marker Events
| Event | Description | Event Data |
|-------|-------------|------------|
| `marker-click` | User clicked on a marker | `{marker, position: {lat, lng}}` |

### Country Events
| Event | Description | Event Data |
|-------|-------------|------------|
| `country-hover` | Mouse entered a country boundary | `{country, coordinates}` |
| `country-hover-out` | Mouse left a country boundary | `{country}` |
| `country-click` | User clicked a country | `{country, coordinates, action}` |
| `country-selected` | Country was selected | `{country}` |
| `country-deselected` | Country was deselected | `{country}` |
| `countries-loaded` | Country boundaries loaded | `{countriesCount}` |

### State Events
| Event | Description | Event Data |
|-------|-------------|------------|
| `state-hover` | Mouse entered a state boundary | `{state, coordinates}` |
| `state-hover-out` | Mouse left a state boundary | `{state}` |
| `state-click` | User clicked a state | `{state, coordinates, action}` |
| `state-selected` | State was selected | `{state}` |
| `state-deselected` | State was deselected | `{state}` |
| `states-loaded` | State boundaries loaded | `{statesCount}` |

### Location Events
| Event | Description | Event Data |
|-------|-------------|------------|
| `location-granted` | User granted location access | `{position: {lat, lng}}` |
| `location-denied` | User denied location access | `{error}` |
| `location-marked` | User marked a location on map | `{position: {lat, lng}}` |
| `location-geocoded` | Location was reverse geocoded | `{address}` |
| `location-deselected` | Location marker was deselected | `{}` |
| `user-location-click` | User clicked their location marker | `{position, type}` |
| `marked-location-click` | User clicked a marked location | `{position, type}` |

### Error Events
| Event | Description | Event Data |
|-------|-------------|------------|
| `boundary-load-error` | Error loading boundaries | `{error, type}` |
| `geocoding-error` | Error during geocoding | `{error}` |
| `supabase-error` | Supabase connection/query error | `{error}` |

## Element Actions

These methods can be called from NoCode workflows:

| Action | Parameters | Description |
|--------|------------|-------------|
| `setView` | `lat, lng, zoom?` | Center map on coordinates with optional zoom |
| `flyTo` | `lat, lng, zoom?` | Animate map to coordinates |
| `setZoom` | `zoom` | Set map zoom level |
| `geocodeLocation` | `address` | Geocode an address string |
| `clearMarkedLocation` | - | Remove the marked location marker |
| `refreshBoundaries` | - | Reload country/state boundaries |

## Troubleshooting

### "Supabase not configured" Error

- Ensure the WeWeb Supabase plugin is installed and configured
- Check that your Supabase URL and anon key are correct
- Verify the Supabase project is not paused

### "No boundary data found" Error

- Verify migrations have been applied in order
- Check that geographic data has been loaded
- Run the simplification functions after loading data

### Boundaries Not Displaying

1. Check zoom level is within configured min/max range
2. Verify `enableCountryHover` or `enableStateHover` is enabled
3. Check browser console for RPC errors
4. Ensure RLS policies allow read access

### Performance Issues

1. Enable `useVectorTiles` for optimized loading
2. Ensure simplified geometry columns are populated
3. Adjust zoom level thresholds to reduce data at low zooms
4. Check that spatial indexes exist on geometry columns

## Database Schema

### Tables

- `gis.countries` - Country boundaries with ISO codes
- `gis.states` - State/province boundaries with parent country reference

### Key RPC Functions

- `gis.find_country_at_point(lat, lng)` - Find country containing a point
- `gis.find_state_at_point(lat, lng, country_id?)` - Find state containing a point
- `gis.get_simplified_boundaries_in_bbox(...)` - Get optimized boundaries for viewport
- `gis.get_countries_as_geojson()` - Get all countries as GeoJSON
- `gis.get_states_as_geojson(country_code?)` - Get states as GeoJSON

## License

MIT License - See LICENSE file for details.
