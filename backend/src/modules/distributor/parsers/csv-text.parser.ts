import { parseSdgIntegerPrice } from "../../../lib/text-normalizer";
import type {
  CatalogImportParser,
  RawImportRow,
} from "./import-parser.interface";

const HEADER_NAME_PATTERN =
  /\b(name|drug|item|product|medication)\b|الاسم|الصنف|الدواء/i;
const HEADER_PRICE_PATTERN = /\b(price|cost|sdg)\b|السعر/i;

function hasUnquotedDelimiter(line: string, delimiter: string): boolean {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === delimiter) {
      return true;
    }
  }
  return false;
}

function detectDelimiter(line: string): string {
  if (line.includes("\t")) {
    return "\t";
  }
  if (hasUnquotedDelimiter(line, ";")) {
    return ";";
  }
  return ",";
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current.trim());
  return cells;
}

function isHeaderRow(cols: string[]): boolean {
  const firstCol = cols[0] ?? "";
  const secondCol = cols[1] ?? "";
  if (parseSdgIntegerPrice(secondCol) !== null) {
    return false;
  }
  return (
    HEADER_NAME_PATTERN.test(firstCol) || HEADER_PRICE_PATTERN.test(secondCol)
  );
}

/** Parses CSV, tab-delimited Excel pastes, and WhatsApp price lists into RawImportRow[]. */
export class CsvTextParser implements CatalogImportParser<string> {
  readonly format = "CSV_TEXT" as const;

  parse(input: string): RawImportRow[] {
    const cleanText = String(input).replace(/^\uFEFF/, "");
    const lines = cleanText.split(/\r?\n/);
    const rows: RawImportRow[] = [];
    let checkedHeader = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) {
        continue;
      }

      const delimiter = detectDelimiter(line);
      const cols = splitDelimitedLine(line, delimiter);

      if (!checkedHeader) {
        checkedHeader = true;
        if (isHeaderRow(cols)) {
          continue;
        }
      }

      const rawAvailable =
        cols.length > 2 && cols[2].length > 0 ? cols[2] : undefined;

      rows.push({
        rowNumber: i + 1,
        rawName: cols[0] ?? "",
        rawPrice: cols[1] ?? "",
        rawAvailable,
      });
    }

    return rows;
  }
}

export const csvTextParser = new CsvTextParser();
