const PG_INT4_MAX = 2_147_483_647;

const TRUE_AVAILABILITY_TOKENS = new Set([
  "true",
  "1",
  "yes",
  "y",
  "available",
  "متوفر",
  "موجود",
  "نعم",
]);

const FALSE_AVAILABILITY_TOKENS = new Set([
  "false",
  "0",
  "no",
  "n",
  "unavailable",
  "out",
  "غير متوفر",
  "نفد",
  "غير موجود",
  "لا",
]);

/** Convert Arabic-Indic and Extended Arabic-Indic digits to ASCII 0-9. */
export function toWesternDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
}

/** Normalize Arabic/English drug names deterministically for matching and aliases. */
export function normalizeDrugName(raw: string): string {
  return toWesternDigits(raw.trim())
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[-_/,|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse a positive PostgreSQL INT4 SDG price, returning null for decimals, <= 0, or overflow. */
export function parseSdgIntegerPrice(raw: string | number): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 1 && raw <= PG_INT4_MAX ? raw : null;
  }

  // Strip currency tokens longest-first case-insensitively before commas and whitespace.
  const cleaned = toWesternDigits(raw)
    .trim()
    .replace(/جنيه\s+سوداني/gi, "")
    .replace(/ج\.س/gi, "")
    .replace(/جنيه/gi, "")
    .replace(/sdg/gi, "")
    .replace(/ج/gi, "")
    .replace(/[,\s]/g, "");

  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= PG_INT4_MAX
    ? parsed
    : null;
}

/** Parse Arabic/English availability tokens or booleans; empty/undefined defaults to true. */
export function parseAvailability(
  raw: string | boolean | undefined
): boolean | null {
  if (raw === undefined) {
    return true;
  }

  if (typeof raw === "boolean") {
    return raw;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return true;
  }

  const normalized = toWesternDigits(trimmed)
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (TRUE_AVAILABILITY_TOKENS.has(normalized)) {
    return true;
  }

  if (FALSE_AVAILABILITY_TOKENS.has(normalized)) {
    return false;
  }

  return null;
}
