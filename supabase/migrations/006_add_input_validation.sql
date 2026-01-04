-- Migration: Add Input Validation to RPC Functions
-- Description: Enhances existing RPC functions with proper input validation and error handling

-- Updated: Find country at point with validation
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
  -- Validate inputs
  IF point_lat IS NULL OR point_lng IS NULL THEN
    RAISE EXCEPTION 'Coordinates cannot be null';
  END IF;

  IF point_lat < -90 OR point_lat > 90 THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90, got: %', point_lat;
  END IF;

  IF point_lng < -180 OR point_lng > 180 THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180, got: %', point_lng;
  END IF;

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

-- Updated: Find state at point with validation
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
  -- Validate inputs
  IF point_lat IS NULL OR point_lng IS NULL THEN
    RAISE EXCEPTION 'Coordinates cannot be null';
  END IF;

  IF point_lat < -90 OR point_lat > 90 THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90, got: %', point_lat;
  END IF;

  IF point_lng < -180 OR point_lng > 180 THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180, got: %', point_lng;
  END IF;

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

-- Updated: Get simplified boundaries with validation
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
  -- Validate boundary type
  IF boundary_type IS NULL OR boundary_type NOT IN ('countries', 'states') THEN
    RAISE EXCEPTION 'boundary_type must be either "countries" or "states", got: %', boundary_type;
  END IF;

  -- Validate zoom level
  IF zoom_level IS NULL THEN
    zoom_level := 5; -- Default zoom level
  ELSIF zoom_level < 0 OR zoom_level > 22 THEN
    RAISE EXCEPTION 'zoom_level must be between 0 and 22, got: %', zoom_level;
  END IF;

  -- Validate bounding box
  IF bbox_west IS NULL OR bbox_south IS NULL OR bbox_east IS NULL OR bbox_north IS NULL THEN
    RAISE EXCEPTION 'Bounding box coordinates cannot be null';
  END IF;

  IF bbox_west < -180 OR bbox_west > 180 OR bbox_east < -180 OR bbox_east > 180 THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
  END IF;

  IF bbox_south < -90 OR bbox_south > 90 OR bbox_north < -90 OR bbox_north > 90 THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;

  IF bbox_south > bbox_north THEN
    RAISE EXCEPTION 'South latitude cannot be greater than north latitude';
  END IF;

  -- Calculate simplification tolerance based on zoom level
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

-- Updated: MVT country tile function with validation
CREATE OR REPLACE FUNCTION gis.get_country_mvt_tile(
  z INTEGER,
  x INTEGER,
  y INTEGER
)
RETURNS BYTEA AS $$
DECLARE
  tile_bbox GEOMETRY;
  mvt BYTEA;
  n DOUBLE PRECISION;
  simplify_tolerance DOUBLE PRECISION;
BEGIN
  -- Validate inputs
  IF z IS NULL OR x IS NULL OR y IS NULL THEN
    RAISE EXCEPTION 'Tile coordinates cannot be null';
  END IF;

  IF z < 0 OR z > 22 THEN
    RAISE EXCEPTION 'Zoom level must be between 0 and 22, got: %', z;
  END IF;

  n := power(2, z);

  IF x < 0 OR x >= n OR y < 0 OR y >= n THEN
    RAISE EXCEPTION 'Tile coordinates out of range for zoom level %', z;
  END IF;

  -- Calculate tile bounds
  tile_bbox := ST_MakeEnvelope(
    (x / n) * 360.0 - 180.0,
    degrees(atan(sinh(pi() * (1 - 2 * (y + 1) / n)))),
    ((x + 1) / n) * 360.0 - 180.0,
    degrees(atan(sinh(pi() * (1 - 2 * y / n)))),
    4326
  );

  -- Simplification based on zoom
  simplify_tolerance := CASE
    WHEN z <= 2 THEN 0.5
    WHEN z <= 4 THEN 0.1
    WHEN z <= 6 THEN 0.01
    ELSE 0.001
  END;

  SELECT ST_AsMVT(tile, 'countries', 4096, 'geom') INTO mvt
  FROM (
    SELECT
      c.id,
      c.name,
      c.iso_a2,
      c.iso_a3,
      ST_AsMVTGeom(
        ST_SimplifyPreserveTopology(
          ST_Intersection(c.geometry, tile_bbox),
          simplify_tolerance
        ),
        tile_bbox,
        4096,
        256,
        true
      ) as geom
    FROM gis.countries c
    WHERE c.geometry && tile_bbox
    AND ST_Intersects(c.geometry, tile_bbox)
  ) as tile
  WHERE tile.geom IS NOT NULL;

  RETURN COALESCE(mvt, ''::BYTEA);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Updated: MVT states tile function with validation
