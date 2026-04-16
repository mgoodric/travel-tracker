-- Import runs: audit log + watermark source for delta imports
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
