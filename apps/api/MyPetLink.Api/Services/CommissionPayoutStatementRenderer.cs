using System.Reflection;
using MyPetLink.Api.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyPetLink.Api.Services;

internal sealed record CommissionPayoutStatementLine(
    string Group,
    string SourceOrderNumber,
    DateTimeOffset CalculatedAt,
    decimal CommissionBaseAmount,
    decimal? CommissionPercentage,
    decimal? CommissionFixedAmount,
    decimal CommissionAmount);

internal sealed record CommissionPayoutRecoveryLine(
    string SourceOrderNumber,
    decimal ReversedAmount,
    DateTimeOffset? ReversedAt,
    string? Reason);

internal sealed record CommissionPayoutStatementModel(
    string PayoutNumber,
    CommissionPayoutStatus Status,
    SellerIdentitySnapshot Seller,
    string SalespersonCode,
    string SalespersonName,
    DateTimeOffset PeriodFrom,
    DateTimeOffset PeriodToExclusive,
    string Currency,
    decimal PreparedAmount,
    DateTimeOffset PreparedAt,
    DateTimeOffset? PaidAt,
    CommissionPayoutPaymentMethod? PaymentMethod,
    string? PaymentReference,
    DateTimeOffset? CancelledAt,
    string? CancellationReason,
    string? Notes,
    IReadOnlyCollection<CommissionPayoutStatementLine> Items,
    IReadOnlyCollection<CommissionPayoutRecoveryLine> RecoveryItems,
    DateTimeOffset GeneratedAt);

