# GIS Schema Import Guide

## 🗺️ Complete Guide to Import Your GeoJSON Data to GIS Schema

This guide will help you properly import your `countries.geojson` and `states_provinces.geojson` files into the Supabase GIS schema for optimal performance.

## Step 1: Prerequisites

### Install GDAL
GDAL is required to convert GeoJSON to SQL:

```bash
# macOS
brew install gdal

# Ubuntu/Debian
sudo apt-get install gdal-bin

# Windows
# Download from https://gdal.org/download.html
```

### Verify your files
Make sure you have these files in your project directory:
- `countries.geojson`
- `states_provinces.geojson`

## Step 2: Convert GeoJSON to SQL

Run the conversion script:

```bash
# Make sure you're in your project directory
cd /home/plato/Projects/open-street-map

# Run the conversion script
./convert_geojson_to_sql.sh
```

This will create:
- `gis_import/countries.sql`
- `gis_import/states_provinces.sql`

## Step 3: Create GIS Schema

In your Supabase SQL Editor, run:

```sql
-- Create GIS schema and enable PostGIS
CREATE SCHEMA IF NOT EXISTS "gis";
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "gis";
```

## Step 4: Import Data to Supabase

### Option A: Using psql (Recommended)
```bash
# Get your connection string from Supabase Dashboard
# Replace with your actual connection details

# Import countries
psql "postgresql://postgres:[password]@[host]:5432/postgres" < gis_import/countries.sql

# Import states/provinces
psql "postgresql://postgres:[password]@[host]:5432/postgres" < gis_import/states_provinces.sql
```

### Option B: Using Supabase SQL Editor
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `gis_import/countries.sql` and run
3. Copy contents of `gis_import/states_provinces.sql` and run

## Step 5: Setup GIS Schema

Run the setup script in Supabase SQL Editor:

```bash
# Copy and paste the contents of setup_gis_schema.sql into SQL Editor
```

Or if using psql:
```bash
psql "your-connection-string" < setup_gis_schema.sql
```

## Step 6: Deploy MVT Functions

Deploy the vector tile functions:

```bash
psql "your-connection-string" < mvt_functions_gis.sql
```

Or copy/paste `mvt_functions_gis.sql` into Supabase SQL Editor.

## Step 7: Verify Import

Check that everything worked:

```sql
-- Check table counts
SELECT 'countries' as table_name, COUNT(*) as record_count FROM gis.countries
UNION ALL
SELECT 'states_provinces' as table_name, COUNT(*) as record_count FROM gis.states_provinces;

-- Check sample data
SELECT name, name_en, iso_a2, area_sqkm FROM gis.countries LIMIT 5;
SELECT name, admin, iso_a2, area_sqkm FROM gis.states_provinces LIMIT 5;

-- Test MVT functions
SELECT gis.get_simplified_mvt_tile(1, 0, 0, 'countries') IS NOT NULL as mvt_works;
```

## Step 8: Test Performance

Compare query performance:

```sql
-- Test simplified boundaries function
SELECT COUNT(*) FROM get_simplified_boundaries('countries', 3, NULL);
SELECT COUNT(*) FROM get_simplified_boundaries('states', 6, NULL);

-- Test tile functions
SELECT gis.tile_has_data(5, 10, 12, 'auto') as has_data;
```

## File Structure After Import

```
your-project/
├── gis_import/
│   ├── countries.sql           # Generated SQL for countries
│   └── states_provinces.sql    # Generated SQL for states
├── convert_geojson_to_sql.sh   # Conversion script
├── setup_gis_schema.sql        # GIS schema setup
├── mvt_functions_gis.sql       # Vector tile functions
└── countries.geojson           # Your original data
└── states_provinces.geojson    # Your original data
```

## Supabase Database Structure

After import, your database will have:

```
gis schema:
├── countries               # Country boundaries
├── states_provinces        # State/province boundaries
├── countries_simplified_low # Materialized view for performance
└── Functions:
    ├── get_country_mvt_tile()
    ├── get_states_mvt_tile()
    ├── get_simplified_mvt_tile()
    ├── get_simplified_boundaries()
    └── tile_has_data()
```

## Expected Results

After successful import:
- **Countries**: ~200-250 records (depending on your data)
- **States/Provinces**: ~3000-5000 records (depending on your data)
- **Performance**: 90%+ faster boundary loading with simplified geometries
- **Schema**: All functions and data in gis schema (no public schema wrappers)

## Troubleshooting

### "Permission denied" error
```bash
chmod +x convert_geojson_to_sql.sh
```

### "Command not found: ogr2ogr"
Install GDAL (see Step 1)

### "Function does not exist"
Make sure you ran `mvt_functions_gis.sql` after importing data

### "No data returned"
Check if tables have data:
```sql
SELECT COUNT(*) FROM gis.countries;
SELECT COUNT(*) FROM gis.states_provinces;
```

### Import file too large
For very large files, use psql instead of SQL Editor

## Next Steps

1. ✅ Complete the import following this guide
2. ✅ Update your component to use the new optimized functions
3. ✅ Test performance improvements
4. ✅ Monitor your Supabase usage (should be significantly reduced)

The GIS schema setup provides better organization, security, and performance for your map data!