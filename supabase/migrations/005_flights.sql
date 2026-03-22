CREATE TABLE flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_commercial_fields CHECK (
    category != 'commercial' OR (airline IS NOT NULL AND flight_number IS NOT NULL)
  ),
  CONSTRAINT chk_different_airports CHECK (
    departure_airport_id != arrival_airport_id
  )
);

CREATE INDEX idx_flights_user ON flights (user_id);
CREATE INDEX idx_flights_departure_date ON flights (departure_date DESC);

ALTER TABLE flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flights"
  ON flights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flights"
  ON flights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flights"
  ON flights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own flights"
  ON flights FOR DELETE
  USING (auth.uid() = user_id);
