namespace MyPetLink.Api.Services;

// One sanitization path for every admin export. Any cell that starts with a
// character a spreadsheet could interpret as a formula (=, +, -, @, tab, CR)
// is prefixed with an apostrophe so it renders as text instead of executing.
// Applies to CSV cells and XLSX cell values alike.
public static class AdminExportSanitizer
{
    public static string SpreadsheetSafe(string value)
    {
        var trimmed = value.TrimStart();
        return trimmed.Length > 0 && "=+-@\t\r".Contains(trimmed[0]) ? $"'{value}" : value;
    }

    public static string Csv(string value)
        => $"\"{SpreadsheetSafe(value).Replace("\"", "\"\"")}\"";
}
