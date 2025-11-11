# Vector Tile Deployment Guide

## 1. Deploy MVT Functions to Supabase

To enable vector tiles in your OpenStreetMap component, you need to deploy the MVT functions to your Supabase database.

### Option A: Using Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db apply mvt_functions.sql
```

### Option B: Using Supabase Dashboard
1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `mvt_functions.sql`
4. Click "Run" to execute the functions

### Option C: Using psql
```bash
# Connect to your database and run
psql "your-database-connection-string" -f mvt_functions.sql
```

## 2. Verify Tables Exist

Make sure your boundary tables are properly set up:

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('countries_import', 'states_provinces_import');

-- Check sample data
SELECT COUNT(*) FROM countries_import;
SELECT COUNT(*) FROM states_provinces_import;
```

## 3. Test MVT Functions

After deployment, test the functions:

```sql
-- Test country MVT tiles
SELECT get_country_mvt_tile(1, 0, 0) IS NOT NULL as country_tile_works;

-- Test state MVT tiles
SELECT get_states_mvt_tile(5, 10, 12) IS NOT NULL as state_tile_works;

-- Test simplified boundaries
SELECT get_simplified_mvt_tile(3, 2, 1, 'countries') IS NOT NULL as simplified_works;

-- Check if tile has data
SELECT tile_has_data(1, 0, 0, 'countries') as has_country_data;
```

## 4. Performance Optimization

The functions include several performance optimizations:

- **Zoom-based simplification**: Higher zoom = more detail
- **Area filtering**: Only show large features at low zoom
- **Spatial indexing**: Optimized geometry queries
- **Tile clipping**: Only return data within tile bounds

## 5. Monitor Performance

Check query performance:

```sql
-- Enable query timing
\timing

-- Test query speed
EXPLAIN ANALYZE SELECT get_simplified_mvt_tile(5, 15, 10, 'auto');

-- Check index usage
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM countries_import
WHERE ST_Intersects(
  ST_Transform(wkb_geometry, 3857),
  ST_TileEnvelope(5, 15, 10)
);
```

## 6. Troubleshooting

### Common Issues:

1. **"Function does not exist"**
   - Check function deployment was successful
   - Verify user permissions with `GRANT EXECUTE` statements

2. **"No data returned"**
   - Check if tables have data: `SELECT COUNT(*) FROM countries_import;`
   - Verify geometry column: `SELECT ST_GeometryType(wkb_geometry) FROM countries_import LIMIT 1;`

3. **Performance issues**
   - Check if indexes exist: `\d countries_import`
   - Run `ANALYZE countries_import;` to update statistics

4. **Empty tiles**
   - Verify coordinate system: Geometries should be in EPSG:4326
   - Check tile envelope calculation

### Debug Queries:

```sql
-- Check table structure
\d countries_import
\d states_provinces_import

-- Verify geometry validity
SELECT
  COUNT(*) as total_rows,
  COUNT(wkb_geometry) as with_geometry,
  COUNT(CASE WHEN ST_IsValid(wkb_geometry) THEN 1 END) as valid_geometry
FROM countries_import;

-- Test specific tile bounds
SELECT ST_AsText(ST_TileEnvelope(1, 0, 0)) as tile_envelope;
```

## 7. WeWeb Component Configuration

After deploying the functions, update your WeWeb component:

1. Enable "Use Vector Tiles (Performance)" in the component settings
2. Test with different zoom levels
3. Monitor browser network tab for reduced data transfer
4. Compare loading times with vector tiles enabled/disabled

## Performance Benefits

With vector tiles enabled, you should see:

- **90%+ reduction** in data transfer size
- **2-5x faster** boundary loading
- **Smooth zoom/pan** without loading delays
- **Automatic simplification** based on zoom level
- **Better browser performance** with less geometry processing

## Next Steps

1. Deploy the functions using one of the methods above
2. Test the functions with the provided SQL queries
3. Enable vector tiles in your WeWeb component
4. Monitor performance improvements
5. Adjust zoom level thresholds if needed in `mvt_functions.sql`