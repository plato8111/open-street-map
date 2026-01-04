-- Migration: Create MVT (Mapbox Vector Tile) Functions
-- Description: Functions for generating vector tiles for efficient boundary rendering

-- Function: Get country boundaries as MVT
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
  -- Calculate tile bounds
  n := power(2, z);

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

-- Function: Get state boundaries as MVT
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
  -- Calculate tile bounds
  n := power(2, z);

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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION gis.get_country_mvt_tile(INTEGER, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gis.get_states_mvt_tile(INTEGER, INTEGER, INTEGER) TO anon, authenticated;
