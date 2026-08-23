import "server-only";
import { crc32, deflateRawSync } from "node:zlib";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * XLSX
 *
 * A spreadsheet writer, with no dependency.
 *
 * ── Why not a library ────────────────────────────────────────────────────────
 *
 * `xlsx` (SheetJS) stopped publishing maintained versions to npm; `exceljs`
 * costs several megabytes and brings a dependency tree of its own. Both are a
 * large surface to accept for one download button.
 *
 * ── Why not CSV ──────────────────────────────────────────────────────────────
 *
 * Because the data is Mongolian and the file is going into Excel, and CSV loses
 * on both counts. Excel guesses the encoding unless the file opens with a UTF-8
 * byte-order mark, and it splits on the OS list separator rather than on the
 * comma — which on a great many machines outside en-US is a semicolon, so a
 * comma-separated file arrives with every row crammed into one column. A real
 * xlsx has neither ambiguity: the encoding is declared and the cells are cells.
 *
 * ── What it deliberately does not do ─────────────────────────────────────────
 *
 * Inline strings rather than a shared-string table, one bold style for the
 * header, and timestamps written as text in `YYYY-MM-DD HH:mm`. Numbers are
 * written as numbers, so a column of tugriks can be summed. Formulas, merged
 * cells and real date serials are not what an export button is for.
 *
 * Needs Node 22.2+ for `zlib.crc32`; the Dockerfile pins node:22-alpine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Cell = string | number | null | undefined;

export interface Sheet {
  /** Tab name. Excel refuses more than 31 characters and some punctuation. */
  name: string;
  columns: string[];
  rows: Cell[][];
}

/*
 * XML rejects most control characters outright, and one of them anywhere in the
 * file makes the whole workbook refuse to open rather than making one cell
 * wrong. The free-text columns here carry operator memos and bidder names, so
 * this is not hypothetical.
 */
function xmlText(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
      continue;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else out += ch;
  }
  return out;
}

/** 0 → A, 25 → Z, 26 → AA. Excel's column names are bijective base-26. */
function columnName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - rem) / 26);
  }
  return out;
}

/**
 * Excel truncates a tab name past 31 characters, and rejects the punctuation
 * below by failing to open the file rather than by complaining about the name.
 */
const FORBIDDEN_IN_TAB = "[]:*?/";

function sheetName(name: string, fallback: number): string {
  let out = "";
  for (const ch of name) {
    out +=
      FORBIDDEN_IN_TAB.includes(ch) || ch === String.fromCharCode(92)
        ? " "
        : ch;
  }
  out = out.trim().slice(0, 31);
  return out.length > 0 ? out : `Sheet${fallback}`;
}

function cellXml(cell: Cell, ref: string, style: number): string {
  const s = style > 0 ? ` s="${style}"` : "";
  if (cell === null || cell === undefined || cell === "") {
    return `<c r="${ref}"${s}/>`;
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return `<c r="${ref}"${s}><v>${cell}</v></c>`;
  }
  /* xml:space matters — without it Excel strips leading and trailing spaces. */
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(String(cell))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const rows: string[] = [];

  const header = sheet.columns
    .map((label, i) => cellXml(label, `${columnName(i)}1`, 1))
    .join("");
  rows.push(`<row r="1">${header}</row>`);

  sheet.rows.forEach((row, r) => {
    const cells = row
      .map((cell, i) => cellXml(cell, `${columnName(i)}${r + 2}`, 0))
      .join("");
    rows.push(`<row r="${r + 2}">${cells}</row>`);
  });

  /* A width per column, so the operator does not open the file to a row of ###. */
  const cols = sheet.columns
    .map((label, i) => {
      const widest = sheet.rows.reduce(
        (max, row) => Math.max(max, String(row[i] ?? "").length),
        label.length,
      );
      const width = Math.min(60, Math.max(10, widest + 2));
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

/* ── The container ───────────────────────────────────────────────────────── */

interface Entry {
  name: string;
  data: Buffer;
}

/**
 * A ZIP, written by hand. Deflate rather than store, because a ledger export is
 * mostly repeated XML and compresses to a fraction of its size.
 */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const deflated = deflateRawSync(entry.data);
    const sum = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // modified time
    local.writeUInt16LE(0, 12); // modified date
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field
    locals.push(local, name, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + deflated.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment

  return Buffer.concat([...locals, directory, end]);
}

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

/* One bold font for the header row, and nothing else. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

/** Builds a workbook. One tab per sheet, in the order given. */
export function workbook(sheets: Sheet[]): Buffer {
  if (sheets.length === 0) {
    throw new Error("A workbook needs at least one sheet");
  }

  const names = sheets.map((sheet, i) => sheetName(sheet.name, i + 1));

  const tabs = names
    .map(
      (name, i) =>
        `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("");

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tabs}</sheets></workbook>`;

  const sheetRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const utf8 = (text: string) => Buffer.from(text, "utf8");

  return zip([
    { name: "[Content_Types].xml", data: utf8(contentTypes(sheets.length)) },
    { name: "_rels/.rels", data: utf8(ROOT_RELS) },
    { name: "xl/workbook.xml", data: utf8(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8(workbookRels) },
    { name: "xl/styles.xml", data: utf8(STYLES) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8(sheetXml(sheet)),
    })),
  ]);
}

/** `2026-08-23 14:05` — sorts as text, and is unambiguous in any locale. */
export function stamp(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
