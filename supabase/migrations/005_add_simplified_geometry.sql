-- Migration: Add Pre-Simplified Geometry Columns
-- Description: Adds pre-computed simplified geometry columns for faster rendering at different zoom levels
-- This significantly improves performance by avoiding runtime simplification

-- Add simplified geometry columns to countries
ALTER TABLE gis.countries
ADD COLUMN IF NOT EXISTS geometry_simplified_low GEOMETRY(MultiPolygon, 4326),
ADD COLUMN IF NOT EXISTS geometry_simplified_med GEOMETRY(MultiPolygon, 4326),
ADD COLUMN IF NOT EXISTS geometry_simplified_high GEOMETRY(MultiPolygon, 4326);

-- Add simplified geometry columns to states
ALTER TABLE gis.states
ADD COLUMN IF NOT EXISTS geometry_simplified_low GEOMETRY(MultiPolygon, 4326),
ADD COLUMN IF NOT EXISTS geometry_simplified_med GEOMETRY(MultiPolygon, 4326),
ADD COLUMN IF NOT EXISTS geometry_simplified_high GEOMETRY(MultiPolygon, 4326);

-- Add validation column for geometry validity
ALTER TABLE gis.countries ADD COLUMN IF NOT EXISTS geometry_valid BOOLEAN DEFAULT true;
ALTER TABLE gis.states ADD COLUMN IF NOT EXISTS geometry_valid BOOLEAN DEFAULT true;

-- Create indexes on simplified geometries
CREATE INDEX IF NOT EXISTS idx_countries_geom_low ON gis.countries USING GIST (geometry_simplified_low);
CREATE INDEX IF NOT EXISTS idx_countries_geom_med ON gis.countries USING GIST (geometry_simplified_med);
CREATE INDEX IF NOT EXISTS idx_countries_geom_high ON gis.countries USING GIST (geometry_simplified_high);

CREATE INDEX IF NOT EXISTS idx_states_geom_low ON gis.states USING GIST (geometry_simplified_low);
CREATE INDEX IF NOT EXISTS idx_states_geom_med ON gis.states USING GIST (geometry_simplified_med);
CREATE INDEX IF NOT EXISTS idx_states_geom_high ON gis.states USING GIST (geometry_simplified_high);

-- Function to populate simplified geometries for countries
CREATE OR REPLACE FUNCTION gis.simplify_country_geometries()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  country_record RECORD;
BEGIN
  FOR country_record IN SELECT id, geometry FROM gis.countries WHERE geometry IS NOT NULL
  LOOP
    BEGIN
      UPDATE gis.countries
      SET
        geometry_simplified_low = ST_SimplifyPreserveTopology(geometry, 0.5),   -- zoom 0-2
        geometry_simplified_med = ST_SimplifyPreserveTopology(geometry, 0.05),  -- zoom 3-5
        geometry_simplified_high = ST_SimplifyPreserveTopology(geometry, 0.005), -- zoom 6-8
        geometry_valid = ST_IsValid(geometry)
      WHERE id = country_record.id;

      updated_count := updated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Mark as invalid but don't fail
      UPDATE gis.countries SET geometry_valid = false WHERE id = country_record.id;
      RAISE NOTICE 'Failed to simplify country ID %: %', country_record.id, SQLERRM;
    END;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to populate simplified geometries for states
CREATE OR REPLACE FUNCTION gis.simplify_state_geometries()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  state_record RECORD;
BEGIN
  FOR state_record IN SELECT id, geometry FROM gis.states WHERE geometry IS NOT NULL
  LOOP
    BEGIN
      UPDATE gis.states
      SET
        geometry_simplified_low = ST_SimplifyPreserveTopology(geometry, 0.1),   -- zoom 4-5
        geometry_simplified_med = ST_SimplifyPreserveTopology(geometry, 0.01),  -- zoom 6-7
        geometry_simplified_high = ST_SimplifyPreserveTopology(geometry, 0.001), -- zoom 8+
        geometry_valid = ST_IsValid(geometry)
      WHERE id = state_record.id;

      updated_count := updated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Mark as invalid but don't fail
      UPDATE gis.states SET geometry_valid = false WHERE id = state_record.id;
      RAISE NOTICE 'Failed to simplify state ID %: %', state_record.id, SQLERRM;
    END;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-simplify on insert/update for countries
CREATE OR REPLACE FUNCTION gis.auto_simplify_country()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geometry IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.geometry IS DISTINCT FROM OLD.geometry) THEN
    NEW.geometry_simplified_low := ST_SimplifyPreserveTopology(NEW.geometry, 0.5);
    NEW.geometry_simplified_med := ST_SimplifyPreserveTopology(NEW.geometry, 0.05);
    NEW.geometry_simplified_high := ST_SimplifyPreserveTopology(NEW.geometry, 0.005);
    NEW.geometry_valid := ST_IsValid(NEW.geometry);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If simplification fails, set to null and mark invalid
  NEW.geometry_simplified_low := NULL;
  NEW.geometry_simplified_med := NULL;
  NEW.geometry_simplified_high := NULL;
  NEW.geometry_valid := false;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_simplify_country_trigger ON gis.countries;
