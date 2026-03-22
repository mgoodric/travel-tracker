-- New enums for flight metadata
CREATE TYPE seat_type AS ENUM ('window', 'middle', 'aisle');
CREATE TYPE cabin_class AS ENUM ('economy', 'premium_economy', 'business', 'first');
CREATE TYPE flight_reason AS ENUM ('business', 'leisure');

-- Add new columns to flights (all nullable for backwards compatibility)
ALTER TABLE flights
  ADD COLUMN seat TEXT,
  ADD COLUMN seat_type seat_type,
  ADD COLUMN cabin_class cabin_class,
  ADD COLUMN flight_reason flight_reason,
  ADD COLUMN booking_reference TEXT,
  ADD COLUMN departure_terminal TEXT,
  ADD COLUMN departure_gate TEXT,
  ADD COLUMN arrival_terminal TEXT,
  ADD COLUMN arrival_gate TEXT,
  ADD COLUMN scheduled_departure TIMESTAMPTZ,
  ADD COLUMN actual_departure TIMESTAMPTZ,
  ADD COLUMN scheduled_arrival TIMESTAMPTZ,
  ADD COLUMN actual_arrival TIMESTAMPTZ;

-- Drop the different-airports constraint to allow GA local/pattern flights
ALTER TABLE flights DROP CONSTRAINT chk_different_airports;
