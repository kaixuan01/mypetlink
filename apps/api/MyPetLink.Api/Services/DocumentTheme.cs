using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace MyPetLink.Api.Services;

/// <summary>
/// The shared look of a MyPetLink PDF.
///
/// Retail order summaries and receipts established these values; merchant
/// quotations, invoices and receipts reuse them so a business buyer and a pet
/// owner receive documents that plainly come from the same company. The
/// constants are the ones the retail renderer already used, so extracting them
/// changes no existing output.
/// </summary>
internal static class DocumentTheme
{
    public const string Ink = "#0d1b3d";
    public const string Muted = "#5f6b85";
    public const string Border = "#d9deeb";
    public const string Accent = "#1570ef";
    public const string PaidGreen = "#0f8a5f";
    public const string NoticeAmberBackground = "#fdf3df";
    public const string NoticeAmberText = "#9a6b18";
    public const string NoticeGreenBackground = "#eef8f5";

    public static IContainer HeaderCell(IContainer container) =>
        container
            .Background("#f1f4fb")
            .BorderBottom(1)
            .BorderColor(Border)
            .PaddingVertical(6)
            .PaddingHorizontal(6)
            .DefaultTextStyle(text => text.FontSize(9).Bold().FontColor(Muted));

    public static IContainer BodyCell(IContainer container) =>
        container
            .BorderBottom(1)
            .BorderColor(Border)
            .PaddingVertical(6)
            .PaddingHorizontal(6);

    /// <summary>
    /// A bordered label/value block. Rows with an empty label are skipped, so a
    /// caller can express "only when present" inline without building a list.
    /// </summary>
    public static void MetaBlock(
        IContainer container,
        string heading,
        (string Label, string Value)[] rows,
        int labelWidth = 120)
    {
        container.Border(1).BorderColor(Border).Padding(10).Column(column =>
        {
            column.Item().PaddingBottom(6).Text(heading).FontSize(9).Bold().FontColor(Accent);

            foreach (var (label, value) in rows)
            {
                if (string.IsNullOrEmpty(label))
                {
                    continue;
                }

                column.Item().PaddingBottom(3).Row(row =>
                {
                    row.ConstantItem(labelWidth).Text(label).FontSize(9).FontColor(Muted);
                    row.RelativeItem().Text(value).FontSize(9);
                });
            }
        });
    }
}
