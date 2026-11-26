import type {
  CatalogImportParser,
  RawImportRow,
} from "./import-parser.interface";

export interface JsonImportRowInput {
  rawName: string;
  wholesalePriceSdg: string | number;
  isAvailable?: string | boolean;
}

/** Normalizes structured JSON import rows into RawImportRow[]. */
export class JsonRowsParser
  implements CatalogImportParser<readonly JsonImportRowInput[]>
{
  readonly format = "JSON_ROWS" as const;

  parse(input: readonly JsonImportRowInput[]): RawImportRow[] {
    return input.map((row, index) => ({
      rowNumber: index + 1,
      rawName: row.rawName,
      rawPrice: row.wholesalePriceSdg,
      rawAvailable: row.isAvailable,
    }));
  }
}

export const jsonRowsParser = new JsonRowsParser();
