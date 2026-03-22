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

-- Member stats view with UNIONed countries/states/cities from flights and visits
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
    COUNT(DISTINCT dep.id) + COUNT(DISTINCT arr.id) -
      COUNT(DISTINCT CASE WHEN dep.id = arr.id THEN dep.id END) AS unique_airports
  FROM flight_passengers fp
  JOIN flights f ON f.id = fp.flight_id
  JOIN airports dep ON dep.id = f.departure_airport_id
  JOIN airports arr ON arr.id = f.arrival_airport_id
  WHERE fp.family_member_id = fm.id
) flight_stats ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT country) AS unique_countries,
    COUNT(DISTINCT state) AS unique_states,
    COUNT(DISTINCT city) AS unique_cities
  FROM (
    -- Countries/states/cities from flight departure airports
    SELECT dep.iso_country AS country, dep.iso_region AS state, dep.municipality AS city
    FROM flight_passengers fp
    JOIN flights f ON f.id = fp.flight_id
    JOIN airports dep ON dep.id = f.departure_airport_id
    WHERE fp.family_member_id = fm.id
    UNION
    -- Countries/states/cities from flight arrival airports
    SELECT arr.iso_country AS country, arr.iso_region AS state, arr.municipality AS city
    FROM flight_passengers fp
    JOIN flights f ON f.id = fp.flight_id
    JOIN airports arr ON arr.id = f.arrival_airport_id
    WHERE fp.family_member_id = fm.id
    UNION
    -- Countries/states/cities from visits
    SELECT v.country, v.state, v.city
    FROM visit_members vm
    JOIN visits v ON v.id = vm.visit_id
    WHERE vm.family_member_id = fm.id
  ) all_locations
) geo_stats ON true;
