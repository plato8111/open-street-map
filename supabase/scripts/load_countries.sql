-- Script: Load Country Boundaries from Natural Earth Data
-- Description: Populates gis.countries table with Natural Earth 110m country boundaries
-- Source: https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/
--
-- Usage:
-- 1. Download ne_110m_admin_0_countries.geojson from Natural Earth
-- 2. Run this script in Supabase SQL Editor
-- 3. Or use the provided Node.js script to load data via API

-- Clear existing data (optional - comment out if you want to append)
-- TRUNCATE gis.countries CASCADE;

-- Function to load countries from GeoJSON
-- This function accepts a GeoJSON FeatureCollection and inserts countries
CREATE OR REPLACE FUNCTION gis.load_countries_from_geojson(geojson_text TEXT)
RETURNS INTEGER AS $$
DECLARE
  feature RECORD;
  geojson JSONB;
  inserted_count INTEGER := 0;
BEGIN
  geojson := geojson_text::JSONB;

  FOR feature IN
    SELECT * FROM jsonb_array_elements(geojson->'features')
  LOOP
    BEGIN
      INSERT INTO gis.countries (
        name,
        name_en,
        iso_a2,
        iso_a3,
        iso_n3,
        geometry,
        geometry_geojson,
        properties
      )
      VALUES (
        COALESCE(feature.value->'properties'->>'NAME', feature.value->'properties'->>'name', 'Unknown'),
        COALESCE(feature.value->'properties'->>'NAME_EN', feature.value->'properties'->>'name_en', feature.value->'properties'->>'NAME'),
        NULLIF(feature.value->'properties'->>'ISO_A2', '-99'),
        NULLIF(feature.value->'properties'->>'ISO_A3', '-99'),
        NULLIF(feature.value->'properties'->>'ISO_N3', '-99'),
        ST_SetSRID(ST_GeomFromGeoJSON(feature.value->>'geometry'), 4326),
        feature.value->>'geometry',
        feature.value->'properties'
      )
      ON CONFLICT DO NOTHING;

      inserted_count := inserted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to insert country: %, Error: %',
        feature.value->'properties'->>'NAME', SQLERRM;
    END;
  END LOOP;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION gis.load_countries_from_geojson(TEXT) TO authenticated;

-- Sample data for testing (minimal world boundaries)
-- This inserts a few major countries for testing purposes
-- Replace with full Natural Earth data for production

DO $$
DECLARE
  sample_geojson TEXT;
BEGIN
  -- Check if countries table is empty
  IF NOT EXISTS (SELECT 1 FROM gis.countries LIMIT 1) THEN
    -- Insert sample countries for testing
    -- These are simplified boundaries for major countries

    -- United States (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'United States of America',
      'United States of America',
      'US',
      'USA',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-125 48, -125 25, -66 25, -66 48, -125 48)))'), 4326),
      '{"continent": "North America", "pop_est": 331002651}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- Canada (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'Canada',
      'Canada',
      'CA',
      'CAN',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-141 83, -141 48, -52 48, -52 83, -141 83)))'), 4326),
      '{"continent": "North America", "pop_est": 37742154}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- Mexico (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'Mexico',
      'Mexico',
      'MX',
      'MEX',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-117 32, -117 14, -86 14, -86 32, -117 32)))'), 4326),
      '{"continent": "North America", "pop_est": 128932753}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- United Kingdom (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'United Kingdom',
      'United Kingdom',
      'GB',
      'GBR',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-8 61, -8 49, 2 49, 2 61, -8 61)))'), 4326),
      '{"continent": "Europe", "pop_est": 67886011}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- France (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'France',
      'France',
      'FR',
      'FRA',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-5 51, -5 42, 10 42, 10 51, -5 51)))'), 4326),
      '{"continent": "Europe", "pop_est": 65273511}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- Germany (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'Germany',
      'Germany',
      'DE',
      'DEU',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((5 55, 5 47, 15 47, 15 55, 5 55)))'), 4326),
      '{"continent": "Europe", "pop_est": 83783942}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- Australia (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'Australia',
      'Australia',
      'AU',
      'AUS',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((113 -10, 113 -44, 154 -44, 154 -10, 113 -10)))'), 4326),
      '{"continent": "Oceania", "pop_est": 25499884}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- Brazil (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'Brazil',
      'Brazil',
      'BR',
      'BRA',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-74 5, -74 -34, -34 -34, -34 5, -74 5)))'), 4326),
      '{"continent": "South America", "pop_est": 212559417}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- China (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'China',
      'China',
      'CN',
      'CHN',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((73 54, 73 18, 135 18, 135 54, 73 54)))'), 4326),
      '{"continent": "Asia", "pop_est": 1439323776}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    -- India (simplified)
    INSERT INTO gis.countries (name, name_en, iso_a2, iso_a3, geometry, properties)
    VALUES (
      'India',
      'India',
      'IN',
      'IND',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((68 35, 68 6, 97 6, 97 35, 68 35)))'), 4326),
      '{"continent": "Asia", "pop_est": 1380004385}'::JSONB
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Inserted sample countries for testing';
  ELSE
    RAISE NOTICE 'Countries table already has data, skipping sample insert';
  END IF;
END;
$$;

-- Verify data was loaded
SELECT COUNT(*) as country_count,
       STRING_AGG(name, ', ' ORDER BY name) as countries
FROM gis.countries;
