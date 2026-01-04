-- Migration: Create GIS Schema with PostGIS Extension
-- Description: Sets up the foundational GIS schema for geographic boundary data
-- Required: PostGIS extension must be enabled in Supabase dashboard first

-- Enable PostGIS extension (run this in Supabase SQL Editor first if not enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create GIS schema
CREATE SCHEMA IF NOT EXISTS gis;

-- Grant usage on schema
GRANT USAGE ON SCHEMA gis TO anon, authenticated;

-- Countries table
CREATE TABLE IF NOT EXISTS gis.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  iso_a2 CHAR(2),
  iso_a3 CHAR(3),
  iso_n3 CHAR(3),
  geometry GEOMETRY(MultiPolygon, 4326),
  geometry_geojson TEXT,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- States/Provinces table
CREATE TABLE IF NOT EXISTS gis.states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  iso_a2 CHAR(2),
  adm1_code TEXT,
  admin TEXT,
  type TEXT,
  type_en TEXT,
  country_id UUID REFERENCES gis.countries(id) ON DELETE CASCADE,
  geometry GEOMETRY(MultiPolygon, 4326),
  geometry_geojson TEXT,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spatial indexes for performance
CREATE INDEX IF NOT EXISTS idx_countries_geometry ON gis.countries USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_states_geometry ON gis.states USING GIST (geometry);

-- Create regular indexes
CREATE INDEX IF NOT EXISTS idx_countries_iso_a2 ON gis.countries(iso_a2);
CREATE INDEX IF NOT EXISTS idx_countries_iso_a3 ON gis.countries(iso_a3);
CREATE INDEX IF NOT EXISTS idx_states_country_id ON gis.states(country_id);
CREATE INDEX IF NOT EXISTS idx_states_adm1_code ON gis.states(adm1_code);

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION gis.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_countries_updated_at ON gis.countries;
CREATE TRIGGER update_countries_updated_at
  BEFORE UPDATE ON gis.countries
  FOR EACH ROW
  EXECUTE FUNCTION gis.update_updated_at_column();

DROP TRIGGER IF EXISTS update_states_updated_at ON gis.states;
CREATE TRIGGER update_states_updated_at
  BEFORE UPDATE ON gis.states
  FOR EACH ROW
  EXECUTE FUNCTION gis.update_updated_at_column();

-- Grant permissions
GRANT SELECT ON gis.countries TO anon, authenticated;
GRANT SELECT ON gis.states TO anon, authenticated;
