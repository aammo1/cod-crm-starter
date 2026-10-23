/** Small RFC 4180 CSV parser/writer. Pure and browser-safe (no Node/DB imports). */

export const CSV_MAX_ROWS = 5000;
export const CSV_MAX_COLUMNS = 50;

export type CsvDelimiter = "," | ";" | "\t";

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Counts candidate delimiters on the first record, ignoring quoted sections. */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of stripBom(text)) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === "\n" || ch === "\r") break;
      if (ch in counts) counts[ch as CsvDelimiter] += 1;
    }
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

export interface ParseCsvOptions {
  delimiter?: CsvDelimiter;
  maxRows?: number;
  maxColumns?: number;
}

export interface ParsedCsv {
  delimiter: CsvDelimiter;
  rows: string[][];
}

/** Parses quoted fields ("" escapes), CRLF/LF/CR; skips fully blank lines. Throws CsvError past the caps. */
export function parseCsv(input: string, options: ParseCsvOptions = {}): ParsedCsv {
  const text = stripBom(input);
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const maxRows = options.maxRows ?? CSV_MAX_ROWS;
  const maxColumns = options.maxColumns ?? CSV_MAX_COLUMNS;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let fieldWasQuotedRow = false;

  const endField = () => {
    row.push(field);
    if (row.length > maxColumns) throw new CsvError("Trop de colonnes dans le fichier CSV.");
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    const blank = row.length === 1 && row[0].trim() === "" && !fieldWasQuotedRow;
    if (!blank) {
      if (rows.length >= maxRows + 1) throw new CsvError(`Trop de lignes (maximum ${maxRows}).`);
      rows.push(row);
    }
    row = [];
    fieldWasQuotedRow = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "" && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
      fieldWasQuotedRow = true;
    } else if (ch === delimiter) endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
    } else field += ch;
  }
  if (inQuotes) throw new CsvError("Guillemet non fermé dans le fichier CSV.");
  if (field !== "" || row.length > 0 || fieldWasQuoted) endRow();
  return { delimiter, rows };
}

/** Neutralizes spreadsheet formula injection; numbers are written verbatim. */
export function escapeCsvCell(value: unknown, delimiter: CsvDelimiter = ","): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsvRow(cells: unknown[], delimiter: CsvDelimiter = ","): string {
  return cells.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter);
}

export function toCsv(rows: unknown[][], delimiter: CsvDelimiter = ","): string {
  return rows.map((row) => toCsvRow(row, delimiter)).join("\r\n") + (rows.length ? "\r\n" : "");
}
