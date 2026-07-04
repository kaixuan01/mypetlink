using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyPetLink.Api.Services;

// PDF documents for tag orders: an Order Summary before payment is confirmed
// and an Official Receipt after admin confirmation. Generated server-side from
// authoritative order data so wording and totals cannot be spoofed by the
// client. Payment proofs remain metadata only; no gateway is involved.
public interface IOrderDocumentService
{
    Task<OrderDocumentResult> GetOwnerSummaryAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default);

    Task<OrderDocumentResult> GetOwnerReceiptAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default);

    Task<OrderDocumentResult> GetAdminSummaryAsync(
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<OrderDocumentResult> GetAdminReceiptAsync(
        Guid orderId,
        CancellationToken cancellationToken = default);
}

public sealed record OrderDocumentResult(byte[] Content, string FileName)
{
    public string ContentType => "application/pdf";
}

public sealed class OrderDocumentService : IOrderDocumentService
{
    // Business identity shown on every document.
    private const string BusinessName = "MyPetLink";
    private const string BusinessOwner = "by GBB Software Solutions";
    private const string BusinessRegNo = "Business Registration No.: 202603141718 (AS0515813-P)";
    private const string SupportEmail = "support@gbbsoftwaresolutions.com";

    private readonly MyPetLinkDbContext _dbContext;

