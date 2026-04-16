import type postgres from "postgres";

export type Source = "foreflight" | "flighty" | "photos";

export interface ParseResult {
  rows: NormalizedRow[];
  dateMin: Date | null;
  dateMax: Date | null;
  skippedBeforeWatermark: number;
  warnings: string[];
}

export interface NormalizedRow {
  /** Source-specific data needed for insertion */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  /** The date used for watermark comparison */
  date: Date;
}

export type RowOutcome = "inserted" | "skipped_dedup" | "skipped_error";

export interface ImportAdapter {
  source: Source;
  parse(filePath: string, watermarkDate: Date | null, options: ImportOptions): Promise<ParseResult>;
  importRow(row: NormalizedRow, sql: postgres.Sql): Promise<RowOutcome>;
}

export interface ImportOptions {
  dryRun: boolean;
  full: boolean;
  verbose: boolean;
  minGapDays: number;
  file?: string;
}

export interface ImportRun {
  id: number;
  source: Source;
  started_at: Date;
  completed_at: Date | null;
  status: string;
  file_path: string | null;
  data_date_min: Date | null;
  data_date_max: Date | null;
  rows_parsed: number;
  rows_inserted: number;
  rows_skipped_dedup: number;
  rows_skipped_error: number;
  watermark_date: Date | null;
  notes: string | null;
}
