// Shared helpers for the Admin Portal list services and managers. Every module
// builds its request query string, validates URL-provided values, downloads
// exports, and writes local CSV files through these functions so behaviour
// (including spreadsheet formula-injection protection) can never drift between
// modules.

export function isGuid(value?: string) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function isDateOnly(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

// Returns the value only when it is a plain yyyy-mm-dd date, so hand-edited
// URL values never reach the API as unparseable timestamps.
export function dateOnlyOrUndefined(value?: string) {
  return isDateOnly(value) ? value : undefined;
}

type AdminListParamsBase = { page: number; pageSize: number };

// Serializes list params for the admin table endpoints. Empty values are
// dropped; "to"-edge date-only values (listed in dateOnlyToKeys) become
// inclusive end-of-day timestamps; paging can be omitted for count/export
// calls.
export function buildAdminListQuery<T extends AdminListParamsBase>(
  params: T,
  options: { dateOnlyToKeys?: readonly (keyof T & string)[]; omitPaging?: boolean } = {}
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === "") {
      continue;
    }

    if (options.omitPaging && (key === "page" || key === "pageSize")) {
      continue;
    }

    query.set(key, String(value));
  }

  for (const key of options.dateOnlyToKeys ?? []) {
    const value = query.get(key);

    if (value && isDateOnly(value)) {
      query.set(key, `${value}T23:59:59Z`);
    }
  }

  return query.toString();
}

// Neutralizes cells a spreadsheet could interpret as formulas. Mirrors the
// server-side AdminExportSanitizer so demo-mode CSV files get the same
// protection as server exports.
export function spreadsheetSafe(value: string) {
  const trimmed = value.trimStart();
  return trimmed && "=+-@\t\r".includes(trimmed[0]) ? `'${value}` : value;
}

export function csvCell(value: string) {
  return `"${spreadsheetSafe(value).replaceAll('"', '""')}"`;
}

export function buildCsvContent(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(rows: string[][], fileName: string) {
  triggerDownload(
    new Blob([buildCsvContent(rows)], { type: "text/csv;charset=utf-8" }),
    fileName
  );
}
