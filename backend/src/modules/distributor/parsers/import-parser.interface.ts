export interface RawImportRow {
  rowNumber: number;
  rawName: string;
  rawPrice: string | number;
  rawAvailable?: string | boolean;
}

export type ImportFormat = "CSV_TEXT" | "JSON_ROWS";

/**
 * Extensible parser strategy interface for catalog bulk imports.
 * Phase 2 AI_PDF parser will plug directly into this exact interface
 * without modifying bulkImportListings.
 */
export interface CatalogImportParser<TInput = unknown> {
  readonly format: ImportFormat;
  parse(input: TInput): RawImportRow[];
}
