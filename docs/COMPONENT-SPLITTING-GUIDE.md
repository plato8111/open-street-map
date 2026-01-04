# Component Splitting Guide for WeWeb

## Why Split Large Components?

Large, monolithic components become:
- ❌ Hard to maintain and debug
- ❌ Difficult to test independently
- ❌ Inflexible and non-reusable
- ❌ Performance bottlenecks
- ❌ Overwhelming for users (too many properties)

**Splitting into smaller components provides:**
- ✅ Clear separation of concerns
- ✅ Easier maintenance and debugging
- ✅ Better performance
- ✅ Reusability
- ✅ Cleaner user experience

---

## Real-World Example: USDA Hardiness Zone System

This guide is based on the actual split of the USDA Hardiness Zone component.

### Before: Monolithic Approach ❌
```
[USDA Hardiness Zone Component]
├── Map display
├── Location input/geolocation
├── Supabase connection
├── NOAA API calls
├── Weather calculations
├── Data processing
├── Dashboard UI
├── Card displays
└── 69+ properties (overwhelming!)
```

### After: Separated Architecture ✅
```
[External Map Component]
     ↓ (provides lat/lng)

[USDA HZ Finder Component]
     ↓ (calculates zone data)
     ↓ (exposes 18 outputs)

[USDA HZ Dashboard Component]
     ↓ (displays beautiful UI)
```

---

## The Splitting Process: 7 Steps

### Step 1: Identify Responsibilities

**Analyze your component and list all its responsibilities:**

For our USDA component, we identified:
1. **Data Collection**: Get location from map/geolocation
2. **Data Processing**: Connect to Supabase, query NOAA APIs
3. **Calculation Logic**: Calculate hardiness zones from weather data
4. **Data Transformation**: Convert units, format dates
5. **UI Display**: Show results in dashboard format
6. **User Interaction**: Handle station selection, map clicks

**Rule of Thumb:** If you can describe what your component does using "AND" more than twice, it needs splitting.

Example:
- "My map shows locations AND allows geocoding AND displays overlays AND handles drawing AND manages layers" = TOO MANY responsibilities

---

### Step 2: Draw Clear Boundaries

**Create a separation matrix:**

| Responsibility | Business Logic? | Display Logic? | Split To |
|---------------|----------------|----------------|----------|
| Location input | ✅ Yes | ❌ No | Finder (logic) |
| API calls | ✅ Yes | ❌ No | Finder (logic) |
| Calculations | ✅ Yes | ❌ No | Finder (logic) |
| Dashboard cards | ❌ No | ✅ Yes | Dashboard (UI) |
| Styling/themes | ❌ No | ✅ Yes | Dashboard (UI) |
| Card visibility | ❌ No | ✅ Yes | Dashboard (UI) |

**The Golden Rule:**
- **Logic Component** = Data fetching, processing, calculations, state management
- **Display Component** = UI rendering, styling, layout, user interactions

---

### Step 3: Define the Data Contract

**Create a clear interface between components:**

```javascript
// USDA HZ Finder Component (Data Provider)
// OUTPUTS (Internal Variables):
{
  // Location
  currentLocation: { lat: number, lng: number },

  // Calculated Results
  calculatedZone: string,              // "7a", "8b", etc.
  minTemperature: number,              // -17.8
  minTemperatureConverted: string,     // "0°F"
  temperatureUnitLabel: string,        // "°F" or "°C"

  // Station Data
  availableStations: Array,            // Raw station data
  availableStationsConverted: Array,   // With converted units
  distanceUnitLabel: string,           // "km" or "mi"
  selectedStation: Object,

  // Additional Data
  frostDates: Object,
  calendarEvents: Array,
  moistureZone: Object,
  extremeWeather: Array,
  analysisResult: Object,

  // State
  status: string,                      // "idle" | "loading" | "success" | "error"
  isLoading: boolean,
  errorMessage: string,
  errorSuggestions: Array
}

// USDA HZ Dashboard Component (Display)
// INPUTS (Bindable Properties):
// - All the same properties from Finder
// - Plus display-specific properties:
{
  theme: string,
  accentColor: string,
  backgroundColor: string,
  showLocationCard: boolean,
  showZoneCard: boolean,
  // ... other display options
}
```

**Key Principle:** The data contract is the bridge between components.

---

### Step 4: Split Component Files

#### For the Logic Component:

**ww-config.js Structure:**
```javascript
export default {
  editor: {
    label: { en: "USDA HZ Finder" },  // Logic component
    icon: "fontawesome/solid/search",
  },
  properties: {
    // INPUT PROPERTIES (Configuration)
    supabaseUrl: { type: "Text", ... },
    supabaseAnonKey: { type: "Text", ... },
    temperatureUnit: { type: "TextSelect", ... },
    searchRadius: { type: "Number", ... },
    // ... all configuration options
  },
  actions: [
    { name: "calculateZone", ... },
    { name: "selectStation", ... },
  ],
  triggerEvents: [
    { name: "zone-calculated", ... },
    { name: "calculation-error", ... },
  ],
}
```

