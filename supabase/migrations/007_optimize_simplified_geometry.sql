-- Migration: Optimize RPC Functions to Use Pre-Simplified Geometry
-- Description: Updates boundary functions to use pre-computed simplified geometry columns
-- for significantly better performance instead of runtime simplification.
-- Depends on: 005_add_simplified_geometry.sql (geometry columns must exist)

-- Updated: Get simplified boundaries using pre-computed geometry columns
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

  -- Create bounding box geometry
  bbox := ST_MakeEnvelope(bbox_west, bbox_south, bbox_east, bbox_north, 4326);

  IF boundary_type = 'countries' THEN
    RETURN QUERY
    SELECT
      c.id,
      c.name,
      c.name_en,
      -- Use pre-simplified geometry based on zoom level (PERFORMANCE OPTIMIZATION)
      ST_AsGeoJSON(
        ST_Intersection(
          CASE 
            WHEN zoom_level <= 2 AND c.geometry_simplified_low IS NOT NULL THEN c.geometry_simplified_low
            WHEN zoom_level <= 5 AND c.geometry_simplified_med IS NOT NULL THEN c.geometry_simplified_med
            WHEN zoom_level <= 8 AND c.geometry_simplified_high IS NOT NULL THEN c.geometry_simplified_high
            ELSE c.geometry
          END,
          bbox
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
      -- Use pre-simplified geometry based on zoom level (PERFORMANCE OPTIMIZATION)
      ST_AsGeoJSON(
        ST_Intersection(
          CASE 
            WHEN zoom_level <= 4 AND s.geometry_simplified_low IS NOT NULL THEN s.geometry_simplified_low
            WHEN zoom_level <= 6 AND s.geometry_simplified_med IS NOT NULL THEN s.geometry_simplified_med
            WHEN zoom_level <= 8 AND s.geometry_simplified_high IS NOT NULL THEN s.geometry_simplified_high
            ELSE s.geometry
          END,
          bbox
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
    LEFT JOIN gis.countries cnt ON s.country_id = cnt.id
    WHERE s.geometry && bbox
    AND ST_Intersects(s.geometry, bbox)
    AND (country_filter IS NULL OR cnt.iso_a2 = country_filter OR cnt.iso_a3 = country_filter);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Updated: MVT country tile function using pre-simplified geometry
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

  SELECT ST_AsMVT(tile, 'countries', 4096, 'geom') INTO mvt
  FROM (
    SELECT
      c.id,
      c.name,
      c.iso_a2,
      c.iso_a3,
      ST_AsMVTGeom(
        -- Use pre-simplified geometry (PERFORMANCE OPTIMIZATION)
        ST_Intersection(
          CASE 
            WHEN z <= 2 AND c.geometry_simplified_low IS NOT NULL THEN c.geometry_simplified_low
            WHEN z <= 4 AND c.geometry_simplified_med IS NOT NULL THEN c.geometry_simplified_med
            WHEN z <= 6 AND c.geometry_simplified_high IS NOT NULL THEN c.geometry_simplified_high
            ELSE c.geometry
          END,
          tile_bbox
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

-- Updated: MVT states tile function using pre-simplified geometry
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
        -- Use pre-simplified geometry (PERFORMANCE OPTIMIZATION)
        ST_Intersection(
          CASE 
            WHEN z <= 4 AND s.geometry_simplified_low IS NOT NULL THEN s.geometry_simplified_low
            WHEN z <= 6 AND s.geometry_simplified_med IS NOT NULL THEN s.geometry_simplified_med
            WHEN z <= 8 AND s.geometry_simplified_high IS NOT NULL THEN s.geometry_simplified_high
            ELSE s.geometry
          END,
          tile_bbox
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION gis.get_simplified_boundaries_in_bbox(TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.get_country_mvt_tile(INTEGER, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.get_states_mvt_tile(INTEGER, INTEGER, INTEGER) TO anon, authenticated;

-- Add comment documenting the optimization
COMMENT ON FUNCTION gis.get_simplified_boundaries_in_bbox IS 'Returns boundary geometries using pre-computed simplified columns for performance. Falls back to full geometry if simplified columns are null.';
