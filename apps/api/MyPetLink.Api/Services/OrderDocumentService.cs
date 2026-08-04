using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Reflection;

namespace MyPetLink.Api.Services;

// PDF documents for tag orders: an Order Summary before payment is confirmed
// and an Official Receipt after admin confirmation. Generated server-side from
// authoritative order data so wording and totals cannot be spoofed by the
// client. Payment proofs remain metadata only; no gateway is involved.
//
// Product wording, capability (QR vs QR + NFC), quantity, and prices are read
// from immutable order snapshots (TagOrderItem when present, else the legacy
// TagOrder fields) — never from the current, mutable product catalog — so an
// existing receipt never changes when the catalog is edited.
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

    // Internal transactional-email boundary. The order id comes only from the
    // server-owned outbox relation; callers cannot supply a path or filename.
    Task<OrderDocumentResult> GetTransactionalReceiptAsync(
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
    private const string BusinessOwner = "Issued by GBB Software Solutions";
    private const string BusinessRegNo = "Business Registration No.: 202603141718 (AS0515813-P)";
    private const string BusinessWebsite = "mypetlink.com.my";
    private const string SupportEmail = "support@mypetlink.com.my";

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

    public async Task<OrderDocumentResult> GetTransactionalReceiptAsync(
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
        return new OrderDocumentResult(
            bytes,
            $"MyPetLink-Order-Summary-{SafeFileReference(order.OrderNumber)}.pdf");
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

        if (string.IsNullOrWhiteSpace(order.ReceiptNumber))
        {
            throw OrderDocumentInconsistent(
                order.OrderNumber,
                "the confirmed order has no persisted receipt number");
        }

        var model = MapModel(order, isReceipt: true);
        var bytes = OrderDocumentRenderer.Render(model);
        return new OrderDocumentResult(
            bytes,
            $"MyPetLink-Receipt-{SafeFileReference(order.ReceiptNumber)}.pdf");
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
            .Include(order => order.PaymentProofs)
            .Include(order => order.Items)
                .ThenInclude(item => item.Pet);
    }

    private OrderDocumentModel MapModel(TagOrder order, bool isReceipt)
    {
        var latestProof = order.PaymentProofs
            .OrderByDescending(proof => proof.UploadedAt)
            .ThenByDescending(proof => proof.CreatedAt)
            .FirstOrDefault();

        var currency = string.IsNullOrWhiteSpace(order.Currency) ? "MYR" : order.Currency;
        var deliveryFee = order.DeliveryFee;

        var (lines, supportsNfc, subtotal, discountTotal, promotionLabel) = BuildLines(order, currency);
        var calculatedTotal = subtotal - discountTotal + deliveryFee;
        var grandTotal = order.TotalAmount ?? calculatedTotal;
        if (Math.Abs(grandTotal - calculatedTotal) > 0.01m)
            throw OrderDocumentInconsistent(order.OrderNumber, "the stored total does not reconcile");
        var hasDiscount = discountTotal > 0m;

        return new OrderDocumentModel(
            IsReceipt: isReceipt,
            BrandLogo: LoadBrandLogo(),
            BusinessName: BusinessName,
            BusinessOwner: BusinessOwner,
            BusinessRegNo: BusinessRegNo,
            BusinessWebsite: BusinessWebsite,
            SupportEmail: SupportEmail,
            DocumentTitle: isReceipt ? "Official Receipt" : "Order Summary",
            OrderNumber: order.OrderNumber,
            ReceiptNumber: isReceipt ? order.ReceiptNumber : null,
            OrderDate: FormatDateTime(order.CreatedAt) ?? "-",
            PaymentSubmittedDate: FormatDateTime(latestProof?.UploadedAt),
            ReceiptDate: FormatDateTime(order.PaymentConfirmedAt),
            CustomerName: Fallback(order.OwnerUser?.DisplayName, "MyPetLink customer"),
            CustomerEmail: Fallback(order.OwnerUser?.Email, "-"),
            PetName: Fallback(order.Pet?.Name, "-"),
            Lines: lines,
            Subtotal: FormatMoney(subtotal, currency),
            HasDiscount: hasDiscount,
            DiscountAmount: hasDiscount ? $"- {FormatMoney(discountTotal, currency)}" : null,
            PromotionLabel: promotionLabel,
            DeliveryFee: deliveryFee <= 0m ? "Free" : FormatMoney(deliveryFee, currency),
            DeliveryMethod: FormatDeliveryMethod(order.DeliveryMethodName, order.DeliveryZoneName),
            DeliveryDestination: FormatDeliveryDestination(order.State, order.Postcode),
            FreeDeliveryReason: order.FreeShippingReason,
            TotalAmount: FormatMoney(grandTotal, currency),
            Currency: currency,
            GpsDisclaimer: BuildGpsDisclaimer(supportsNfc),
            PaymentMethod: Fallback(latestProof?.PaymentMethod, "QR Payment"),
            PaymentReference: string.IsNullOrWhiteSpace(latestProof?.PaymentReference)
                ? null
                : latestProof!.PaymentReference,
            PaymentStatus: isReceipt ? "Paid" : DescribePaymentStatus(order.PaymentStatus),
            OrderStatus: DescribeOrderStatus(order.Status),
            IsPaid: order.PaymentConfirmedAt.HasValue);
    }

    private static byte[] LoadBrandLogo()
    {
        var assembly = typeof(OrderDocumentService).Assembly;
        var resource = assembly.GetManifestResourceNames()
            .SingleOrDefault(name => name.EndsWith("Assets.Brand.mypetlink-logo-horizontal.png", StringComparison.Ordinal));
        if (resource is null) return [];
        using var stream = assembly.GetManifestResourceStream(resource);
        if (stream is null) return [];
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
    }

    // Builds the line items and totals from immutable order snapshots. Prefers
    // the per-SKU TagOrderItem snapshots (which carry capability, quantity, and
    // any promotion exactly as sold); falls back to the legacy single-unit
    // TagOrder fields for pre-catalog orders that have no item rows.
    private static (
        IReadOnlyList<OrderDocumentLine> Lines,
        bool SupportsNfc,
        decimal Subtotal,
        decimal DiscountTotal,
        string? PromotionLabel) BuildLines(TagOrder order, string currency)
    {
        var variantLabel = FormatCustomerOption(order.Variant);
        var items = order.Items
            .OrderBy(item => item.CreatedAt)
            .ToList();

        if (items.Count == 0)
        {
            // Legacy order: exactly one unit, no catalog discount is possible.
            var supportsNfcLegacy = order.TagType == TagType.QrNfcSmartTag;
            var legacyLine = new OrderDocumentLine(
                ProductName: DefaultProductName(supportsNfcLegacy),
                VariantLabel: variantLabel,
                PetName: Fallback(order.Pet?.Name, "-"),
                Quantity: 1,
                UnitPrice: FormatMoney(order.Amount, currency),
                LineTotal: FormatMoney(order.Amount, currency));

            return (new[] { legacyLine }, supportsNfcLegacy, order.Amount, 0m, null);
        }

        var supportsNfc = items.Any(item => item.SupportsNfcSnapshot);
        var subtotal = 0m;
        var discountTotal = 0m;
        var itemsFinal = 0m;
        var lines = new List<OrderDocumentLine>(items.Count);

        foreach (var item in items)
        {
            // Fail clearly rather than print an incorrect total for data the
            // renderer cannot faithfully represent.
            if (item.Quantity < 1)
            {
                throw OrderDocumentInconsistent(
                    order.OrderNumber,
                    "a purchased item has an invalid quantity");
            }

            subtotal += item.Subtotal;
            discountTotal += item.DiscountAmount;
            itemsFinal += item.FinalAmount;

            lines.Add(new OrderDocumentLine(
                ProductName: Fallback(item.ProductNameSnapshot, DefaultProductName(item.SupportsNfcSnapshot)),
                VariantLabel: Fallback(item.VariantNameSnapshot, variantLabel),
                PetName: Fallback(item.PetNameSnapshot, Fallback(item.Pet?.Name, "-")),
                Quantity: item.Quantity,
                UnitPrice: FormatMoney(item.UnitBasePrice, currency),
                LineTotal: FormatMoney(item.FinalAmount, currency)));
        }

        // The order's stored Amount is the authoritative charged total. If the
        // itemised snapshots do not reconcile with it, the totals are untrusted,
        // so refuse to emit a document rather than show a wrong figure.
        if (Math.Abs(itemsFinal - order.Amount) > 0.01m)
        {
            throw OrderDocumentInconsistent(
                order.OrderNumber,
                "line totals do not reconcile with the order amount");
        }

        var promotionNames = items
            .Select(item => item.PromotionNameSnapshot)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var promotionLabel = promotionNames.Count > 0 ? string.Join(", ", promotionNames) : null;

        return (lines, supportsNfc, subtotal, discountTotal, promotionLabel);
    }

    private static string DefaultProductName(bool supportsNfc)
    {
        return supportsNfc ? "MyPetLink QR + NFC Smart Tag" : "MyPetLink QR Pet Tag";
    }

    private static string FormatCustomerOption(string? snapshot)
    {
        var option = TagVariants.Normalize(snapshot);
        return option.EndsWith(" Tag", StringComparison.OrdinalIgnoreCase)
            ? option[..^4].TrimEnd()
            : option;
    }

    private static string FormatDeliveryMethod(string? methodSnapshot, string? zoneSnapshot)
    {
        // The configured method is an immutable order snapshot. Historical
        // documents must not replace it with today's configuration or a
        // generic label. Only the wording of a MyPetLink-issued label is
        // brought up to date; the stored snapshot and the fee are untouched.
        var normalized = DeliveryLabels.NormalizeCustomerMethod(methodSnapshot, zoneSnapshot);
        return Fallback(normalized, "Delivery");
    }

    private static string FormatDeliveryDestination(string? stateSnapshot, string? postcodeSnapshot)
    {
        var state = stateSnapshot?.Trim();
        var postcode = postcodeSnapshot?.Trim();

        return (state, postcode) switch
        {
            ({ Length: > 0 }, { Length: > 0 }) => $"{state}, {postcode}",
            ({ Length: > 0 }, _) => state,
            (_, { Length: > 0 }) => postcode,
            _ => "-"
        };
    }

    // Capability-aware, customer-friendly. Driven only by the authoritative
    // capability snapshot, never inferred from a product/SKU/variant name.
    private static string BuildGpsDisclaimer(bool supportsNfc)
    {
        return supportsNfc
            ? "MyPetLink QR + NFC Pet Tags are not GPS trackers and do not provide real-time location monitoring."
            : "MyPetLink QR Pet Tags are not GPS trackers and do not provide real-time location monitoring.";
    }

    private static ApiException OrderDocumentInconsistent(string orderNumber, string reason)
    {
        // Customer-safe message; the specific reason/order stay server-side only.
        _ = orderNumber;
        _ = reason;
        return new ApiException(
            StatusCodes.Status500InternalServerError,
            "order_document_unavailable",
            "This order's document could not be prepared right now. Please contact support.");
    }

    private static string SafeFileReference(string reference)
    {
        var safe = new string(reference
            .Take(80)
            .Select(character =>
                char.IsAsciiLetterOrDigit(character) || character is '-' or '_'
                    ? character
                    : '-')
            .ToArray())
            .Trim('-');
        return safe.Length == 0 ? "reference" : safe;
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
            PaymentStatus.Confirmed => "Paid",
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
            OrderStatus.ReadyToShip => "Ready to Ship",
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

internal sealed record OrderDocumentLine(
    string ProductName,
    string VariantLabel,
    string PetName,
    int Quantity,
    string UnitPrice,
    string LineTotal);

internal sealed record OrderDocumentModel(
    bool IsReceipt,
    byte[] BrandLogo,
    string BusinessName,
    string BusinessOwner,
    string BusinessRegNo,
    string BusinessWebsite,
    string SupportEmail,
    string DocumentTitle,
    string OrderNumber,
    string? ReceiptNumber,
    string OrderDate,
    string? PaymentSubmittedDate,
    string? ReceiptDate,
    string CustomerName,
    string CustomerEmail,
    string PetName,
    IReadOnlyList<OrderDocumentLine> Lines,
    string Subtotal,
    bool HasDiscount,
    string? DiscountAmount,
    string? PromotionLabel,
    string DeliveryFee,
    string DeliveryMethod,
    string DeliveryDestination,
    string? FreeDeliveryReason,
    string TotalAmount,
    string Currency,
    string GpsDisclaimer,
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
                    if (model.BrandLogo.Length > 0)
                    {
                        brand.Item().Width(170).Height(40).Image(model.BrandLogo).FitArea();
                    }
                    else
                    {
                        brand.Item().Text(model.BusinessName).FontSize(20).Bold().FontColor(Accent);
                    }
                    brand.Item().PaddingTop(6).Text(model.BusinessOwner).FontSize(9).FontColor(Muted);
                    brand.Item().Text(model.BusinessRegNo).FontSize(8).FontColor(Muted);
                    brand.Item().Text($"Support: {model.SupportEmail}").FontSize(8).FontColor(Muted);
                    brand.Item().Text($"Website: {model.BusinessWebsite}").FontSize(8).FontColor(Muted);
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
                    model.IsReceipt
                        ? ("Receipt Date", model.ReceiptDate ?? "-")
                        : model.PaymentSubmittedDate is null
                        ? ("", "")
                        : ("Payment Proof Submitted", model.PaymentSubmittedDate),
                    model.IsReceipt || model.ReceiptDate is null
                        ? ("", "")
                        : ("Payment Confirmed", model.ReceiptDate),
                }));

                row.ConstantItem(20);

                row.RelativeItem().Element(cell => MetaBlock(cell, "Customer details", new[]
                {
                    ("Name", model.CustomerName),
                    ("Email", model.CustomerEmail),
                    ("Pet", model.PetName),
                }));
            });

            // Line items table.
            column.Item().Element(table => ComposeItemsTable(table, model));

            column.Item().Element(cell => MetaBlock(cell, "Delivery", new[]
            {
                ("Delivery method", model.DeliveryMethod),
                ("Destination", model.DeliveryDestination),
                string.IsNullOrWhiteSpace(model.FreeDeliveryReason) ? ("", "") : ("Delivery saving", model.FreeDeliveryReason!),
            }));

            // Payment section.
            column.Item().Element(cell => MetaBlock(cell, "Payment", new[]
            {
                ("Payment method", model.PaymentMethod),
                model.PaymentReference is null
                    ? ("", "")
                    : ("Payment reference", model.PaymentReference),
                ("Payment status", model.PaymentStatus),
                model.IsReceipt ? ("", "") : ("Order status", model.OrderStatus),
                ("SST", "Not applicable"),
            }));

            if (!model.IsReceipt)
            {
                column.Item().Background("#fdf3df").Padding(8).Text(
                    "This is an order summary, not an official receipt. An official receipt "
                    + "is issued once payment is confirmed.")
                    .FontSize(8).FontColor("#9a6b18");
            }
            else
            {
                column.Item().Background("#eef8f5").Padding(8).Column(next =>
                {
                    next.Item().Text("What happens next?").FontSize(9).Bold().FontColor(PaidGreen);
                    next.Item().Text("Your payment has been confirmed. We’ll now begin preparing your MyPetLink tag. Track your order anytime in the Owner Portal.")
                        .FontSize(8).FontColor(Muted);
                });
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

                foreach (var line in model.Lines)
                {
                    table.Cell().Element(BodyCell).Column(cell =>
                    {
                        cell.Item().Text(line.ProductName).FontSize(9).Bold();
                        cell.Item().Text($"Option: {line.VariantLabel}").FontSize(8).FontColor(Muted);
                        cell.Item().Text($"For: {line.PetName}").FontSize(8).FontColor(Muted);
                    });
                    table.Cell().Element(BodyCell).AlignRight().Text(line.Quantity.ToString()).FontSize(9);
                    table.Cell().Element(BodyCell).AlignRight().Text(line.UnitPrice).FontSize(9);
                    table.Cell().Element(BodyCell).AlignRight().Text(line.LineTotal).FontSize(9);
                }
            });

            column.Item().PaddingTop(8).AlignRight().Column(totals =>
            {
                if (model.HasDiscount)
                {
                    totals.Item().Row(row =>
                    {
                        row.ConstantItem(140).Text("Subtotal").FontSize(9).FontColor(Muted);
                        row.ConstantItem(90).AlignRight().Text(model.Subtotal).FontSize(9);
                    });
                    totals.Item().PaddingTop(4).Row(row =>
                    {
                        var discountLabel = string.IsNullOrEmpty(model.PromotionLabel)
                            ? "Discount"
                            : $"Discount ({model.PromotionLabel})";
                        row.ConstantItem(140).Text(discountLabel).FontSize(9).FontColor(PaidGreen);
                        row.ConstantItem(90).AlignRight().Text(model.DiscountAmount ?? "").FontSize(9)
                            .FontColor(PaidGreen);
                    });
                }

                totals.Item().PaddingTop(4).Row(row =>
                {
                    row.ConstantItem(140).Text("Delivery Fee").FontSize(9).FontColor(Muted);
                    row.ConstantItem(90).AlignRight().Text(model.DeliveryFee).FontSize(9);
                });
                totals.Item().PaddingTop(4).Row(row =>
                {
                    row.ConstantItem(140).Text($"Total ({model.Currency})").FontSize(11).Bold();
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
            column.Spacing(2);
            column.Item().LineHorizontal(1).LineColor(Border);
            column.Item().PaddingTop(6).Text("Thank you for supporting MyPetLink.").FontSize(8.5f).Bold();
            column.Item().Text(model.GpsDisclaimer).FontSize(8).FontColor(Muted);
            column.Item().Text("This document is generated electronically and does not require a signature.")
                .FontSize(8).FontColor(Muted);
            column.Item().Text($"Support: {model.SupportEmail} | {model.BusinessWebsite}")
                .FontSize(8).FontColor(Muted);
        });
    }
}