**wwElement.vue Structure:**
```vue
<template>
  <!-- Minimal UI: maybe a status indicator -->
  <div class="finder-status">
    <span v-if="isLoading">🔄 Calculating...</span>
    <span v-else-if="calculatedZone">✅ Zone: {{ calculatedZone }}</span>
  </div>
</template>

<script>
export default {
  setup(props) {
    // 1. Configuration from props
    const supabaseUrl = computed(() => props.content?.supabaseUrl)

    // 2. Internal state
    const isLoading = ref(false)
    const calculatedZone = ref(null)

    // 3. Business logic
    async function calculateZone(lat, lng) {
      isLoading.value = true
      // API calls, calculations...
      calculatedZone.value = result
      isLoading.value = false
    }

    // 4. Expose internal variables (CRITICAL!)
    const { value: zoneValue, setValue: setZone } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: 'calculatedZone',
        type: 'string',
        defaultValue: '',
      })

    // Sync internal state to exposed variable
    watch(calculatedZone, (newVal) => setZone(newVal))

    return {
      // Expose for actions
      calculateZone,
      // Expose state
      isLoading,
      calculatedZone,
    }
  }
}
</script>

<style scoped>
/* Minimal styling - this is not a display component */
</style>
```

#### For the Display Component:

**ww-config.js Structure:**
```javascript
export default {
  editor: {
    label: { en: "USDA HZ Dashboard" },  // Display component
    icon: "fontawesome/solid/chart-area",
  },
  properties: {
    // DATA INPUTS (from Finder - all bindable)
    currentLocation: {
      type: "Object",
      bindable: true,
      /* wwEditor:start */
      propertyHelp: "Bind to [Finder].currentLocation"
      /* wwEditor:end */
    },
    calculatedZone: {
      type: "Text",
      bindable: true,
      /* wwEditor:start */
      propertyHelp: "Bind to [Finder].calculatedZone"
      /* wwEditor:end */
    },
    // ... all other data properties

    // DISPLAY PROPERTIES (user-configurable)
    theme: { type: "TextSelect", ... },
    accentColor: { type: "Color", ... },
    showZoneCard: { type: "OnOff", ... },
    // ... all display options
  },
  triggerEvents: [
    { name: "station-clicked", ... },  // UI interactions only
  ],
}
```

**wwElement.vue Structure:**
```vue
<template>
  <!-- Rich UI with all display logic -->
  <div class="dashboard" :style="dynamicStyles">
    <!-- Setup helper (editor only) -->
    <div v-if="isEditing && !hasData" class="setup-helper">
      💡 Bind this Dashboard to your Finder component
    </div>

    <!-- Display all the data -->
    <div v-if="hasData">
      <div v-if="showZoneCard" class="zone-card">
        <h2>{{ calculatedZone }}</h2>
      </div>
      <!-- ... more cards -->
    </div>
  </div>
</template>

<script>
export default {
  setup(props) {
    // 1. Receive data from Finder (via bindings)
    const calculatedZone = computed(() => props.content?.calculatedZone)
    const currentLocation = computed(() => props.content?.currentLocation)

    // 2. Display settings
    const theme = computed(() => props.content?.theme || 'light')
    const showZoneCard = computed(() => props.content?.showZoneCard ?? true)

    // 3. Display logic only
    const hasData = computed(() => !!calculatedZone.value)
    const dynamicStyles = computed(() => ({
      '--theme': theme.value,
      // ... CSS variables
    }))

    // NO business logic, NO API calls, NO calculations

    return {
      calculatedZone,
      hasData,
      dynamicStyles,
      showZoneCard,
    }
  }
}
</script>

<style scoped>
/* Rich, beautiful styling */
</style>
```

---

### Step 5: Connect Components in WeWeb

**User Setup Flow:**

1. **Add Logic Component:**
   ```
   Add "USDA HZ Finder" to page
   Configure: Supabase URL, API keys, etc.
   ```

2. **Add Display Component:**
   ```
   Add "USDA HZ Dashboard" to page
   ```

3. **Bind Properties:**
   ```
   Dashboard.currentLocation → [Finder].currentLocation
   Dashboard.calculatedZone → [Finder].calculatedZone
   Dashboard.minTemperatureConverted → [Finder].minTemperatureConverted
   ... (continue for all data properties)
   ```

4. **Configure Display:**
   ```
   Dashboard.theme → "dark"
   Dashboard.accentColor → "#3b82f6"
   Dashboard.showLocationCard → true
   ```

