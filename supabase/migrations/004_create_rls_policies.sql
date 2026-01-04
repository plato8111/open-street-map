-- Migration: Create RLS Policies for GIS Schema
-- Description: Enable Row Level Security with public read access

-- Enable RLS on tables
ALTER TABLE gis.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gis.states ENABLE ROW LEVEL SECURITY;

-- Countries: Public read access
DROP POLICY IF EXISTS "Countries are publicly readable" ON gis.countries;
CREATE POLICY "Countries are publicly readable"
  ON gis.countries
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- States: Public read access
DROP POLICY IF EXISTS "States are publicly readable" ON gis.states;
CREATE POLICY "States are publicly readable"
  ON gis.states
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Note: Write access should only be granted to service role or specific admin users
-- The following policies are for admin access if needed:

-- Countries: Authenticated admin write access (optional)
-- Uncomment if you need admin write access
-- DROP POLICY IF EXISTS "Admin can modify countries" ON gis.countries;
-- CREATE POLICY "Admin can modify countries"
--   ON gis.countries
--   FOR ALL
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM auth.users
--       WHERE auth.users.id = auth.uid()
--       AND auth.users.raw_user_meta_data->>'role' = 'admin'
--     )
--   );

-- States: Authenticated admin write access (optional)
-- Uncomment if you need admin write access
-- DROP POLICY IF EXISTS "Admin can modify states" ON gis.states;
-- CREATE POLICY "Admin can modify states"
--   ON gis.states
--   FOR ALL
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM auth.users
--       WHERE auth.users.id = auth.uid()
--       AND auth.users.raw_user_meta_data->>'role' = 'admin'
--     )
--   );
