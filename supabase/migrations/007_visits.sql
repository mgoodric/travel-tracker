CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visits_user ON visits (user_id);
CREATE INDEX idx_visits_date ON visits (visit_date DESC);

ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visits"
  ON visits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own visits"
  ON visits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own visits"
  ON visits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own visits"
  ON visits FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE visit_members (
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  PRIMARY KEY (visit_id, family_member_id)
);

ALTER TABLE visit_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members on own visits"
  ON visit_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM visits WHERE visits.id = visit_members.visit_id AND visits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert members on own visits"
  ON visit_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM visits WHERE visits.id = visit_members.visit_id AND visits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update members on own visits"
  ON visit_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM visits WHERE visits.id = visit_members.visit_id AND visits.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete members on own visits"
  ON visit_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM visits WHERE visits.id = visit_members.visit_id AND visits.user_id = auth.uid()
    )
  );