CREATE TRIGGER auto_simplify_country_trigger
  BEFORE INSERT OR UPDATE ON gis.countries
  FOR EACH ROW
  EXECUTE FUNCTION gis.auto_simplify_country();

-- Trigger to auto-simplify on insert/update for states
CREATE OR REPLACE FUNCTION gis.auto_simplify_state()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geometry IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.geometry IS DISTINCT FROM OLD.geometry) THEN
    NEW.geometry_simplified_low := ST_SimplifyPreserveTopology(NEW.geometry, 0.1);
    NEW.geometry_simplified_med := ST_SimplifyPreserveTopology(NEW.geometry, 0.01);
    NEW.geometry_simplified_high := ST_SimplifyPreserveTopology(NEW.geometry, 0.001);
    NEW.geometry_valid := ST_IsValid(NEW.geometry);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.geometry_simplified_low := NULL;
  NEW.geometry_simplified_med := NULL;
  NEW.geometry_simplified_high := NULL;
  NEW.geometry_valid := false;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_simplify_state_trigger ON gis.states;
CREATE TRIGGER auto_simplify_state_trigger
  BEFORE INSERT OR UPDATE ON gis.states
  FOR EACH ROW
  EXECUTE FUNCTION gis.auto_simplify_state();

-- Updated RPC function that uses pre-simplified geometries
CREATE OR REPLACE FUNCTION gis.get_optimized_boundaries_in_bbox(
  boundary_type TEXT,
  zoom_level INTEGER,
  bbox_west DOUBLE PRECISION,
  bbox_south DOUBLE PRECISION,
  bbox_east DOUBLE PRECISION,
  bbox_north DOUBLE PRECISION,
  country_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_en TEXT,
  geometry_geojson TEXT,
  properties JSONB
) AS $$
DECLARE
  bbox GEOMETRY;
  geom_column TEXT;
BEGIN
  -- Validate inputs
  IF bbox_west IS NULL OR bbox_south IS NULL OR bbox_east IS NULL OR bbox_north IS NULL THEN
    RAISE EXCEPTION 'Bounding box coordinates cannot be null';
  END IF;

  IF bbox_west < -180 OR bbox_west > 180 OR bbox_east < -180 OR bbox_east > 180 THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
  END IF;

  IF bbox_south < -90 OR bbox_south > 90 OR bbox_north < -90 OR bbox_north > 90 THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;

  -- Create bounding box geometry
  bbox := ST_MakeEnvelope(bbox_west, bbox_south, bbox_east, bbox_north, 4326);

  IF boundary_type = 'countries' THEN
    -- Select appropriate simplified geometry based on zoom
    RETURN QUERY
    SELECT
      c.id,
      c.name,
      c.name_en,
      ST_AsGeoJSON(
        CASE
          WHEN zoom_level <= 2 THEN COALESCE(c.geometry_simplified_low, c.geometry)
          WHEN zoom_level <= 5 THEN COALESCE(c.geometry_simplified_med, c.geometry)
          WHEN zoom_level <= 8 THEN COALESCE(c.geometry_simplified_high, c.geometry)
          ELSE c.geometry
        END
      )::TEXT as geometry_geojson,
      jsonb_build_object(
        'iso_a2', c.iso_a2,
        'iso_a3', c.iso_a3,
        'iso_n3', c.iso_n3
      ) || COALESCE(c.properties, '{}') as properties
    FROM gis.countries c
    WHERE c.geometry && bbox
    AND ST_Intersects(c.geometry, bbox)
    AND (c.geometry_valid IS NULL OR c.geometry_valid = true);

  ELSIF boundary_type = 'states' THEN
    RETURN QUERY
    SELECT
      s.id,
      s.name,
      s.name_en,
      ST_AsGeoJSON(
        CASE
          WHEN zoom_level <= 5 THEN COALESCE(s.geometry_simplified_low, s.geometry)
          WHEN zoom_level <= 7 THEN COALESCE(s.geometry_simplified_med, s.geometry)
          ELSE COALESCE(s.geometry_simplified_high, s.geometry)
        END
      )::TEXT as geometry_geojson,
      jsonb_build_object(
        'iso_a2', s.iso_a2,
        'adm1_code', s.adm1_code,
        'admin', s.admin,
        'type', s.type,
        'type_en', s.type_en,
        'country_id', s.country_id
      ) || COALESCE(s.properties, '{}') as properties
    FROM gis.states s
    LEFT JOIN gis.countries c ON s.country_id = c.id
    WHERE s.geometry && bbox
    AND ST_Intersects(s.geometry, bbox)
    AND (s.geometry_valid IS NULL OR s.geometry_valid = true)
    AND (country_filter IS NULL OR c.iso_a2 = country_filter OR c.iso_a3 = country_filter);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION gis.simplify_country_geometries() TO authenticated;
GRANT EXECUTE ON FUNCTION gis.simplify_state_geometries() TO authenticated;
GRANT EXECUTE ON FUNCTION gis.get_optimized_boundaries_in_bbox(TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO anon, authenticated;

-- Run simplification on existing data
SELECT gis.simplify_country_geometries();
SELECT gis.simplify_state_geometries();