    public OrderDocumentService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<OrderDocumentResult> GetOwnerSummaryAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default)
    {
        var order = await LoadOwnedOrderAsync(currentUserId, orderKey, cancellationToken);
        return BuildSummary(order);
    }

    public async Task<OrderDocumentResult> GetOwnerReceiptAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default)
    {
        var order = await LoadOwnedOrderAsync(currentUserId, orderKey, cancellationToken);
        return BuildReceipt(order);
    }

    public async Task<OrderDocumentResult> GetAdminSummaryAsync(
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var order = await LoadOrderByIdAsync(orderId, cancellationToken);
        return BuildSummary(order);
    }

    public async Task<OrderDocumentResult> GetAdminReceiptAsync(
        Guid orderId,
        CancellationToken cancellationToken = default)
    {
        var order = await LoadOrderByIdAsync(orderId, cancellationToken);
        return BuildReceipt(order);
    }

    private OrderDocumentResult BuildSummary(TagOrder order)
    {
        var model = MapModel(order, isReceipt: false);
        var bytes = OrderDocumentRenderer.Render(model);
        return new OrderDocumentResult(bytes, $"MyPetLink-Order-{order.OrderNumber}.pdf");
    }

    private OrderDocumentResult BuildReceipt(TagOrder order)
    {
        if (!order.PaymentConfirmedAt.HasValue)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "receipt_not_available",
                "Receipt is available after payment is confirmed.");
        }

        var model = MapModel(order, isReceipt: true);
        var bytes = OrderDocumentRenderer.Render(model);
        return new OrderDocumentResult(bytes, $"MyPetLink-Receipt-{order.OrderNumber}.pdf");
    }

    private async Task<TagOrder> LoadOwnedOrderAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken)
    {
        var userId = currentUserId ?? throw Unauthorized();
        var normalizedKey = orderKey.Trim();
        var query = OrderGraph().Where(order => order.OwnerUserId == userId);

        query = Guid.TryParse(normalizedKey, out var orderId)
            ? query.Where(order => order.Id == orderId)
            : query.Where(order => order.OrderNumber == normalizedKey);

        var result = await query.SingleOrDefaultAsync(cancellationToken);
        return result ?? throw NotFound();
    }

    private async Task<TagOrder> LoadOrderByIdAsync(Guid orderId, CancellationToken cancellationToken)
    {
        var order = await OrderGraph()
            .SingleOrDefaultAsync(item => item.Id == orderId, cancellationToken);

        return order ?? throw NotFound();
    }

    private IQueryable<TagOrder> OrderGraph()
    {
        return _dbContext.TagOrders
            .AsNoTracking()
            .Include(order => order.OwnerUser)
            .Include(order => order.Pet)
            .Include(order => order.SmartTag)
            .Include(order => order.PaymentProofs);
    }

    private OrderDocumentModel MapModel(TagOrder order, bool isReceipt)
    {
        var latestProof = order.PaymentProofs
            .OrderByDescending(proof => proof.UploadedAt)
            .ThenByDescending(proof => proof.CreatedAt)
            .FirstOrDefault();

        var currency = string.IsNullOrWhiteSpace(order.Currency) ? "MYR" : order.Currency;
        var unitPrice = order.Amount;
        var deliveryFee = order.DeliveryFee;
        var total = unitPrice + deliveryFee;

        return new OrderDocumentModel(
            IsReceipt: isReceipt,
            BusinessName: BusinessName,
            BusinessOwner: BusinessOwner,
            BusinessRegNo: BusinessRegNo,
            SupportEmail: SupportEmail,
            DocumentTitle: isReceipt ? "Official Receipt" : "Order Summary",
            OrderNumber: order.OrderNumber,
            ReceiptNumber: isReceipt ? BuildReceiptNumber(order.OrderNumber) : null,
            OrderDate: FormatDateTime(order.CreatedAt) ?? "-",
            PaymentSubmittedDate: FormatDateTime(latestProof?.UploadedAt),
            PaymentConfirmedDate: FormatDateTime(order.PaymentConfirmedAt),
            CustomerName: Fallback(order.OwnerUser?.DisplayName, "MyPetLink customer"),
            CustomerEmail: Fallback(order.OwnerUser?.Email, "-"),
            PetName: Fallback(order.Pet?.Name, "-"),
            ProductName: order.TagType == TagType.QrNfcSmartTag
                ? "MyPetLink QR + NFC Smart Tag"
                : "MyPetLink QR Pet Tag",
            Shape: Fallback(order.Shape, "-"),
            Quantity: 1,
            UnitPrice: FormatMoney(unitPrice, currency),
            DeliveryFee: deliveryFee <= 0m ? "Free" : FormatMoney(deliveryFee, currency),
            TotalAmount: FormatMoney(total, currency),
            Currency: currency,
            PaymentMethod: Fallback(latestProof?.PaymentMethod, "QR Payment"),
            PaymentReference: string.IsNullOrWhiteSpace(latestProof?.PaymentReference)
                ? null
                : latestProof!.PaymentReference,
            PaymentStatus: DescribePaymentStatus(order.PaymentStatus),
            OrderStatus: DescribeOrderStatus(order.Status),
            IsPaid: order.PaymentConfirmedAt.HasValue);
    }

    private static string BuildReceiptNumber(string orderNumber)
    {
        // MPL-ORD-YYYYMMDD-#### -> MPL-RCP-YYYYMMDD-####
        return orderNumber.Contains("-ORD-", StringComparison.OrdinalIgnoreCase)
            ? orderNumber.Replace("-ORD-", "-RCP-", StringComparison.OrdinalIgnoreCase)
            : $"MPL-RCP-{orderNumber}";
    }

    // Malaysia has a single fixed timezone (UTC+8, no DST), so formatting there
    // gives a stable, human-friendly local time on the document.
    private static string? FormatDateTime(DateTimeOffset? value)
    {
        if (!value.HasValue)
        {
            return null;
        }

        var malaysiaTime = value.Value.ToOffset(TimeSpan.FromHours(8));
        return $"{malaysiaTime:dd MMM yyyy, h:mm tt} (MYT)";
    }

    private static string FormatMoney(decimal amount, string currency)
    {
        var symbol = currency.Equals("MYR", StringComparison.OrdinalIgnoreCase) ? "RM" : currency;
        return $"{symbol} {amount:0.00}";
    }

    private static string DescribePaymentStatus(PaymentStatus status)
    {
        return status switch
        {
            PaymentStatus.Pending => "Pending payment",
            PaymentStatus.ProofSubmitted => "Payment proof submitted - awaiting verification",
            PaymentStatus.Confirmed => "Payment confirmed (Paid)",
            PaymentStatus.Rejected => "Payment proof rejected - resubmission needed",
            PaymentStatus.Refunded => "Refunded",
            _ => status.ToString()
        };
    }

    private static string DescribeOrderStatus(OrderStatus status)
    {
        return status switch
        {
            OrderStatus.PendingPayment => "Pending Payment",
            OrderStatus.PaymentProofSubmitted => "Payment Proof Submitted",
            OrderStatus.PaymentConfirmed => "Payment Confirmed",
            OrderStatus.PreparingTag => "Preparing Tag",
            OrderStatus.Shipped => "Shipped",
            OrderStatus.Delivered => "Delivered",
            OrderStatus.Cancelled => "Cancelled",
            _ => status.ToString()
        };
    }

    private static string Fallback(string? value, string fallback)
    {
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static ApiException NotFound()
    {
        return new ApiException(StatusCodes.Status404NotFound, "not_found", "Order was not found.");
    }

    private static ApiException Unauthorized()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }
}

