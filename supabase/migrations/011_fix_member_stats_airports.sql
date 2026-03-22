-- Fix unique_airports count in member_stats view
-- Old formula double-counted airports that appeared as both departure and arrival
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
