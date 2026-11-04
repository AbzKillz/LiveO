-- LiveO schema. Idempotent: safe to run repeatedly.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Local authority boundaries used to clip every bulk load to the configured region.
CREATE TABLE IF NOT EXISTS region_boundary (
  la_code   text PRIMARY KEY,
  name      text NOT NULL,
  geom      geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS region_boundary_geom_idx ON region_boundary USING gist (geom);

-- One row per addressable point. OS Open UPRN is the backbone: every row starts as a
-- point with no text; address text is filled from EPC, Price Paid, or Propalt.
CREATE TABLE IF NOT EXISTS property (
  uprn                 bigint PRIMARY KEY,
  geom                 geometry(Point, 4326) NOT NULL,
  la_code              text,
  postcode             text,
  address              text,
  address_source       text CHECK (address_source IN ('epc', 'price_paid', 'propalt', 'manual')),
  propalt_property_id  bigint,
  udprn                bigint,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_geom_idx ON property USING gist (geom);
CREATE INDEX IF NOT EXISTS property_postcode_idx ON property (postcode);
CREATE INDEX IF NOT EXISTS property_address_trgm_idx ON property USING gin (address gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS property_propalt_idx ON property (propalt_property_id) WHERE propalt_property_id IS NOT NULL;

-- Postcode centroids and admin codes (ONS Postcode Directory, OGL).
CREATE TABLE IF NOT EXISTS postcode (
  postcode   text PRIMARY KEY,
  la_code    text,
  lsoa_code  text,
  geom       geometry(Point, 4326)
);

-- Domestic EPC certificates (DLUHC open data, OGL). Latest certificate per UPRN wins.
CREATE TABLE IF NOT EXISTS epc_certificate (
  lmk_key                  text PRIMARY KEY,
  uprn                     bigint,
  address                  text,
  postcode                 text,
  current_energy_rating    text,
  potential_energy_rating  text,
  current_energy_efficiency int,
  property_type            text,
  built_form               text,
  total_floor_area         numeric,
  construction_age_band    text,
  main_fuel                text,
  mains_gas_flag           text,
  main_heating_description text,
  walls_description        text,
  roof_description         text,
  windows_description      text,
  number_habitable_rooms   int,
  tenure                   text,
  lodgement_date           date,
  local_authority          text
);
CREATE INDEX IF NOT EXISTS epc_uprn_idx ON epc_certificate (uprn, lodgement_date DESC);
CREATE INDEX IF NOT EXISTS epc_postcode_idx ON epc_certificate (postcode);

-- HM Land Registry Price Paid (OGL). No UPRN in the source; matched to property later.
CREATE TABLE IF NOT EXISTS price_paid (
  transaction_id  text PRIMARY KEY,
  price           int NOT NULL,
  date_of_transfer date NOT NULL,
  postcode        text,
  property_type   text,
  new_build       boolean,
  tenure          text,
  paon            text,
  saon            text,
  street          text,
  locality        text,
  town            text,
  district        text,
  uprn            bigint
);
CREATE INDEX IF NOT EXISTS price_paid_postcode_idx ON price_paid (postcode);
CREATE INDEX IF NOT EXISTS price_paid_uprn_idx ON price_paid (uprn, date_of_transfer DESC);

-- HM Land Registry INSPIRE Index Polygons. Licence requires the attribution shown in the UI.
CREATE TABLE IF NOT EXISTS title_polygon (
  inspire_id  bigint PRIMARY KEY,
  la_code     text,
  geom        geometry(MultiPolygon, 4326) NOT NULL,
  area_m2     numeric
);
CREATE INDEX IF NOT EXISTS title_polygon_geom_idx ON title_polygon USING gist (geom);

-- Cache for every paid or rate limited API response, so we never pay twice for the same call.
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key   text PRIMARY KEY,
  source      text NOT NULL,
  payload     jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

-- Every outbound paid call, for cost tracking per user.
CREATE TABLE IF NOT EXISTS api_usage (
  id          bigserial PRIMARY KEY,
  source      text NOT NULL,
  endpoint    text NOT NULL,
  user_email  text,
  cached      boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Material information packs. auto_data is regenerated; agent_inputs is what staff typed.
CREATE TABLE IF NOT EXISTS pack (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uprn          bigint NOT NULL,
  created_by    text NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published')),
  auto_data     jsonb NOT NULL DEFAULT '{}',
  agent_inputs  jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pack_uprn_idx ON pack (uprn);

-- Billing stub: one account per organisation.
CREATE TABLE IF NOT EXISTS account (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  stripe_customer_id  text,
  plan                text NOT NULL DEFAULT 'trial',
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Postcode district (outcode) shapes, derived from ONSPD centroids by scripts/build-districts.sql.
-- Used for the click a district to add it to your filters map.
CREATE TABLE IF NOT EXISTS postcode_district (
  outcode    text PRIMARY KEY,
  la_codes   text[] NOT NULL DEFAULT '{}',
  postcodes  int NOT NULL DEFAULT 0,
  geom       geometry(MultiPolygon, 4326) NOT NULL,
  label_pt   geometry(Point, 4326)
);
CREATE INDEX IF NOT EXISTS postcode_district_geom_idx ON postcode_district USING gist (geom);

-- Saved listing searches, so staff can rerun a filter set in one click.
CREATE TABLE IF NOT EXISTS saved_search (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       text NOT NULL,
  name        text NOT NULL,
  filters     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