CREATE OR REPLACE FUNCTION gis.get_states_mvt_tile(
  z INTEGER,
  x INTEGER,
  y INTEGER
)
RETURNS BYTEA AS $$
DECLARE
  tile_bbox GEOMETRY;
  mvt BYTEA;
  n DOUBLE PRECISION;
  simplify_tolerance DOUBLE PRECISION;
BEGIN
  -- Validate inputs
  IF z IS NULL OR x IS NULL OR y IS NULL THEN
    RAISE EXCEPTION 'Tile coordinates cannot be null';
  END IF;

  IF z < 0 OR z > 22 THEN
    RAISE EXCEPTION 'Zoom level must be between 0 and 22, got: %', z;
  END IF;

  n := power(2, z);

  IF x < 0 OR x >= n OR y < 0 OR y >= n THEN
    RAISE EXCEPTION 'Tile coordinates out of range for zoom level %', z;
  END IF;

  -- Calculate tile bounds
  tile_bbox := ST_MakeEnvelope(
    (x / n) * 360.0 - 180.0,
    degrees(atan(sinh(pi() * (1 - 2 * (y + 1) / n)))),
    ((x + 1) / n) * 360.0 - 180.0,
    degrees(atan(sinh(pi() * (1 - 2 * y / n)))),
    4326
  );

  -- Simplification based on zoom
  simplify_tolerance := CASE
    WHEN z <= 4 THEN 0.1
    WHEN z <= 6 THEN 0.01
    WHEN z <= 8 THEN 0.001
    ELSE 0.0001
  END;

  SELECT ST_AsMVT(tile, 'states', 4096, 'geom') INTO mvt
  FROM (
    SELECT
      s.id,
      s.name,
      s.name_en,
      s.adm1_code,
      s.admin,
      s.country_id,
      ST_AsMVTGeom(
        ST_SimplifyPreserveTopology(
          ST_Intersection(s.geometry, tile_bbox),
          simplify_tolerance
        ),
        tile_bbox,
        4096,
        256,
        true
      ) as geom
    FROM gis.states s
    WHERE s.geometry && tile_bbox
    AND ST_Intersects(s.geometry, tile_bbox)
  ) as tile
  WHERE tile.geom IS NOT NULL;

  RETURN COALESCE(mvt, ''::BYTEA);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Updated: Tile has data check with validation
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
BEGIN
  -- Validate inputs
  IF table_name IS NULL OR table_name NOT IN ('countries', 'states') THEN
    RAISE EXCEPTION 'table_name must be either "countries" or "states", got: %', table_name;
  END IF;

  IF z IS NULL OR x IS NULL OR y IS NULL THEN
    RETURN FALSE;
  END IF;

  IF z < 0 OR z > 22 THEN
    RETURN FALSE;
  END IF;

  n := power(2, z);

  IF x < 0 OR x >= n OR y < 0 OR y >= n THEN
    RETURN FALSE;
  END IF;

  -- Calculate tile bounds
  tile_bbox := ST_MakeEnvelope(
    (x / n) * 360.0 - 180.0,
    degrees(atan(sinh(pi() * (1 - 2 * (y + 1) / n)))),
    ((x + 1) / n) * 360.0 - 180.0,
    degrees(atan(sinh(pi() * (1 - 2 * y / n)))),
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
