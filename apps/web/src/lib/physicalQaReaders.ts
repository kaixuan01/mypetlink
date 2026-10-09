// Reader output is decoded here; the server separately checks origin, route,
// inventory membership and a signed capture receipt before releasing stock.
const CODE = /\/(MPL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4})$/;

export function tagCodeFromQr(value: string): string | null {
  try {
    const url = new URL(value);
    return url.pathname.match(CODE)?.[1] ?? null;
  } catch { return null; }
}

export type NdefRecord = { recordType: string; data?: DataView; encoding?: string };

const RECORD_LABELS: Record<string, string> = {
  "absolute-url": "an absolute address (URI) record",
  "smart-poster": "a smart poster record",
  text: "a text record",
  mime: "a file (MIME) record",
  empty: "an empty record",
  unknown: "an unrecognised record",
};

// Only a standard NDEF web link (URI, "url") record is accepted. Any other
// encoding is named so a supplier encoding problem is visible, never guessed.
export function nfcUrlFromRecords(records: NdefRecord[]): string {
  if (records.length === 0) {
    throw new Error("The NFC chip is empty. It must contain one standard web link (URI) record. Save Failed with a reason.");
  }
  const urls = records.filter(r => r.recordType === "url");
  if (urls.length > 1) {
    throw new Error(`The NFC chip contains ${urls.length} web links. It must contain exactly one. Save Needs Review with a reason.`);
  }
  if (urls.length === 0) {
    const kinds = [...new Set(records.map(r => RECORD_LABELS[r.recordType] ?? `a "${r.recordType}" record`))].join(" and ");
    throw new Error(`The NFC chip stores ${kinds} instead of a standard web link (URI) record. Save Needs Review so the encoding can be checked.`);
  }
  if (!urls[0].data) throw new Error("The NFC chip's web link could not be read. Hold the package still and try again.");
  try {
    return new TextDecoder(urls[0].encoding ?? "utf-8", { fatal: true }).decode(urls[0].data);
  } catch {
    throw new Error("The NFC chip's web link is not readable text. Save Needs Review so the encoding can be checked.");
  }
}

// The manufacturer workbook is an Excel file. Reading it would need a
// spreadsheet library, so the inspection screen asks for a CSV export instead.
export function manifestFileProblem(fileName: string): string | null {
  return /\.(xlsx|xls|xlsm)$/i.test(fileName)
    ? "Excel workbooks can't be read here. In Excel, choose File → Save As → CSV UTF-8, then choose that CSV file."
    : null;
}

export function codesFromManifest(csv: string): string[] {
  // The manufacturer CSV contains both QR and NFC URLs. Read the Tag Code
  // column only so those repeated URL codes are not mistaken for packages.
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') { if (quoted && csv[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("The manifest contains an unfinished quoted field.");
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const header = rows[0]?.map(v => v.replace(/^﻿/, "").trim().toLowerCase().replace(/[ _-]/g, "")) ?? [];
  const index = header.indexOf("tagcode");
  const data = index >= 0 ? rows.slice(1) : rows;
  if (index < 0 && rows.some(r => r.length !== 1)) throw new Error("Choose a CSV with a Tag Code column or one code per line.");
  return data.map(r => (r[index >= 0 ? index : 0] ?? "").trim().toUpperCase());
}
