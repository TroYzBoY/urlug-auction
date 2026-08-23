import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { stamp, workbook } from "./xlsx";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPREADSHEET WRITER
 *
 * A hand-written ZIP is worth testing as a container, not only as content: a
 * wrong offset or a wrong CRC produces a file that every assertion about its
 * bytes passes and that Excel refuses to open. So these unpack the workbook the
 * way a reader would — walking the central directory, inflating each entry and
 * checking its checksum — and only then look at the cells.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A minimal ZIP reader: enough to prove the writer produced a real archive. */
function unzip(buf: Buffer): Map<string, string> {
  const EOCD = 0x06054b50;

  /* The end record is last, but may be followed by a comment, so scan back. */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  expect(eocd, "end-of-central-directory record").toBeGreaterThanOrEqual(0);

  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();

  for (let n = 0; n < count; n++) {
    expect(buf.readUInt32LE(at), "central directory signature").toBe(
      0x02014b50,
    );
    const expectedCrc = buf.readUInt32LE(at + 16);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);

    expect(buf.readUInt32LE(localAt), `local header for ${name}`).toBe(
      0x04034b50,
    );
    const localNameLen = buf.readUInt16LE(localAt + 26);
    const localExtraLen = buf.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;

    const raw = inflateRawSync(buf.subarray(dataAt, dataAt + compressed));
    expect(crc32(raw), `checksum for ${name}`).toBe(expectedCrc);
    out.set(name, raw.toString("utf8"));

    at += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

const SIMPLE = () =>
  workbook([
    {
      name: "Цэнэглэлт",
      columns: ["№", "Нэр", "Дүн"],
      rows: [
        [1, "Батбаяр", 250000],
        [2, "Дорж", 0],
      ],
    },
  ]);

describe("workbook", () => {
  it("writes an archive a reader can walk", () => {
    const files = unzip(SIMPLE());
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("starts with the local file header signature", () => {
    expect(SIMPLE().subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("writes numbers as numbers, so a column can be summed", () => {
    const sheet = unzip(SIMPLE()).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="C2"><v>250000</v></c>');
    /* Zero is a value, not an empty cell — an unpaid topup of 0 must show. */
    expect(sheet).toContain('<c r="C3"><v>0</v></c>');
  });

  it("writes text as inline strings, preserving spaces", () => {
    const sheet = unzip(SIMPLE()).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('xml:space="preserve"');
    expect(sheet).toContain("Батбаяр");
  });

  it("puts the sheet name on the tab", () => {
    expect(unzip(SIMPLE()).get("xl/workbook.xml")!).toContain(
      'name="Цэнэглэлт"',
    );
  });

  /*
   * The failure this guards is total: one raw ampersand or one control
   * character and Excel rejects the whole workbook rather than one cell.
   */
  it("escapes XML and drops control characters", () => {
    const buf = workbook([
      {
        name: "T",
        columns: ["A"],
        rows: [[`Батбаяр & Ко <тест> "х" ${String.fromCharCode(7)}bell`]],
      },
    ]);
    const sheet = unzip(buf).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("&amp;");
    expect(sheet).toContain("&lt;тест&gt;");
    expect(sheet).toContain("&quot;х&quot;");
    expect(sheet).not.toContain(String.fromCharCode(7));
    expect(sheet).toContain("bell");
  });

  it("sanitises a tab name Excel would refuse", () => {
    const buf = workbook([
      { name: "Тайлан*[2026]?", columns: ["A"], rows: [] },
    ]);
    const book = unzip(buf).get("xl/workbook.xml")!;
    expect(book).not.toContain("*");
    expect(book).toContain("Тайлан");
  });

  it("truncates a tab name past Excel's 31 characters", () => {
    const buf = workbook([{ name: "А".repeat(40), columns: ["A"], rows: [] }]);
    const book = unzip(buf).get("xl/workbook.xml")!;
    const found = /name="(А+)"/.exec(book);
    expect(found?.[1]).toHaveLength(31);
  });

  it("names columns past Z the way Excel does", () => {
    const columns = Array.from({ length: 28 }, (_, i) => `c${i}`);
    const buf = workbook([{ name: "T", columns, rows: [[]] }]);
    const sheet = unzip(buf).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('r="Z1"');
    expect(sheet).toContain('r="AA1"');
    expect(sheet).toContain('r="AB1"');
  });

  it("declares one worksheet part per sheet", () => {
    const buf = workbook([
      { name: "One", columns: ["A"], rows: [] },
      { name: "Two", columns: ["A"], rows: [] },
      { name: "Three", columns: ["A"], rows: [] },
    ]);
    const files = unzip(buf);
    expect(files.has("xl/worksheets/sheet3.xml")).toBe(true);
    expect(files.get("[Content_Types].xml")).toContain("sheet3.xml");
    expect(files.get("xl/_rels/workbook.xml.rels")).toContain("sheet3.xml");
    /* Styles take the id after the last sheet, or the tabs lose their bold. */
    expect(files.get("xl/_rels/workbook.xml.rels")).toContain('Id="rId4"');
  });

  it("refuses a workbook with no sheets", () => {
    expect(() => workbook([])).toThrow();
  });
});

describe("stamp", () => {
  it("formats a date as sortable text", () => {
    expect(stamp(new Date(2026, 7, 23, 14, 5))).toBe("2026-08-23 14:05");
  });

  it("gives an empty cell for a missing or unusable value", () => {
    expect(stamp(null)).toBe("");
    expect(stamp(undefined)).toBe("");
    expect(stamp("not a date")).toBe("");
  });
});
