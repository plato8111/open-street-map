-- Migration: Create RPC Functions for GIS Operations
-- Description: PostgreSQL functions for boundary queries and point-in-polygon detection

-- Function: Find country containing a point
CREATE OR REPLACE FUNCTION gis.find_country_at_point(
  point_lat DOUBLE PRECISION,
  point_lng DOUBLE PRECISION
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_en TEXT,
  iso_a2 CHAR(2),
  iso_a3 CHAR(3),
  properties JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.name_en,
    c.iso_a2,
    c.iso_a3,
    c.properties
  FROM gis.countries c
  WHERE ST_Contains(
    c.geometry,
    ST_SetSRID(ST_Point(point_lng, point_lat), 4326)
  )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Find state containing a point
CREATE OR REPLACE FUNCTION gis.find_state_at_point(
  point_lat DOUBLE PRECISION,
  point_lng DOUBLE PRECISION,
  p_country_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_en TEXT,
  iso_a2 CHAR(2),
  adm1_code TEXT,
  admin TEXT,
  country_id UUID,
  properties JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.name_en,
    s.iso_a2,
    s.adm1_code,
    s.admin,
    s.country_id,
    s.properties
  FROM gis.states s
  WHERE ST_Contains(
    s.geometry,
    ST_SetSRID(ST_Point(point_lng, point_lat), 4326)
  )
  AND (p_country_id IS NULL OR s.country_id = p_country_id)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get simplified boundaries within bounding box
CREATE OR REPLACE FUNCTION gis.get_simplified_boundaries_in_bbox(
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
  simplify_tolerance DOUBLE PRECISION;
  bbox GEOMETRY;
BEGIN
  -- Calculate simplification tolerance based on zoom level
  -- Lower zoom = more simplification for performance
  simplify_tolerance := CASE
    WHEN zoom_level <= 2 THEN 0.5
    WHEN zoom_level <= 4 THEN 0.1
    WHEN zoom_level <= 6 THEN 0.01
    WHEN zoom_level <= 8 THEN 0.001
    ELSE 0.0001
  END;

  -- Create bounding box geometry
  bbox := ST_MakeEnvelope(bbox_west, bbox_south, bbox_east, bbox_north, 4326);

  IF boundary_type = 'countries' THEN
    RETURN QUERY
    SELECT
      c.id,
      c.name,
      c.name_en,
      ST_AsGeoJSON(
        ST_SimplifyPreserveTopology(
          ST_Intersection(c.geometry, bbox),
          simplify_tolerance
        )
      )::TEXT as geometry_geojson,
      jsonb_build_object(
        'iso_a2', c.iso_a2,
        'iso_a3', c.iso_a3,
        'iso_n3', c.iso_n3
      ) || COALESCE(c.properties, '{}') as properties
    FROM gis.countries c
    WHERE c.geometry && bbox
    AND ST_Intersects(c.geometry, bbox);

  ELSIF boundary_type = 'states' THEN
    RETURN QUERY
    SELECT
      s.id,
      s.name,
      s.name_en,
      ST_AsGeoJSON(
        ST_SimplifyPreserveTopology(
          ST_Intersection(s.geometry, bbox),
          simplify_tolerance
        )
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
    AND (country_filter IS NULL OR c.iso_a2 = country_filter OR c.iso_a3 = country_filter);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get all countries as GeoJSON (fallback)
CREATE OR REPLACE FUNCTION gis.get_countries_as_geojson()
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_en TEXT,
  iso_a2 CHAR(2),
  iso_a3 CHAR(3),
  geometry_geojson TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.name_en,
    c.iso_a2,
    c.iso_a3,
    COALESCE(c.geometry_geojson, ST_AsGeoJSON(c.geometry)::TEXT) as geometry_geojson
  FROM gis.countries c
  ORDER BY c.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Get states as GeoJSON (fallback)
CREATE OR REPLACE FUNCTION gis.get_states_as_geojson(
  country_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_en TEXT,
  iso_a2 CHAR(2),
  adm1_code TEXT,
  type TEXT,
  type_en TEXT,
  geometry_geojson TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.name_en,
    s.iso_a2,
    s.adm1_code,
    s.type,
    s.type_en,
    COALESCE(s.geometry_geojson, ST_AsGeoJSON(s.geometry)::TEXT) as geometry_geojson
  FROM gis.states s
  LEFT JOIN gis.countries c ON s.country_id = c.id
  WHERE country_code IS NULL
    OR c.iso_a2 = country_code
    OR c.iso_a3 = country_code
  ORDER BY s.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Check if tile has data (for optimization)
CREATE OR REPLACE FUNCTION gis.tile_has_data(
  table_name TEXT,
  z INTEGER,
  x INTEGER,
  y INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  tile_bbox GEOMETRY;
  has_data BOOLEAN;
  n DOUBLE PRECISION;
  lat_rad DOUBLE PRECISION;
BEGIN
  -- Calculate tile bounds
  n := power(2, z);

  -- Calculate bounding box for tile
  tile_bbox := ST_MakeEnvelope(
    (x / n) * 360.0 - 180.0,                              -- west
    degrees(atan(sinh(pi() * (1 - 2 * (y + 1) / n)))),    -- south
    ((x + 1) / n) * 360.0 - 180.0,                        -- east
    degrees(atan(sinh(pi() * (1 - 2 * y / n)))),          -- north
    4326
  );

  IF table_name = 'countries' THEN
    SELECT EXISTS(
      SELECT 1 FROM gis.countries c
      WHERE c.geometry && tile_bbox
      LIMIT 1
    ) INTO has_data;
  ELSIF table_name = 'states' THEN
    SELECT EXISTS(
      SELECT 1 FROM gis.states s
      WHERE s.geometry && tile_bbox
      LIMIT 1
    ) INTO has_data;
  ELSE
    has_data := FALSE;
  END IF;

  RETURN has_data;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION gis.find_country_at_point(DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.find_state_at_point(DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.get_simplified_boundaries_in_bbox(TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.get_countries_as_geojson() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.get_states_as_geojson(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.tile_has_data(TEXT, INTEGER, INTEGER, INTEGER) TO anon, authenticated;
