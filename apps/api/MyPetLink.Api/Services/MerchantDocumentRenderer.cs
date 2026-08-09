using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyPetLink.Api.Services;

// One renderer for all three merchant documents. A quotation, an invoice and a
// receipt differ in their title, their meta rows and their closing notice, but
// a merchant should recognise them instantly as the same company's paperwork,
// so the seller block, the item table and the totals are shared.

internal enum MerchantDocumentKind
{
    Quotation,
    Invoice,
    Receipt,

    /// <summary>
    /// The packing document that travels with the goods. It is operational,
    /// not financial: it says what is in the box, never what it cost.
    /// </summary>
    DeliveryOrder,
}

internal sealed record MerchantDocumentLine(
    string ProductName,
    string SkuCode,
    string OptionName,
    string? Capability,
    int Quantity,
    string UnitPrice,
    string? LineDiscount,
    string LineSubtotal,
    /// <summary>
    /// Production batches behind the quantity, for the delivery order only.
    /// Financial documents leave it null and never render the column.
    /// </summary>
    string? BatchSummary = null);

internal sealed record MerchantDocumentParty(
    string LegalName,
    string? TradingName,
    string? RegistrationNumber,
    string? TaxIdentificationNumber,
    string? SstRegistrationNumber,
    string? ContactPerson,
    string? ContactEmail,
    string? ContactPhone,
    IReadOnlyList<string> AddressLines);

internal sealed record MerchantDocumentModel(
    MerchantDocumentKind Kind,
    byte[] BrandLogo,
    string BrandName,
    MerchantDocumentParty Seller,
    MerchantDocumentParty Merchant,
    string SupportEmail,
    string? Website,
    string DocumentTitle,
    string DocumentNumberLabel,
    string DocumentNumber,
    IReadOnlyList<(string Label, string Value)> DocumentRows,
    IReadOnlyList<(string Label, string Value)> PaymentRows,
    IReadOnlyList<string>? DeliveryAddressLines,
    IReadOnlyList<MerchantDocumentLine> Lines,
    // Financial documents only. A delivery order leaves these null rather
    // than carrying zeroes that would read as a real price of nothing.
    string? MerchandiseSubtotal,
    string? OrderDiscount,
    string? DeliveryFee,
    string? TotalLabel,
    string? TotalAmount,
    string Currency,
    string? PaymentInstructions,
    string? CustomerNotes,
    string ClosingNotice,
    bool ShowPaidBadge,
    /// <summary>
    /// A place for a person to sign when the parcel changes hands. Paper
    /// convenience only: nothing in the system waits on it.
    /// </summary>
    bool ShowReceivingBlock = false);

internal static class MerchantDocumentRenderer
{
    public static byte[] Render(MerchantDocumentModel model) =>
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(36);
                page.DefaultTextStyle(text =>
                    text.FontSize(10).FontColor(DocumentTheme.Ink).FontFamily(Fonts.Arial));

