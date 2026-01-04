-- Script: Load State/Province Boundaries from Natural Earth Data
-- Description: Populates gis.states table with Natural Earth admin-1 boundaries
-- Source: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/
--
-- Usage:
-- 1. Download ne_10m_admin_1_states_provinces.geojson from Natural Earth
-- 2. Run this script in Supabase SQL Editor
-- 3. Or use the provided Node.js script to load data via API

-- Function to load states from GeoJSON
CREATE OR REPLACE FUNCTION gis.load_states_from_geojson(geojson_text TEXT)
RETURNS INTEGER AS $$
DECLARE
  feature RECORD;
  geojson JSONB;
  inserted_count INTEGER := 0;
  country_uuid UUID;
  country_code TEXT;
BEGIN
  geojson := geojson_text::JSONB;

  FOR feature IN
    SELECT * FROM jsonb_array_elements(geojson->'features')
  LOOP
    BEGIN
      -- Get country code from feature properties
      country_code := COALESCE(
        feature.value->'properties'->>'iso_a2',
        feature.value->'properties'->>'ISO_A2',
        feature.value->'properties'->>'admin'
      );

      -- Find matching country
      SELECT id INTO country_uuid
      FROM gis.countries
      WHERE iso_a2 = country_code
         OR name = feature.value->'properties'->>'admin'
      LIMIT 1;

      INSERT INTO gis.states (
        name,
        name_en,
        iso_a2,
        adm1_code,
        admin,
        type,
        type_en,
        country_id,
        geometry,
        geometry_geojson,
        properties
      )
      VALUES (
        COALESCE(
          feature.value->'properties'->>'name',
          feature.value->'properties'->>'NAME',
          'Unknown'
        ),
        COALESCE(
          feature.value->'properties'->>'name_en',
          feature.value->'properties'->>'NAME_EN',
          feature.value->'properties'->>'name'
        ),
        NULLIF(feature.value->'properties'->>'iso_a2', ''),
        COALESCE(
          feature.value->'properties'->>'adm1_code',
          feature.value->'properties'->>'ADM1_CODE',
          feature.value->'properties'->>'code_local'
        ),
        COALESCE(
          feature.value->'properties'->>'admin',
          feature.value->'properties'->>'ADMIN'
        ),
        COALESCE(
          feature.value->'properties'->>'type',
          feature.value->'properties'->>'TYPE'
        ),
        COALESCE(
          feature.value->'properties'->>'type_en',
          feature.value->'properties'->>'TYPE_EN'
        ),
        country_uuid,
        ST_SetSRID(ST_GeomFromGeoJSON(feature.value->>'geometry'), 4326),
        feature.value->>'geometry',
        feature.value->'properties'
      )
      ON CONFLICT DO NOTHING;

      inserted_count := inserted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to insert state: %, Error: %',
        feature.value->'properties'->>'name', SQLERRM;
    END;
  END LOOP;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION gis.load_states_from_geojson(TEXT) TO authenticated;

-- Sample US States data for testing
-- These are simplified boundaries for US states

DO $$
DECLARE
  us_id UUID;
BEGIN
  -- Get US country ID
  SELECT id INTO us_id FROM gis.countries WHERE iso_a2 = 'US' LIMIT 1;

  -- Check if states table is empty
  IF us_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gis.states WHERE country_id = us_id LIMIT 1) THEN

    -- California
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'California', 'California', 'US', 'US-CA', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-124.4 42, -124.4 32.5, -114.1 32.5, -114.1 42, -124.4 42)))'), 4326),
      '{"postal": "CA", "region": "West", "pop_est": 39538223}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- Texas
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'Texas', 'Texas', 'US', 'US-TX', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-106.6 36.5, -106.6 25.8, -93.5 25.8, -93.5 36.5, -106.6 36.5)))'), 4326),
      '{"postal": "TX", "region": "South", "pop_est": 29145505}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- New York
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'New York', 'New York', 'US', 'US-NY', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-79.8 45, -79.8 40.5, -71.9 40.5, -71.9 45, -79.8 45)))'), 4326),
      '{"postal": "NY", "region": "Northeast", "pop_est": 20201249}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- Florida
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'Florida', 'Florida', 'US', 'US-FL', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-87.6 31, -87.6 24.5, -80 24.5, -80 31, -87.6 31)))'), 4326),
      '{"postal": "FL", "region": "South", "pop_est": 21538187}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- Illinois
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'Illinois', 'Illinois', 'US', 'US-IL', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-91.5 42.5, -91.5 37, -87.5 37, -87.5 42.5, -91.5 42.5)))'), 4326),
      '{"postal": "IL", "region": "Midwest", "pop_est": 12812508}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- Pennsylvania
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'Pennsylvania', 'Pennsylvania', 'US', 'US-PA', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-80.5 42, -80.5 39.7, -75 39.7, -75 42, -80.5 42)))'), 4326),
      '{"postal": "PA", "region": "Northeast", "pop_est": 13002700}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- Ohio
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'Ohio', 'Ohio', 'US', 'US-OH', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-84.8 42, -84.8 38.4, -80.5 38.4, -80.5 42, -84.8 42)))'), 4326),
      '{"postal": "OH", "region": "Midwest", "pop_est": 11799448}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- Georgia
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'Georgia', 'Georgia', 'US', 'US-GA', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-85.6 35, -85.6 30.4, -80.8 30.4, -80.8 35, -85.6 35)))'), 4326),
      '{"postal": "GA", "region": "South", "pop_est": 10711908}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- North Carolina
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'North Carolina', 'North Carolina', 'US', 'US-NC', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-84.3 36.6, -84.3 33.8, -75.5 33.8, -75.5 36.6, -84.3 36.6)))'), 4326),
      '{"postal": "NC", "region": "South", "pop_est": 10439388}'::JSONB
    ) ON CONFLICT DO NOTHING;

    -- Michigan
    INSERT INTO gis.states (name, name_en, iso_a2, adm1_code, admin, type, type_en, country_id, geometry, properties)
    VALUES (
      'Michigan', 'Michigan', 'US', 'US-MI', 'United States of America', 'State', 'State', us_id,
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((-90.4 48.2, -90.4 41.7, -82.4 41.7, -82.4 48.2, -90.4 48.2)))'), 4326),
      '{"postal": "MI", "region": "Midwest", "pop_est": 10077331}'::JSONB
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Inserted sample US states for testing';
  ELSE
    IF us_id IS NULL THEN
      RAISE NOTICE 'US country not found - run load_countries.sql first';
    ELSE
      RAISE NOTICE 'States table already has US data, skipping sample insert';
    END IF;
  END IF;
END;
$$;

-- Verify data was loaded
SELECT
  c.name as country,
  COUNT(s.id) as state_count,
  STRING_AGG(s.name, ', ' ORDER BY s.name) as states
FROM gis.countries c
LEFT JOIN gis.states s ON s.country_id = c.id
GROUP BY c.id, c.name
ORDER BY c.name;
