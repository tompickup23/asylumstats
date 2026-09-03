import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * RFC 4180 CSV parser — handles quoted fields, escaped quotes, and multi-line values.
 * Returns the raw grid: an array of rows, each an array of cell strings.
 *
 * Use this rather than `parseCsv` when the header is not necessarily the first row.
 * Several government publications put a title on line 1 and the header below it, so a
 * parser that assumes row 0 is the header mis-reads them.
 */
export function parseCsvGrid(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (character === "\r") {
      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Parse CSV text into an array of objects keyed by the header names on the first row.
 */
export function parseCsv(text) {
  const [headerRow = [], ...dataRows] = parseCsvGrid(text);
  const headers = headerRow.map((header) => header.trim());

  return dataRows
    .filter((dataRow) => dataRow.some((value) => String(value).trim().length > 0))
    .map((dataRow) =>
      Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ""]))
    );
}

/**
 * Read a CSV file from disk and return parsed rows.
 */
export function readCsv(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

/**
 * Compute SHA-256 hex digest of a file.
 */
export function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/**
 * Generate a short hash ID from an array of parts.
 */
export function hashId(parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}