**Flow Diagram:**
```
User clicks map
     ↓
Map emits location
     ↓
[Finder] receives location input
     ↓
[Finder] calls APIs
     ↓
[Finder] processes data
     ↓
[Finder] exposes results via internal variables
     ↓
[Dashboard] receives data via bindings (automatic)
     ↓
[Dashboard] renders UI
     ↓
User sees beautiful display
```

---

### Step 6: Handle Common Patterns

#### Pattern 1: User Interactions

**Problem:** User clicks a station in Dashboard. Finder needs to know.

**Solution:** Dashboard emits event → User creates workflow → Finder action triggered

```javascript
// Dashboard (wwElement.vue)
function handleStationClick(station) {
  emit('trigger-event', {
    name: 'station-clicked',
    event: { stationId: station.id }
  })
}

// Dashboard (ww-config.js)
triggerEvents: [
  { name: 'station-clicked', event: { stationId: '' } }
]

// In WeWeb:
// Workflow: ON Dashboard.station-clicked
//           DO Finder.selectStation(event.stationId)
```

#### Pattern 2: Loading States

**Problem:** Dashboard needs to show loading spinner from Finder.

**Solution:** Finder exposes `isLoading` internal variable.

```javascript
// Finder exposes:
const { value: isLoading, setValue: setIsLoading } =
  wwLib.wwVariable.useComponentVariable({
    uid: props.uid,
    name: 'isLoading',
    type: 'boolean',
    defaultValue: false,
  })

// Dashboard receives:
const isLoading = computed(() => props.content?.isLoading || false)

// Dashboard displays:
<div v-if="isLoading" class="loading-spinner">⏳ Loading...</div>
```

#### Pattern 3: Error Handling

**Problem:** Finder has an error. Dashboard needs to display it.

**Solution:** Finder exposes error state + message.

```javascript
// Finder exposes:
errorMessage: string
errorSuggestions: Array<string>

// Dashboard displays:
<div v-if="errorMessage" class="error-box">
  <p>{{ errorMessage }}</p>
  <ul>
    <li v-for="suggestion in errorSuggestions">{{ suggestion }}</li>
  </ul>
</div>
```

---

### Step 7: Document the Architecture

**Create clear documentation** (like the README):

```markdown
# Component System: [Your Feature Name]

## Architecture

This feature uses a **two-component architecture**:

1. **[Name] Finder** - Data logic component
2. **[Name] Dashboard** - Display component

## Why Split?

- Finder handles all business logic and API calls
- Dashboard focuses purely on display
- You can swap Dashboard with custom UI
- You can use Finder data in workflows without UI
- Better performance and maintainability

## Setup Guide

### Step 1: Add Finder
[Configuration instructions]

### Step 2: Add Dashboard
[Binding instructions]

### Step 3: Connect Them
[Full list of bindings]

## Data Flow

[Diagram showing data flow]

## Customization

- To customize data: Configure Finder properties
- To customize display: Configure Dashboard properties
```

---

## Applying This to Your Map Component

### Current Map Component Analysis

**If your map component handles:**
- ✅ Map display and rendering
- ✅ Marker management
- ✅ Geocoding
- ✅ Location search
- ✅ Drawing tools
- ✅ Layer management
- ✅ Data visualization
- ✅ Custom overlays

**That's TOO MANY responsibilities!**

### Recommended Split

#### Option 1: Data vs Display Split

```
[Map Data Provider Component]
- Location search/geocoding
- Data fetching (POIs, boundaries, etc.)
- Coordinate calculations
- Geospatial queries

EXPOSES:
- searchResults: Array
- selectedLocation: Object
- markers: Array
- boundaries: Array

[Map Display Component]
- Map rendering (Leaflet/Mapbox)
- Marker display
- Layer visualization
- User interaction (pan, zoom)

RECEIVES:
- markers from Data Provider
- boundaries from Data Provider
- Configuration (theme, zoom, center)
```

#### Option 2: Feature-Based Split

```
[Core Map Component]
- Basic map display
- Pan/zoom
- Click events

EXPOSES:
- clickedLocation: { lat, lng }
- currentBounds: Object
- currentZoom: number

[Map Geocoding Component]
- Address search
- Reverse geocoding

EXPOSES:
- searchResults: Array
- selectedAddress: Object

[Map Drawing Component]
- Drawing tools
- Shape editing

EXPOSES:
- drawnShapes: Array
- selectedShape: Object

[Map Layers Component]
- Layer management
- Layer styling

EXPOSES:
- activeLayers: Array
- layerData: Object
```

#### Option 3: Hybrid Approach (Recommended)