internal static class CommissionPayoutStatementRenderer
{
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);

    public static byte[] Render(CommissionPayoutStatementModel model) =>
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(34);
                page.DefaultTextStyle(text =>
                    text.FontSize(9).FontColor(DocumentTheme.Ink).FontFamily(Fonts.Arial));
                page.Header().Element(header => Header(header, model));
                page.Content().PaddingVertical(14).Column(column => Content(column, model));
                page.Footer().Element(footer => Footer(footer, model));
            });
        }).GeneratePdf();

    private static void Header(IContainer container, CommissionPayoutStatementModel model)
    {
        container.Column(column =>
        {
            column.Item().Row(row =>
            {
                row.RelativeItem().Column(issuer =>
                {
                    var logo = LoadBrandLogo();
                    if (logo.Length > 0)
                        issuer.Item().Width(170).Height(40).Image(logo).FitArea();
                    else
                        issuer.Item().Text(model.Seller.BrandName).FontSize(20).Bold()
                            .FontColor(DocumentTheme.Accent);

                    issuer.Item().PaddingTop(5).Text($"Issued by {model.Seller.LegalBusinessName}")
                        .FontSize(8).FontColor(DocumentTheme.Muted);
                    issuer.Item().Text($"Business Registration No.: {model.Seller.BusinessRegistrationNumber}")
                        .FontSize(8).FontColor(DocumentTheme.Muted);
                    if (!string.IsNullOrWhiteSpace(model.Seller.TaxIdentificationNumber))
                        issuer.Item().Text($"TIN: {model.Seller.TaxIdentificationNumber}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    if (!string.IsNullOrWhiteSpace(model.Seller.SstRegistrationNumber))
                        issuer.Item().Text($"SST Registration No.: {model.Seller.SstRegistrationNumber}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    foreach (var line in Address(model.Seller))
                        issuer.Item().Text(line).FontSize(8).FontColor(DocumentTheme.Muted);
                    issuer.Item().Text($"Support: {model.Seller.SupportEmail}")
                        .FontSize(8).FontColor(DocumentTheme.Muted);
                });

                row.ConstantItem(205).AlignRight().Column(title =>
                {
                    title.Item().AlignRight().Text("Commission Payout Statement")
                        .FontSize(16).Bold();
                    title.Item().AlignRight().PaddingTop(2).Text(model.PayoutNumber)
                        .FontSize(9).FontColor(DocumentTheme.Muted);
                    title.Item().AlignRight().PaddingTop(6).Text(StatusLabel(model.Status))
                        .FontSize(11).Bold().FontColor(StatusColour(model.Status));
                });
            });
            column.Item().PaddingTop(10).LineHorizontal(1).LineColor(DocumentTheme.Border);
        });
    }

    private static void Content(ColumnDescriptor column, CommissionPayoutStatementModel model)
    {
        column.Spacing(13);
        column.Item().Row(row =>
        {
            row.RelativeItem().Element(cell => DocumentTheme.MetaBlock(cell, "Payout details",
            [
                ("Payout No.", model.PayoutNumber),
                ("Status", StatusLabel(model.Status)),
                ("Earned period", $"{Date(model.PeriodFrom)} through {Date(model.PeriodToExclusive.AddTicks(-1))} (MYT)"),
                ("Prepared at", DateTime(model.PreparedAt)),
                (model.PaidAt.HasValue ? "Paid at" : "", DateTime(model.PaidAt)),
                (model.CancelledAt.HasValue ? "Cancelled at" : "", DateTime(model.CancelledAt)),
            ], 92));
            row.ConstantItem(18);
            row.RelativeItem().Element(cell => DocumentTheme.MetaBlock(cell, "Salesperson",
            [
                ("Name", model.SalespersonName),
                ("Code", model.SalespersonCode),
                ("Currency", model.Currency),
                ("Item count", model.Items.Count.ToString()),
            ], 72));
        });

        if (model.Status == CommissionPayoutStatus.Paid)
        {
            column.Item().Element(cell => DocumentTheme.MetaBlock(cell, "Payment",
            [
                ("Method", PaymentMethod(model.PaymentMethod)),
                ("Reference", model.PaymentReference ?? "—"),
                ("Paid amount", Money(model.Currency, model.PreparedAmount)),
            ], 90));
        }
        else if (model.Status == CommissionPayoutStatus.Cancelled)
        {
            column.Item().Background("#fff2ef").Padding(9).Column(note =>
            {
                note.Item().Text("Cancelled payout").Bold().FontColor("#a63c2e");
                note.Item().PaddingTop(2).Text(model.CancellationReason ?? "No reason recorded.")
                    .FontSize(8).FontColor("#a63c2e");
                note.Item().Text("The original item membership is retained; released commissions may be prepared in another payout.")
                    .FontSize(8).FontColor("#a63c2e");
            });
        }
        else
        {
            column.Item().Background(DocumentTheme.NoticeAmberBackground).Padding(9)
                .Text("This statement records a prepared payout instruction. It is not proof that money has been transferred.")
                .FontSize(8).FontColor(DocumentTheme.NoticeAmberText);
        }

        column.Item().Element(table => GroupSummary(table, model));

        foreach (var group in model.Items.GroupBy(item => item.Group))
        {
            column.Item().Column(section =>
            {
                section.Item().PaddingBottom(5).Text(group.Key).FontSize(11).Bold()
                    .FontColor(DocumentTheme.Accent);
                section.Item().Element(table => ItemTable(
                    table, model.Currency, group.Key, group.ToArray()));
            });
        }

        column.Item().AlignRight().Width(250).BorderTop(2).BorderColor(DocumentTheme.Ink)
            .PaddingTop(8).Row(row =>
            {
                row.RelativeItem().Text("Total prepared amount").Bold();
                row.AutoItem().Text(Money(model.Currency, model.PreparedAmount)).FontSize(12).Bold();
            });

        if (model.RecoveryItems.Count > 0)
            column.Item().Element(section => Recovery(section, model));

        if (!string.IsNullOrWhiteSpace(model.Notes))
        {
            column.Item().Border(1).BorderColor(DocumentTheme.Border).Padding(9).Column(notes =>
            {
                notes.Item().Text("Payout notes").Bold().FontColor(DocumentTheme.Accent);
                notes.Item().PaddingTop(3).Text(model.Notes!).FontSize(8).FontColor(DocumentTheme.Muted);
            });
        }
    }

    private static void GroupSummary(IContainer container, CommissionPayoutStatementModel model)
    {
        container.Column(column =>
        {
            column.Item().PaddingBottom(5).Text("Grouped summary").FontSize(11).Bold();
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(5);
                    columns.RelativeColumn(1.4f);
                    columns.RelativeColumn(2.3f);
                });
                table.Header(header =>
                {
                    header.Cell().Element(DocumentTheme.HeaderCell).Text("Commission group");
                    header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Items");
                    header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Amount");
                });
                foreach (var group in model.Items.GroupBy(item => item.Group))
                {
                    table.Cell().Element(DocumentTheme.BodyCell).Text(group.Key);
                    table.Cell().Element(DocumentTheme.BodyCell).AlignRight().Text(group.Count().ToString());
                    table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                        .Text(Money(model.Currency, group.Sum(item => item.CommissionAmount)));
                }
            });
        });
    }

    private static void ItemTable(IContainer container, string currency, string group,
        IReadOnlyCollection<CommissionPayoutStatementLine> items)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(2.7f);
                columns.RelativeColumn(1.8f);
                columns.RelativeColumn(1.7f);
                columns.RelativeColumn(1.4f);
                columns.RelativeColumn(1.8f);
            });
            table.Header(header =>
            {
                header.Cell().Element(DocumentTheme.HeaderCell).Text($"{group} — Source order");
                header.Cell().Element(DocumentTheme.HeaderCell).Text("Earned");
                header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Base");
                header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Rate / bonus");
                header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Commission");
            });
            foreach (var item in items)
            {
                table.Cell().Element(DocumentTheme.BodyCell).Text(item.SourceOrderNumber);
                table.Cell().Element(DocumentTheme.BodyCell).Text(Date(item.CalculatedAt));
                table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                    .Text(Money(currency, item.CommissionBaseAmount));
                table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                    .Text(Rate(currency, item));
                table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                    .Text(Money(currency, item.CommissionAmount)).Bold();
            }
        });
    }

    private static void Recovery(IContainer container, CommissionPayoutStatementModel model)
    {
        container.Border(1).BorderColor("#f2b8ae").Background("#fff7f5").Padding(10).Column(column =>
        {
            column.Item().Text("Post-Payout Reversals / Recovery Required")
                .FontSize(11).Bold().FontColor("#a63c2e");
            column.Item().PaddingTop(3)
                .Text("These reversals do not reduce the original paid amount shown above.")
                .FontSize(8).FontColor("#a63c2e");
            foreach (var item in model.RecoveryItems)
            {
                column.Item().PaddingTop(7).Row(row =>
                {
                    row.RelativeItem().Column(detail =>
                    {
                        detail.Item().Text(item.SourceOrderNumber).Bold();
                        detail.Item().Text($"Reversed {DateTime(item.ReversedAt)} · {item.Reason ?? "Reason not recorded"}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    });
                    row.AutoItem().Text(Money(model.Currency, item.ReversedAmount)).Bold()
                        .FontColor("#a63c2e");
                });
            }
            column.Item().PaddingTop(8).BorderTop(1).BorderColor("#f2b8ae").PaddingTop(6)
                .Row(row =>
                {
                    row.RelativeItem().Text("Total recovery exposure").Bold();
                    row.AutoItem().Text(Money(model.Currency,
                        model.RecoveryItems.Sum(item => item.ReversedAmount))).Bold();
                });
        });
    }

    private static void Footer(IContainer container, CommissionPayoutStatementModel model)
    {
        container.BorderTop(1).BorderColor(DocumentTheme.Border).PaddingTop(6).Row(row =>
        {
            row.RelativeItem().Text($"Generated {DateTime(model.GeneratedAt)}")
                .FontSize(7).FontColor(DocumentTheme.Muted);
            row.AutoItem().Text(text =>
            {
                text.DefaultTextStyle(style => style.FontSize(7).FontColor(DocumentTheme.Muted));
                text.Span("Page ");
                text.CurrentPageNumber();
                text.Span(" of ");
                text.TotalPages();
            });
        });
    }

    private static string StatusLabel(CommissionPayoutStatus status) => status switch
    {
        CommissionPayoutStatus.Prepared => "PREPARED — NOT YET PAID",
        CommissionPayoutStatus.Paid => "PAID",
        _ => "CANCELLED",
    };

    private static string StatusColour(CommissionPayoutStatus status) => status switch
    {
        CommissionPayoutStatus.Paid => DocumentTheme.PaidGreen,
        CommissionPayoutStatus.Cancelled => "#a63c2e",
        _ => DocumentTheme.NoticeAmberText,
    };

    private static string PaymentMethod(CommissionPayoutPaymentMethod? method) => method switch
    {
        CommissionPayoutPaymentMethod.BankTransfer => "Bank transfer",
        CommissionPayoutPaymentMethod.DuitNow => "DuitNow",
        CommissionPayoutPaymentMethod.Cheque => "Cheque",
        CommissionPayoutPaymentMethod.Cash => "Cash",
        CommissionPayoutPaymentMethod.Other => "Other",
        _ => "—",
    };

    private static string Rate(string currency, CommissionPayoutStatementLine item) =>
        item.CommissionPercentage.HasValue
            ? $"{item.CommissionPercentage.Value:0.##}%"
            : Money(currency, item.CommissionFixedAmount ?? 0m);

    private static string Money(string currency, decimal amount) => $"{currency} {amount:N2}";
    private static string Date(DateTimeOffset value) =>
        value.ToOffset(MalaysiaOffset).ToString("dd MMM yyyy");
    private static string DateTime(DateTimeOffset? value) => value.HasValue
        ? value.Value.ToOffset(MalaysiaOffset).ToString("dd MMM yyyy, HH:mm 'MYT'")
        : "—";

    private static IReadOnlyCollection<string> Address(SellerIdentitySnapshot seller) =>
        new[]
        {
            seller.AddressLine1,
            seller.AddressLine2,
            string.Join(" ", new[] { seller.Postcode, seller.City }.Where(value => !string.IsNullOrWhiteSpace(value))),
            seller.State,
            seller.Country,
        }.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value!).ToArray();

    private static byte[] LoadBrandLogo()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().SingleOrDefault(item =>
            item.EndsWith("Assets.Brand.mypetlink-logo-horizontal.png", StringComparison.Ordinal));
        if (name is null) return [];
        using var stream = assembly.GetManifestResourceStream(name);
        if (stream is null) return [];
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }
}
