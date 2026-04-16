-- Standalone PostgreSQL schema for travel-tracker
-- Consolidated from Supabase migrations 001-012
-- Removes auth.users FK references and RLS policies

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enums
CREATE TYPE flight_category AS ENUM ('commercial', 'general_aviation');
CREATE TYPE passenger_role AS ENUM ('passenger', 'pilot', 'copilot');
CREATE TYPE seat_type AS ENUM ('window', 'middle', 'aisle');
CREATE TYPE cabin_class AS ENUM ('economy', 'premium_economy', 'business', 'first');
CREATE TYPE flight_reason AS ENUM ('business', 'leisure');

-- Airports (public reference data)
CREATE TABLE airports (
  id SERIAL PRIMARY KEY,
  ident TEXT NOT NULL UNIQUE,
  iata_code TEXT,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  elevation_ft INTEGER,
  type TEXT NOT NULL,
  municipality TEXT,
  iso_country TEXT NOT NULL,
  iso_region TEXT NOT NULL,
  search_text TEXT GENERATED ALWAYS AS (
    COALESCE(ident, '') || ' ' ||
    COALESCE(iata_code, '') || ' ' ||
    COALESCE(name, '') || ' ' ||
    COALESCE(municipality, '')
  ) STORED
);

CREATE INDEX idx_airports_search_trgm ON airports USING GIN (search_text gin_trgm_ops);
CREATE INDEX idx_airports_ident ON airports (ident);
CREATE INDEX idx_airports_iata ON airports (iata_code) WHERE iata_code IS NOT NULL;

-- Family members
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_members_user ON family_members (user_id);

-- Flights
CREATE TABLE flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  category flight_category NOT NULL,
  airline TEXT,
  flight_number TEXT,
  aircraft_type TEXT,
  tail_number TEXT,
  departure_airport_id INTEGER NOT NULL REFERENCES airports(id),
  arrival_airport_id INTEGER NOT NULL REFERENCES airports(id),
  departure_date DATE NOT NULL,
  distance_miles INTEGER,
  notes TEXT,
  seat TEXT,
  seat_type seat_type,
  cabin_class cabin_class,
  flight_reason flight_reason,
  booking_reference TEXT,
  departure_terminal TEXT,
  departure_gate TEXT,
  arrival_terminal TEXT,
  arrival_gate TEXT,
  scheduled_departure TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  scheduled_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_commercial_fields CHECK (
    category != 'commercial' OR (airline IS NOT NULL AND flight_number IS NOT NULL)
  )
);

CREATE INDEX idx_flights_user ON flights (user_id);
CREATE INDEX idx_flights_departure_date ON flights (departure_date DESC);

-- Flight passengers (junction table)
CREATE TABLE flight_passengers (
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  role passenger_role NOT NULL DEFAULT 'passenger',
  PRIMARY KEY (flight_id, family_member_id)
);

-- Visits
CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  visit_date DATE,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL,
  notes TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visits_user ON visits (user_id);
CREATE INDEX idx_visits_date ON visits (visit_date DESC);

-- Visit members (junction table)
CREATE TABLE visit_members (
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  PRIMARY KEY (visit_id, family_member_id)
);

-- Haversine distance function
CREATE OR REPLACE FUNCTION haversine_miles(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
) RETURNS INTEGER AS $$
DECLARE
  r CONSTANT DOUBLE PRECISION := 3958.8;
  dlat DOUBLE PRECISION;
  dlon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dlat := RADIANS(lat2 - lat1);
  dlon := RADIANS(lon2 - lon1);
  a := SIN(dlat / 2) * SIN(dlat / 2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dlon / 2) * SIN(dlon / 2);
  c := 2 * ATAN2(SQRT(a), SQRT(1 - a));
  RETURN ROUND(r * c);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Member stats view (from migration 011)
CREATE OR REPLACE VIEW member_stats AS
SELECT
  fm.id AS family_member_id,
  fm.name AS member_name,
  COALESCE(flight_stats.flight_count, 0) AS flight_count,
  COALESCE(flight_stats.total_miles, 0) AS total_miles,
  COALESCE(geo_stats.unique_countries, 0) AS unique_countries,
  COALESCE(geo_stats.unique_states, 0) AS unique_states,
  COALESCE(geo_stats.unique_cities, 0) AS unique_cities,
  COALESCE(flight_stats.unique_airports, 0) AS unique_airports
FROM family_members fm
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT f.id) AS flight_count,
    COALESCE(SUM(f.distance_miles), 0) AS total_miles,
    (SELECT COUNT(DISTINCT airport_id) FROM (
      SELECT f2.departure_airport_id AS airport_id
      FROM flight_passengers fp2
      JOIN flights f2 ON f2.id = fp2.flight_id
      WHERE fp2.family_member_id = fm.id
      UNION
      SELECT f2.arrival_airport_id AS airport_id
      FROM flight_passengers fp2
      JOIN flights f2 ON f2.id = fp2.flight_id
      WHERE fp2.family_member_id = fm.id
    ) all_airports) AS unique_airports
  FROM flight_passengers fp
  JOIN flights f ON f.id = fp.flight_id
  WHERE fp.family_member_id = fm.id
) flight_stats ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT country) AS unique_countries,
    COUNT(DISTINCT state) AS unique_states,
    COUNT(DISTINCT city) AS unique_cities
  FROM (
    SELECT dep.iso_country AS country, dep.iso_region AS state, dep.municipality AS city
    FROM flight_passengers fp
    JOIN flights f ON f.id = fp.flight_id
    JOIN airports dep ON dep.id = f.departure_airport_id
    WHERE fp.family_member_id = fm.id
    UNION
    SELECT arr.iso_country, arr.iso_region, arr.municipality
    FROM flight_passengers fp
    JOIN flights f ON f.id = fp.flight_id
    JOIN airports arr ON arr.id = f.arrival_airport_id
    WHERE fp.family_member_id = fm.id
    UNION
    SELECT v.country, v.state, v.city
    FROM visit_members vm
    JOIN visits v ON v.id = vm.visit_id
    WHERE vm.family_member_id = fm.id
  ) geo
) geo_stats ON true;

-- Import runs (audit log + watermark source for delta imports)
CREATE TABLE import_runs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  file_path TEXT,
  data_date_min DATE,
  data_date_max DATE,
  rows_parsed INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_skipped_dedup INTEGER DEFAULT 0,
  rows_skipped_error INTEGER DEFAULT 0,
  watermark_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_runs_source ON import_runs (source, completed_at DESC);
