CREATE TABLE flight_passengers (
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  role passenger_role NOT NULL DEFAULT 'passenger',
  PRIMARY KEY (flight_id, family_member_id)
);

ALTER TABLE flight_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view passengers on own flights"
  ON flight_passengers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flights WHERE flights.id = flight_passengers.flight_id AND flights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert passengers on own flights"
  ON flight_passengers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flights WHERE flights.id = flight_passengers.flight_id AND flights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update passengers on own flights"
  ON flight_passengers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flights WHERE flights.id = flight_passengers.flight_id AND flights.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete passengers on own flights"
  ON flight_passengers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flights WHERE flights.id = flight_passengers.flight_id AND flights.user_id = auth.uid()
    )
  );
