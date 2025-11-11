# Implementation Plan: Adding 4 Missing Features

## Summary
Adding country boundaries, state boundaries, reverse geocoding, and vector tiles to the existing OpenStreetMap WeWeb component while migrating from Options API to Composition API.

## Approach
Given the component's size (1145 lines) and complexity, I'll implement this incrementally:

### Phase 1: Add Features to Existing Options API ✅ RECOMMENDED
- Keep existing Options API structure
- Add new methods for boundaries, geocoding, vector tiles
- Test each feature independently
- **Pros**: Lower risk, faster implementation, easier debugging
- **Cons**: Still using Options API (but functional)

### Phase 2: Full Composition API Migration (Optional)
- Can be done separately after features work
- Migrate gradually (computed → methods → lifecycle)
- **Pros**: Modern Vue 3 patterns, better code organization
- **Cons**: Higher risk of breaking existing functionality

## Implementation Order

### 1. Country Boundaries (PRIORITY 1)
**Files to modify**: `src/wwElement.vue`
**New methods**:
- `loadCountryBoundaries()` - Load from Supabase or vector tiles
- `updateCountryLayer()` - Render countries on map
- `onCountryHover()` - Handle hover events
- `onCountryClick()` - Handle click/selection

**Integration points**:
- Call in `initializeMap()` after map ready
- Watch `content.enableCountryHover` for toggle
- Use `boundaryAPI` from `supabaseClient.js`

### 2. State/Province Boundaries (PRIORITY 2)
**Similar to countries**:
- `loadStateBoundaries()`
- `updateStateLayer()`
- `onStateHover()`, `onStateClick()`

### 3. Reverse Geocoding (PRIORITY 3)
**New methods**:
- `reverseGeocode(lat, lng)` - Call Nominatim API
- Rate limiting using `content.geocodingRateLimit`
- Cache results in `geocodingCache`

**Trigger on**:
- Map clicks
- User location granted
- Location marked

### 4. Vector Tiles (PRIORITY 4)
**New methods**:
- `setupVectorTiles()` - Initialize vector tile layers
- `loadVectorTile(z, x, y)` - Fetch from Supabase MVT functions

**Integration**:
- Use `leaflet.vectorgrid` library
- Use `vectorTileClient` from `vectorTileClient.js`
- Toggle with `content.useVectorTiles`

## Files Structure

```
src/
├── wwElement.vue (MAIN FILE - add all features here)
├── supabaseClient.js (✅ READY - boundary API)
└── vectorTileClient.js (✅ READY - MVT functions)
```

## Testing Checklist
- [ ] Countries load and display
- [ ] Country hover changes color
- [ ] Country click triggers event
- [ ] States load at appropriate zoom
- [ ] State hover/click works
- [ ] Reverse geocoding returns addresses
- [ ] Rate limiting prevents spam
- [ ] Vector tiles improve performance
- [ ] All existing features still work

## Next Step
Implement Phase 1 - add all 4 features to existing Options API component.