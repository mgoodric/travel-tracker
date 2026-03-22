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
