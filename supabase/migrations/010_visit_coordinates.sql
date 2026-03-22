-- Add latitude/longitude to visits for map display
ALTER TABLE visits ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS longitude double precision;