internal sealed record OrderDocumentModel(
    bool IsReceipt,
    string BusinessName,
    string BusinessOwner,
    string BusinessRegNo,
    string SupportEmail,
    string DocumentTitle,
    string OrderNumber,
    string? ReceiptNumber,
    string OrderDate,
    string? PaymentSubmittedDate,
    string? PaymentConfirmedDate,
    string CustomerName,
    string CustomerEmail,
    string PetName,
    string ProductName,
    string Shape,
    int Quantity,
    string UnitPrice,
    string DeliveryFee,
    string TotalAmount,
    string Currency,
    string PaymentMethod,
    string? PaymentReference,
    string PaymentStatus,
    string OrderStatus,
    bool IsPaid);

internal static class OrderDocumentRenderer
{
    private const string Ink = "#0d1b3d";
    private const string Muted = "#5f6b85";
    private const string Border = "#d9deeb";
    private const string Accent = "#1570ef";
    private const string PaidGreen = "#0f8a5f";

    public static byte[] Render(OrderDocumentModel model)
    {
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(36);
                page.DefaultTextStyle(text => text.FontSize(10).FontColor(Ink).FontFamily(Fonts.Arial));

                page.Header().Element(header => ComposeHeader(header, model));
                page.Content().Element(content => ComposeContent(content, model));
                page.Footer().Element(footer => ComposeFooter(footer, model));
            });
        }).GeneratePdf();
    }

    private static void ComposeHeader(IContainer container, OrderDocumentModel model)
    {
        container.Column(column =>
        {
            column.Item().Row(row =>
            {
                row.RelativeItem().Column(brand =>
                {
                    brand.Item().Text(model.BusinessName).FontSize(20).Bold().FontColor(Accent);
                    brand.Item().Text(model.BusinessOwner).FontSize(9).FontColor(Muted);
                    brand.Item().Text(model.BusinessRegNo).FontSize(8).FontColor(Muted);
                    brand.Item().Text($"Support: {model.SupportEmail}").FontSize(8).FontColor(Muted);
                });

                row.ConstantItem(180).Column(title =>
                {
                    title.Item().AlignRight().Text(model.DocumentTitle).FontSize(16).Bold();

                    if (model.IsReceipt && model.IsPaid)
                    {
                        title.Item().AlignRight().PaddingTop(4).Text("PAID").FontSize(12).Bold()
                            .FontColor(PaidGreen);
                    }
                });
            });

            column.Item().PaddingTop(10).LineHorizontal(1).LineColor(Border);
        });
    }

    private static void ComposeContent(IContainer container, OrderDocumentModel model)
    {
        container.PaddingVertical(14).Column(column =>
        {
            column.Spacing(14);

            // Order / customer meta grid.
            column.Item().Row(row =>
            {
                row.RelativeItem().Element(cell => MetaBlock(cell, "Order details", new[]
                {
                    ("Order No.", model.OrderNumber),
                    model.ReceiptNumber is null ? ("", "") : ("Receipt No.", model.ReceiptNumber),
                    ("Order Date", model.OrderDate),
                    model.PaymentSubmittedDate is null
                        ? ("", "")
                        : ("Payment Proof Submitted", model.PaymentSubmittedDate),
                    model.PaymentConfirmedDate is null
                        ? ("", "")
                        : ("Payment Confirmed", model.PaymentConfirmedDate),
                }));

                row.ConstantItem(20);

                row.RelativeItem().Element(cell => MetaBlock(cell, "Customer", new[]
                {
                    ("Name", model.CustomerName),
                    ("Email", model.CustomerEmail),
                    ("Pet", model.PetName),
                }));
            });

            // Line items table.
            column.Item().Element(table => ComposeItemsTable(table, model));

            // Payment section.
            column.Item().Element(cell => MetaBlock(cell, "Payment", new[]
            {
                ("Payment Method", model.PaymentMethod),
                model.PaymentReference is null
                    ? ("", "")
                    : ("Payment Reference / Transaction ID", model.PaymentReference),
                ("Payment Status", model.PaymentStatus),
                ("Order Status", model.OrderStatus),
                ("SST", "Not applicable"),
            }));

            if (!model.IsReceipt)
            {
                column.Item().Background("#fdf3df").Padding(8).Text(
                    "This is an order summary, not an official receipt. An official receipt "
                    + "is issued once payment is confirmed.")
                    .FontSize(8).FontColor("#9a6b18");
            }
        });
    }

    private static void MetaBlock(IContainer container, string heading, (string Label, string Value)[] rows)
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
                    row.ConstantItem(120).Text(label).FontSize(9).FontColor(Muted);
                    row.RelativeItem().Text(value).FontSize(9);
                });
            }
        });
    }

    private static void ComposeItemsTable(IContainer container, OrderDocumentModel model)
    {
        container.Column(column =>
        {
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(4);
                    columns.RelativeColumn(1);
                    columns.RelativeColumn(2);
                    columns.RelativeColumn(2);
                });

                table.Header(header =>
                {
                    header.Cell().Element(HeaderCell).Text("Product");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Qty");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Unit Price");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Amount");
                });

                table.Cell().Element(BodyCell).Column(cell =>
                {
                    cell.Item().Text(model.ProductName).FontSize(9).Bold();
                    cell.Item().Text($"Design/Shape: {model.Shape}").FontSize(8).FontColor(Muted);
                });
                table.Cell().Element(BodyCell).AlignRight().Text(model.Quantity.ToString()).FontSize(9);
                table.Cell().Element(BodyCell).AlignRight().Text(model.UnitPrice).FontSize(9);
                table.Cell().Element(BodyCell).AlignRight().Text(model.UnitPrice).FontSize(9);
            });

            column.Item().PaddingTop(8).AlignRight().Column(totals =>
            {
                totals.Item().Row(row =>
                {
                    row.ConstantItem(120).Text("Delivery Fee").FontSize(9).FontColor(Muted);
                    row.ConstantItem(90).AlignRight().Text(model.DeliveryFee).FontSize(9);
                });
                totals.Item().PaddingTop(4).Row(row =>
                {
                    row.ConstantItem(120).Text($"Total ({model.Currency})").FontSize(11).Bold();
                    row.ConstantItem(90).AlignRight().Text(model.TotalAmount).FontSize(11).Bold();
                });
            });
        });
    }

    private static IContainer HeaderCell(IContainer container)
    {
        return container
            .Background("#f1f4fb")
            .BorderBottom(1)
            .BorderColor(Border)
            .PaddingVertical(6)
            .PaddingHorizontal(6)
            .DefaultTextStyle(text => text.FontSize(9).Bold().FontColor(Muted));
    }

    private static IContainer BodyCell(IContainer container)
    {
        return container
            .BorderBottom(1)
            .BorderColor(Border)
            .PaddingVertical(6)
            .PaddingHorizontal(6);
    }

    private static void ComposeFooter(IContainer container, OrderDocumentModel model)
    {
        container.Column(column =>
        {
            column.Item().LineHorizontal(1).LineColor(Border);
            column.Item().PaddingTop(6).Text("Thank you for supporting MyPetLink.").FontSize(8).Bold();
            column.Item().Text(
                "QR + NFC Smart Tag is not GPS tracking. This document is generated "
                + "electronically and does not require a signature.")
                .FontSize(7.5f).FontColor(Muted);
            column.Item().Text($"For support, contact {model.SupportEmail}.").FontSize(7.5f).FontColor(Muted);
        });
    }
}
