# Supabase GIS Schema Setup

This directory contains SQL migrations for setting up the GIS schema required by the OpenStreetMap component.

## Prerequisites

1. **PostGIS Extension**: Must be enabled in your Supabase project
   - Go to Database > Extensions in Supabase Dashboard
   - Enable `postgis` extension

2. **Active Supabase Project**: The project must be running (not paused)

## Migration Files

Run these migrations in order:

| File | Description |
|------|-------------|
| `001_create_gis_schema.sql` | Creates `gis` schema, `countries` and `states` tables with indexes |
| `002_create_rpc_functions.sql` | Creates RPC functions for boundary queries and point detection |
| `003_create_mvt_functions.sql` | Creates MVT (vector tile) generation functions |
| `004_create_rls_policies.sql` | Enables RLS with public read access |

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste each migration file content
4. Run them in order (001 → 002 → 003 → 004)

### Option 2: Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
supabase db push
```

### Option 3: Direct PostgreSQL Connection

```bash
# Connect using psql
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Run each migration
\i supabase/migrations/001_create_gis_schema.sql
\i supabase/migrations/002_create_rpc_functions.sql
\i supabase/migrations/003_create_mvt_functions.sql
\i supabase/migrations/004_create_rls_policies.sql
```

## Loading GIS Data

After applying migrations, you need to populate the tables with geographic data.

### Recommended Data Sources

1. **Natural Earth** (Free, public domain)
   - Download from: https://www.naturalearthdata.com/
   - Countries: `ne_10m_admin_0_countries`
   - States: `ne_10m_admin_1_states_provinces`

2. **GADM** (Free for non-commercial use)
   - Download from: https://gadm.org/data.html

### Example Data Import Script

```sql
-- After downloading Natural Earth data and converting to SQL/GeoJSON:

-- Insert a country example
INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, geometry_geojson, properties)
VALUES (
  'United States',
  'United States of America',
  'US',
  'USA',
  ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [...]}'),
  '{"type": "MultiPolygon", "coordinates": [...]}',
  '{"continent": "North America", "region_un": "Americas"}'
);

-- Insert a state example
INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry)
VALUES (
  'California',
  'California',
  'CA',
  'US-CA',
  'United States of America',
  'State',
  'State',
  (SELECT id FROM gis.countries WHERE iso_a2 = 'US'),
  ST_GeomFromGeoJSON('{"type": "MultiPolygon", "coordinates": [...]}')
);
```

## Verification

After applying migrations, verify the setup:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'gis';

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'gis';

-- Test a function (after loading data)
SELECT * FROM gis.find_country_at_point(40.7128, -74.0060);  -- New York
```

## RPC Functions Reference

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `find_country_at_point` | `point_lat`, `point_lng` | Country row | Find country containing point |
| `find_state_at_point` | `point_lat`, `point_lng`, `country_id?` | State row | Find state containing point |
| `get_simplified_boundaries_in_bbox` | `boundary_type`, `zoom_level`, `bbox_*`, `country_filter?` | Boundary rows | Get boundaries in bounding box |
| `get_countries_as_geojson` | (none) | Country rows with GeoJSON | Get all countries |
| `get_states_as_geojson` | `country_code?` | State rows with GeoJSON | Get states, optionally filtered |
| `tile_has_data` | `table_name`, `z`, `x`, `y` | boolean | Check if tile has features |
| `get_country_mvt_tile` | `z`, `x`, `y` | bytea (MVT) | Generate country vector tile |
| `get_states_mvt_tile` | `z`, `x`, `y` | bytea (MVT) | Generate states vector tile |

## Troubleshooting

### "function does not exist" error
- Ensure migrations were applied in order
- Check that you're using `.schema('gis')` in Supabase client calls

### "permission denied" error
- Check RLS policies are applied (migration 004)
- Ensure the Supabase client is properly authenticated

### PostGIS functions not working
- Verify PostGIS extension is enabled: `SELECT PostGIS_Version();`
- Enable it: `CREATE EXTENSION IF NOT EXISTS postgis;`

### Empty query results
- Ensure data is loaded into tables
- Check coordinate order (PostGIS uses lng, lat - NOT lat, lng)