                page.Header().Element(header => ComposeHeader(header, model));
                page.Content().Element(content => ComposeContent(content, model));
                page.Footer().Element(footer => ComposeFooter(footer, model));
            });
        }).GeneratePdf();

    private static void ComposeHeader(IContainer container, MerchantDocumentModel model)
    {
        container.Column(column =>
        {
            column.Item().Row(row =>
            {
                row.RelativeItem().Column(brand =>
                {
                    if (model.BrandLogo.Length > 0)
                    {
                        brand.Item().Width(170).Height(40).Image(model.BrandLogo).FitArea();
                    }
                    else
                    {
                        brand.Item().Text(model.BrandName).FontSize(20).Bold()
                            .FontColor(DocumentTheme.Accent);
                    }

                    brand.Item().PaddingTop(6).Text($"Issued by {model.Seller.LegalName}")
                        .FontSize(9).FontColor(DocumentTheme.Muted);

                    if (!string.IsNullOrWhiteSpace(model.Seller.RegistrationNumber))
                    {
                        brand.Item().Text($"Business Registration No.: {model.Seller.RegistrationNumber}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    }

                    // Tax lines only appear when the business actually holds
                    // the registration. Printing an empty label would imply one.
                    if (!string.IsNullOrWhiteSpace(model.Seller.TaxIdentificationNumber))
                    {
                        brand.Item().Text($"TIN: {model.Seller.TaxIdentificationNumber}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    }

                    if (!string.IsNullOrWhiteSpace(model.Seller.SstRegistrationNumber))
                    {
                        brand.Item().Text($"SST Registration No.: {model.Seller.SstRegistrationNumber}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    }

                    foreach (var line in model.Seller.AddressLines)
                    {
                        brand.Item().Text(line).FontSize(8).FontColor(DocumentTheme.Muted);
                    }

                    brand.Item().Text($"Support: {model.SupportEmail}")
                        .FontSize(8).FontColor(DocumentTheme.Muted);

                    if (!string.IsNullOrWhiteSpace(model.Seller.ContactPhone))
                    {
                        brand.Item().Text($"Phone: {model.Seller.ContactPhone}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    }

                    if (!string.IsNullOrWhiteSpace(model.Website))
                    {
                        brand.Item().Text($"Website: {model.Website}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                    }
                });

                row.ConstantItem(180).Column(title =>
                {
                    title.Item().AlignRight().Text(model.DocumentTitle).FontSize(16).Bold();
                    title.Item().AlignRight().PaddingTop(2)
                        .Text($"{model.DocumentNumberLabel} {model.DocumentNumber}")
                        .FontSize(9).FontColor(DocumentTheme.Muted);

                    if (model.ShowPaidBadge)
                    {
                        title.Item().AlignRight().PaddingTop(4).Text("PAID").FontSize(12).Bold()
                            .FontColor(DocumentTheme.PaidGreen);
                    }
                });
            });

            column.Item().PaddingTop(10).LineHorizontal(1).LineColor(DocumentTheme.Border);
        });
    }

    private static void ComposeContent(IContainer container, MerchantDocumentModel model)
    {
        container.PaddingVertical(14).Column(column =>
        {
            column.Spacing(14);

            column.Item().Row(row =>
            {
                row.RelativeItem().Element(cell => DocumentTheme.MetaBlock(
                    cell, DocumentHeading(model.Kind), [.. model.DocumentRows]));

                row.ConstantItem(20);

                row.RelativeItem().Element(cell => BillToBlock(cell, model));
            });

            if (model.DeliveryAddressLines is { Count: > 0 })
            {
                column.Item().Element(cell => AddressBlock(
                    cell, "Deliver to", model.DeliveryAddressLines));
            }

            column.Item().Element(table => ComposeItemsTable(table, model));

            if (model.PaymentRows.Count > 0)
            {
                column.Item().Element(cell => DocumentTheme.MetaBlock(
                    cell, "Payment", [.. model.PaymentRows]));
            }

            if (!string.IsNullOrWhiteSpace(model.CustomerNotes))
            {
                column.Item().Border(1).BorderColor(DocumentTheme.Border).Padding(10)
                    .Column(notes =>
                    {
                        notes.Item().PaddingBottom(4).Text("Notes").FontSize(9).Bold()
                            .FontColor(DocumentTheme.Accent);
                        notes.Item().Text(model.CustomerNotes!).FontSize(9)
                            .FontColor(DocumentTheme.Muted);
                    });
            }

            if (model.ShowReceivingBlock)
            {
                column.Item().Element(ComposeReceivingBlock);
            }

            column.Item()
                .Background(model.ShowPaidBadge
                    ? DocumentTheme.NoticeGreenBackground
                    : DocumentTheme.NoticeAmberBackground)
                .Padding(8)
                .Text(model.ClosingNotice)
                .FontSize(8)
                .FontColor(model.ShowPaidBadge
                    ? DocumentTheme.PaidGreen
                    : DocumentTheme.NoticeAmberText);
        });
    }

    private static string DocumentHeading(MerchantDocumentKind kind) => kind switch
    {
        MerchantDocumentKind.Quotation => "Quotation details",
        MerchantDocumentKind.Invoice => "Invoice details",
        MerchantDocumentKind.DeliveryOrder => "Delivery details",
        _ => "Receipt details",
    };

    private static void BillToBlock(IContainer container, MerchantDocumentModel model)
    {
        var merchant = model.Merchant;
        container.Border(1).BorderColor(DocumentTheme.Border).Padding(10).Column(column =>
        {
            // The financial documents address the party who owes the money. A
            // delivery order carries the delivery address and travels with the
            // parcel, so "Billed to" would name the wrong thing to whoever
            // opens the box.
            var heading = model.Kind == MerchantDocumentKind.DeliveryOrder
                ? "Deliver to"
                : "Billed to";

            column.Item().PaddingBottom(6).Text(heading).FontSize(9).Bold()
                .FontColor(DocumentTheme.Accent);

            column.Item().Text(merchant.LegalName).FontSize(9).Bold();

            if (!string.IsNullOrWhiteSpace(merchant.TradingName)
                && !string.Equals(merchant.TradingName, merchant.LegalName, StringComparison.OrdinalIgnoreCase))
            {
                column.Item().Text($"Trading as {merchant.TradingName}")
                    .FontSize(8).FontColor(DocumentTheme.Muted);
            }

            if (!string.IsNullOrWhiteSpace(merchant.RegistrationNumber))
            {
                column.Item().Text($"Business Registration No.: {merchant.RegistrationNumber}")
                    .FontSize(8).FontColor(DocumentTheme.Muted);
            }

            if (!string.IsNullOrWhiteSpace(merchant.TaxIdentificationNumber))
            {
                column.Item().Text($"TIN: {merchant.TaxIdentificationNumber}")
                    .FontSize(8).FontColor(DocumentTheme.Muted);
            }

            foreach (var line in merchant.AddressLines)
            {
                column.Item().Text(line).FontSize(8).FontColor(DocumentTheme.Muted);
            }

            if (!string.IsNullOrWhiteSpace(merchant.ContactPerson))
            {
                column.Item().PaddingTop(4).Text($"Attn: {merchant.ContactPerson}")
                    .FontSize(8).FontColor(DocumentTheme.Muted);
            }

            if (!string.IsNullOrWhiteSpace(merchant.ContactEmail))
            {
                column.Item().Text(merchant.ContactEmail!).FontSize(8).FontColor(DocumentTheme.Muted);
            }
        });
    }

    private static void AddressBlock(
        IContainer container, string heading, IReadOnlyList<string> lines)
    {
        container.Border(1).BorderColor(DocumentTheme.Border).Padding(10).Column(column =>
        {
            column.Item().PaddingBottom(6).Text(heading).FontSize(9).Bold()
                .FontColor(DocumentTheme.Accent);

            foreach (var line in lines)
            {
                column.Item().Text(line).FontSize(9).FontColor(DocumentTheme.Muted);
            }
        });
    }

    private static void ComposeItemsTable(IContainer container, MerchantDocumentModel model)
    {
        if (model.Kind == MerchantDocumentKind.DeliveryOrder)
        {
            ComposeDeliveryItemsTable(container, model);
            return;
        }

        var anyDiscount = model.Lines.Any(line => line.LineDiscount is not null);

        container.Column(column =>
        {
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(5);
                    columns.RelativeColumn(1.2f);
                    columns.RelativeColumn(2);
                    if (anyDiscount) columns.RelativeColumn(2);
                    columns.RelativeColumn(2.2f);
                });

                // Repeats on every page, so a twenty-line order stays readable
                // after the first page break.
                table.Header(header =>
                {
                    header.Cell().Element(DocumentTheme.HeaderCell).Text("Product");
                    header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Qty");
                    header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Unit Price");
                    if (anyDiscount)
                    {
                        header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Discount");
                    }
                    header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Amount");
                });

                foreach (var line in model.Lines)
                {
                    table.Cell().Element(DocumentTheme.BodyCell).Column(cell =>
                    {
                        cell.Item().Text(line.ProductName).FontSize(9).Bold();
                        cell.Item().Text($"SKU: {line.SkuCode} · Option: {line.OptionName}")
                            .FontSize(8).FontColor(DocumentTheme.Muted);
                        if (!string.IsNullOrWhiteSpace(line.Capability))
                        {
                            cell.Item().Text(line.Capability!).FontSize(8)
                                .FontColor(DocumentTheme.Muted);
                        }
                    });
                    table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                        .Text(line.Quantity.ToString()).FontSize(9);
                    table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                        .Text(line.UnitPrice).FontSize(9);
                    if (anyDiscount)
                    {
                        table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                            .Text(line.LineDiscount ?? "—").FontSize(9)
                            .FontColor(line.LineDiscount is null
                                ? DocumentTheme.Muted
                                : DocumentTheme.PaidGreen);
                    }
                    table.Cell().Element(DocumentTheme.BodyCell).AlignRight()
                        .Text(line.LineSubtotal).FontSize(9);
                }
            });

            // Kept on one page where it fits, so the total is never orphaned
            // from the figures it sums.
            if (model.TotalAmount is null) return;

            column.Item().ShowEntire().PaddingTop(8).AlignRight().Column(totals =>
            {
                totals.Item().Row(row =>
                {
                    row.ConstantItem(150).Text("Merchandise subtotal").FontSize(9)
                        .FontColor(DocumentTheme.Muted);
                    row.ConstantItem(95).AlignRight().Text(model.MerchandiseSubtotal).FontSize(9);
                });

                if (model.OrderDiscount is not null)
                {
                    totals.Item().PaddingTop(4).Row(row =>
                    {
                        row.ConstantItem(150).Text("Order discount").FontSize(9)
                            .FontColor(DocumentTheme.PaidGreen);
                        row.ConstantItem(95).AlignRight().Text(model.OrderDiscount).FontSize(9)
                            .FontColor(DocumentTheme.PaidGreen);
                    });
                }

                totals.Item().PaddingTop(4).Row(row =>
                {
                    row.ConstantItem(150).Text("Delivery").FontSize(9).FontColor(DocumentTheme.Muted);
                    row.ConstantItem(95).AlignRight().Text(model.DeliveryFee).FontSize(9);
                });

                totals.Item().PaddingTop(6).Row(row =>
                {
                    row.ConstantItem(150).Text($"{model.TotalLabel} ({model.Currency})")
                        .FontSize(11).Bold();
                    row.ConstantItem(95).AlignRight().Text(model.TotalAmount).FontSize(11).Bold();
                });
            });
        });
    }


    /// <summary>
    /// What is in the box: quantities and the production batches they came
    /// from. No prices, no totals, and no individual tag codes — this document
    /// leaves the building with the parcel.
    /// </summary>
    private static void ComposeDeliveryItemsTable(
        IContainer container, MerchantDocumentModel model)
    {
        container.Column(column =>
        {
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(4.2f);
                    columns.RelativeColumn(2.4f);
                    columns.RelativeColumn(1f);
                    columns.RelativeColumn(3.4f);
                });

                // Repeats on every page, so a twenty-line packing list stays
                // readable after the first break.
                table.Header(header =>
                {
                    header.Cell().Element(DocumentTheme.HeaderCell).Text("Item");
                    header.Cell().Element(DocumentTheme.HeaderCell).Text("SKU");
                    header.Cell().Element(DocumentTheme.HeaderCell).AlignRight().Text("Qty");
                    header.Cell().Element(DocumentTheme.HeaderCell).Text("Batch");
                });

                foreach (var line in model.Lines)
                {
                    // Every cell of a line is kept whole on one page. Whoever
                    // signs for the parcel counts rows against the goods, and a
                    // line whose quantity sits on the previous page cannot be
                    // checked at all.
                    table.Cell().Element(DocumentTheme.BodyCell).ShowEntire().Column(cell =>
                    {
                        cell.Item().Text(line.ProductName).FontSize(9).Bold();
                        cell.Item().Text(line.OptionName).FontSize(8)
                            .FontColor(DocumentTheme.Muted);
                        if (!string.IsNullOrWhiteSpace(line.Capability))
                        {
                            cell.Item().Text(line.Capability!).FontSize(8)
                                .FontColor(DocumentTheme.Muted);
                        }
                    });
                    table.Cell().Element(DocumentTheme.BodyCell).ShowEntire()
                        .Text(line.SkuCode).FontSize(9);
                    table.Cell().Element(DocumentTheme.BodyCell).ShowEntire().AlignRight()
                        .Text(line.Quantity.ToString()).FontSize(9);
                    table.Cell().Element(DocumentTheme.BodyCell).ShowEntire()
                        .Text(string.IsNullOrWhiteSpace(line.BatchSummary)
                            ? "—"
                            : line.BatchSummary!)
                        .FontSize(8).FontColor(DocumentTheme.Muted);
                }
            });
        });
    }

    /// <summary>
    /// Somewhere for whoever accepts the parcel to sign. Kept whole on one
    /// page: half a signature line across a page break helps nobody.
    /// </summary>
    private static void ComposeReceivingBlock(IContainer container)
    {
        container.ShowEntire().PaddingTop(6).Column(column =>
        {
            column.Item().PaddingBottom(6).Text("Received in good order")
                .FontSize(9).Bold().FontColor(DocumentTheme.Accent);
            column.Item().Text("Received by: ______________________________")
                .FontSize(9).FontColor(DocumentTheme.Muted);
            column.Item().PaddingTop(6).Text("Date: _____________________________________")
                .FontSize(9).FontColor(DocumentTheme.Muted);
        });
    }

    private static void ComposeFooter(IContainer container, MerchantDocumentModel model)
    {
        container.Column(column =>
        {
            column.Spacing(2);
            column.Item().LineHorizontal(1).LineColor(DocumentTheme.Border);
            column.Item().PaddingTop(6).Row(row =>
            {
                row.RelativeItem().Text(
                    "This document is generated electronically and does not require a signature.")
                    .FontSize(8).FontColor(DocumentTheme.Muted);

                // Only meaningful once there is more than one page, and
                // harmless on a single-page document.
                row.ConstantItem(90).AlignRight().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(8).FontColor(DocumentTheme.Muted));
                    text.Span("Page ");
                    text.CurrentPageNumber();
                    text.Span(" of ");
                    text.TotalPages();
                });
            });
            column.Item().Text($"Support: {model.SupportEmail}"
                    + (string.IsNullOrWhiteSpace(model.Website) ? "" : $" | {model.Website}"))
                .FontSize(8).FontColor(DocumentTheme.Muted);
        });
    }
}