```
[Map Core Component] (Minimal)
- Map rendering only
- Basic interactions
- Emits: map-click, map-move
- Exposes: clickedLocation, mapBounds, zoom

[Map Data Manager Component]
- Geocoding
- POI search
- Data fetching
- Exposes: searchResults, pois, boundaries

[Map Visualizer Component]
- Receives markers/shapes from Data Manager
- Displays them on map
- Styling and theming
- Receives: mapInstance (from Core)

[Map Drawing Tools Component] (Optional)
- Drawing/editing tools
- Exposes: drawnShapes
- Receives: mapInstance (from Core)
```

---

## Decision Matrix: Should I Split?

| Question | Yes = Split | No = Keep Together |
|----------|-------------|-------------------|
| Does component have 30+ properties? | ✅ | ❌ |
| Does it handle data AND display? | ✅ | ❌ |
| Are there 2+ distinct responsibilities? | ✅ | ❌ |
| Would I want to use one part without the other? | ✅ | ❌ |
| Is debugging difficult? | ✅ | ❌ |
| Is the Vue file over 1000 lines? | ✅ | ❌ |
| Do users complain about too many options? | ✅ | ❌ |

**If you answered "Yes" to 3+ questions → SPLIT IT!**

---

## Common Pitfalls to Avoid

### ❌ Pitfall 1: Too Many Components
**Don't split into 20 tiny components. Aim for 2-4 logical pieces.**

Bad:
```
MapRenderer
MapMarkers
MapControls
MapLayers
MapGeocoding
MapDrawing
MapTooltips
MapLegend
MapFilters
... (12 more components)
```

Good:
```
MapCore (rendering + basic interactions)
MapDataProvider (data fetching + processing)
MapVisualizer (display + styling)
```

### ❌ Pitfall 2: Circular Dependencies
**Never make Component A depend on Component B while B depends on A.**

### ❌ Pitfall 3: Tight Coupling
**Components should communicate through clear interfaces only.**

Bad:
```javascript
// Component B directly accesses Component A's internals
const dataFromA = wwLib.getComponent('componentA').internalState.data
```

Good:
```javascript
// Component A exposes data via internal variable
// Component B receives via binding
const dataFromA = computed(() => props.content?.dataFromA)
```

### ❌ Pitfall 4: Non-Functional Features
**Only implement features that actually work. Don't add placeholders for "future" functionality.**

We learned this lesson: The auto-connect feature was removed because it relied on non-existent WeWeb APIs.

### ❌ Pitfall 5: Poor Documentation
**Always document the data contract and setup process clearly.**

---

## Checklist for Splitting Components

### Planning Phase
- [ ] List all responsibilities of current component
- [ ] Identify logical boundaries (data vs display)
- [ ] Define data contract (inputs/outputs)
- [ ] Draw component architecture diagram
- [ ] Plan user setup workflow

### Implementation Phase
- [ ] Create new component directories
- [ ] Split ww-config.js files
  - [ ] Logic component: inputs + actions + outputs
  - [ ] Display component: data inputs + display options
- [ ] Split wwElement.vue files
  - [ ] Logic component: business logic + internal variables
  - [ ] Display component: UI rendering + styling
- [ ] Implement internal variables in logic component
- [ ] Implement binding support in display component
- [ ] Add trigger events for interactions
- [ ] Add editor helper UI in display component

### Testing Phase
- [ ] Test logic component independently
- [ ] Test display component with mock data
- [ ] Test full integration with bindings
- [ ] Test error states
- [ ] Test loading states
- [ ] Verify performance improvement

### Documentation Phase
- [ ] Create README for each component
- [ ] Document data contract
- [ ] Write setup guide with examples
- [ ] Create flow diagram
- [ ] List all properties and their purposes
- [ ] Document common use cases

---

## Real-World Benefits We Experienced

### Before Split (Monolithic):
- 69 properties in one component
- Confusing mix of data and display options
- Difficult to test
- User confusion: "Where do I configure X?"
- 2000+ lines of code in one file

### After Split:
- **Finder**: 43 focused properties (data/logic)
- **Dashboard**: 26 focused properties (display)
- Clear separation: Users know where to configure what
- Easier debugging: Logic bugs vs display bugs clearly separated
- Can use Finder without Dashboard (in workflows)
- Can swap Dashboard with custom UI
- Much better user experience

---

## Conclusion

**Splitting large components is like refactoring code: it takes time upfront but pays dividends forever.**

Key principles:
1. **Separate data from display**
2. **Define clear interfaces**
3. **Use internal variables for outputs**
4. **Use bindings for inputs**
5. **Document everything**
6. **Only implement what works**

When done right, your users will thank you for the clarity, and you'll thank yourself when debugging! 🎉

---

## Additional Resources

- [WeWeb Internal Variables Guide](https://docs.weweb.io/)
- [Component Architecture Best Practices](https://docs.weweb.io/)
- This repository: Real example of a successful split

---

**Questions?**

This guide is based on real experience splitting the USDA Hardiness Zone component. Feel free to use it as a template for your map component or any other large component.

Good luck with your split! 🚀
