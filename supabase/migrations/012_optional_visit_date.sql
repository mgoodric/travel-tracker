-- Make visit_date optional for visits where the exact date is unknown
ALTER TABLE visits ALTER COLUMN visit_date DROP NOT NULL;
