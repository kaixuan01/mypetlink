using System.Linq.Expressions;
using System.Text;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Read/query/export side of Admin Orders. Mutations remain in AdminService so
// Orders and Payment Proofs continue to use one transition implementation.
public sealed class AdminOrderQueryService : SkeletonService, IAdminOrderQueryService
{
    private const int MaxExportRows = 10_000;
    private static readonly string[] ExportHeaders =
    [
        "Order Number", "Customer Name", "Customer Email", "Customer Phone",
        "Pet", "Item", "Tag Type", "Tag Variant", "Quantity", "Amount",
        "Payment Status", "Payment Proof Status", "Payment Reference",
        "Fulfilment Status", "Assigned Tag Code", "Tracking Number",
        "Delivery City", "Delivery State", "Created At (UTC)",
        "Payment Confirmed At (UTC)", "Shipped At (UTC)", "Delivered At (UTC)",
        "Updated At (UTC)"
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;

    public AdminOrderQueryService(MyPetLinkDbContext dbContext, IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
    }

    public async Task<(IReadOnlyCollection<AdminOrderListItemResponse> Items, int Total)> ListAsync(
        AdminOrderQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query, includeStage: true);
        var total = await filtered.CountAsync(cancellationToken);
        var orders = await ApplySort(filtered, query.SortBy, query.SortDir)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return (orders.Select(ToListItem).ToArray(), total);
    }

    public async Task<AdminOrderStatusCountsResponse> CountByStageAsync(
        AdminOrderQuery query,
        CancellationToken cancellationToken = default)
    {
        // Ignore only the shortcut stage. Search and every explicit filter still
        // constrain these counts, matching the shared Smart Tags behaviour.
        var orders = BuildFilteredQuery(query, includeStage: false);
        var counts = await orders.GroupBy(_ => 1).Select(group => new
        {
            All = group.Count(),
            AwaitingPayment = group.Count(order => order.Status == OrderStatus.PendingPayment),
            PaymentReview = group.Count(order => order.Status == OrderStatus.PaymentProofSubmitted),
            ReadyToPrepare = group.Count(order => order.Status == OrderStatus.PaymentConfirmed),
            Preparing = group.Count(order => order.Status == OrderStatus.PreparingTag),
            Shipped = group.Count(order => order.Status == OrderStatus.Shipped),
            Delivered = group.Count(order => order.Status == OrderStatus.Delivered),
            Cancelled = group.Count(order => order.Status == OrderStatus.Cancelled)
        }).SingleOrDefaultAsync(cancellationToken);

        return counts is null
            ? new AdminOrderStatusCountsResponse(0, 0, 0, 0, 0, 0, 0, 0)
            : new AdminOrderStatusCountsResponse(
                counts.All,
                counts.AwaitingPayment,
                counts.PaymentReview,
                counts.ReadyToPrepare,
                counts.Preparing,
                counts.Shipped,
                counts.Delivered,
                counts.Cancelled);
    }

    public async Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminOrderQuery query,
        string? format,
        IReadOnlyCollection<Guid>? orderIds,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var normalizedFormat = NormalizeOptional(format)?.ToLowerInvariant() ?? "csv";
        if (normalizedFormat is not ("csv" or "xlsx"))
        {
            throw ValidationFailed("format", "Choose CSV or Excel for the export.");
        }

        var filtered = BuildFilteredQuery(query, includeStage: true);
        if (orderIds is { Count: > 0 })
        {
            filtered = filtered.Where(order => orderIds.Contains(order.Id));
        }

        var count = await filtered.CountAsync(cancellationToken);
        if (count > MaxExportRows)
        {
            throw ValidationFailed(
                "filters",
                $"Narrow the filters to {MaxExportRows} orders or fewer before exporting.");
        }

        var orders = await ApplySort(filtered, query.SortBy, query.SortDir)
            .ToListAsync(cancellationToken);
        var rows = orders.Select(ToListItem).ToArray();

        _auditLogService.Append(
            admin.Id,
            ActorType.Admin,
            "orders.export",
            "TagOrder",
            null,
            null,
            new
            {
                format = normalizedFormat,
                rowCount = rows.Length,
                selectedRowsOnly = orderIds is { Count: > 0 }
            });
        await _dbContext.SaveChangesAsync(cancellationToken);

        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmm");
        return normalizedFormat == "xlsx"
            ? new AdminTagInventoryExport(
                $"mypetlink-tag-orders-{stamp}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                BuildXlsx(rows))
            : new AdminTagInventoryExport(
                $"mypetlink-tag-orders-{stamp}.csv",
                "text/csv",
                Encoding.UTF8.GetBytes(BuildCsv(rows)));
    }

    public static AdminOrderFulfilmentStatus ResolveFulfilmentStatus(OrderStatus status) => status switch
    {
        OrderStatus.PreparingTag => AdminOrderFulfilmentStatus.Preparing,
        OrderStatus.Shipped => AdminOrderFulfilmentStatus.Shipped,
        OrderStatus.Delivered => AdminOrderFulfilmentStatus.Delivered,
        OrderStatus.Cancelled => AdminOrderFulfilmentStatus.Cancelled,
        _ => AdminOrderFulfilmentStatus.NotStarted
    };

    private IQueryable<TagOrder> BuildFilteredQuery(AdminOrderQuery query, bool includeStage)
    {
        IQueryable<TagOrder> orders = _dbContext.TagOrders
            .AsNoTracking()
            .Include(order => order.OwnerUser)
            .Include(order => order.Pet)
            .Include(order => order.SmartTag)
            .Include(order => order.PaymentProofs)
            .Include(order => order.Items);
        var search = NormalizeOptional(query.Search);
        if (search is not null)
        {
            orders = orders.Where(order =>
                order.OrderNumber.Contains(search)
                || order.OwnerUser.DisplayName.Contains(search)
                || order.OwnerUser.Email.Contains(search)
                || order.DeliveryPhoneE164.Contains(search)
                || order.Pet.Name.Contains(search)
                || (order.SmartTag != null && order.SmartTag.TagCode.Contains(search))
                || (order.TrackingNumber != null && order.TrackingNumber.Contains(search))
                || order.Items.Any(item => item.SkuSnapshot.Contains(search) || item.ProductNameSnapshot.Contains(search))
                || order.PaymentProofs.Any(proof =>
                    (proof.PaymentReference != null && proof.PaymentReference.Contains(search))
                    || proof.OriginalFileName.Contains(search)));
        }

        if (includeStage && NormalizeOptional(query.Stage) is { } stage)
        {
            var status = stage.Trim().ToLowerInvariant() switch
            {
                "awaiting-payment" => OrderStatus.PendingPayment,
                "payment-review" => OrderStatus.PaymentProofSubmitted,
                "ready-to-prepare" => OrderStatus.PaymentConfirmed,
                "preparing" => OrderStatus.PreparingTag,
                "shipped" => OrderStatus.Shipped,
                "delivered" => OrderStatus.Delivered,
                "cancelled" => OrderStatus.Cancelled,
                _ => throw ValidationFailed("stage", "Order stage is not supported.")
            };
            orders = orders.Where(order => order.Status == status);
        }

        if (NormalizeOptional(query.PaymentStatus) is { } paymentStatus)
        {
            var parsed = ParseEnum<PaymentStatus>(
                paymentStatus,
                "paymentStatus",
                "Payment status is not supported.");
            orders = orders.Where(order => order.PaymentStatus == parsed);
        }

        if (NormalizeOptional(query.FulfilmentStatus) is { } fulfilment)
        {
            var parsed = ParseEnum<AdminOrderFulfilmentStatus>(
                fulfilment,
                "fulfilmentStatus",
                "Fulfilment status is not supported.");
            orders = parsed switch
            {
                AdminOrderFulfilmentStatus.NotStarted => orders.Where(order =>
                    order.Status == OrderStatus.PendingPayment
                    || order.Status == OrderStatus.PaymentProofSubmitted
                    || order.Status == OrderStatus.PaymentConfirmed),
                AdminOrderFulfilmentStatus.Preparing => orders.Where(order => order.Status == OrderStatus.PreparingTag),
                AdminOrderFulfilmentStatus.Shipped => orders.Where(order => order.Status == OrderStatus.Shipped),
                AdminOrderFulfilmentStatus.Delivered => orders.Where(order => order.Status == OrderStatus.Delivered),
                AdminOrderFulfilmentStatus.Cancelled => orders.Where(order => order.Status == OrderStatus.Cancelled),
                _ => orders
            };
        }

        if (query.HasProof.HasValue)
        {
            orders = query.HasProof.Value
                ? orders.Where(order => order.PaymentProofs.Any())
                : orders.Where(order => !order.PaymentProofs.Any());
        }

        if (NormalizeOptional(query.PaymentMethod) is { } paymentMethod)
        {
            orders = orders.Where(order => order.PaymentProofs.Any(proof => proof.PaymentMethod.Contains(paymentMethod)));
        }

        if (NormalizeOptional(query.TagType) is { } tagType)
        {
            var parsed = ParseTagType(tagType);
            orders = orders.Where(order => order.TagType == parsed);
        }

        if (NormalizeOptional(query.Variant) is { } variant)
        {
            // Variant labels are Admin-configurable presets, so any value is a
            // valid filter; canonicalize only the two built-in casings.
            var normalized = TagVariants.Normalize(variant);
            orders = orders.Where(order => order.Variant == normalized);
        }

        if (query.HasAssignedTag.HasValue)
        {
            orders = query.HasAssignedTag.Value
                ? orders.Where(order => order.SmartTagId != null)
                : orders.Where(order => order.SmartTagId == null);
        }

        if (query.HasTracking.HasValue)
        {
            orders = query.HasTracking.Value
                ? orders.Where(order => order.TrackingNumber != null && order.TrackingNumber != "")
                : orders.Where(order => order.TrackingNumber == null || order.TrackingNumber == "");
        }

        if (query.OwnerId.HasValue) orders = orders.Where(order => order.OwnerUserId == query.OwnerId.Value);
        if (query.PetId.HasValue) orders = orders.Where(order => order.PetId == query.PetId.Value);
        if (NormalizeOptional(query.Owner) is { } owner)
        {
            orders = orders.Where(order =>
                order.OwnerUser.DisplayName.Contains(owner)
                || order.OwnerUser.Email.Contains(owner)
                || order.DeliveryPhoneE164.Contains(owner));
        }
        if (NormalizeOptional(query.Pet) is { } pet)
        {
            orders = orders.Where(order => order.Pet.Name.Contains(pet));
        }
        if (NormalizeOptional(query.OrderNumber) is { } orderNumber)
        {
            orders = orders.Where(order => order.OrderNumber.Contains(orderNumber));
        }
        if (NormalizeOptional(query.DeliveryLocation) is { } location)
        {
            orders = orders.Where(order => order.City.Contains(location) || order.State.Contains(location));
        }
        if (query.AmountMin.HasValue) orders = orders.Where(order => order.Amount + order.DeliveryFee >= query.AmountMin.Value);
        if (query.AmountMax.HasValue) orders = orders.Where(order => order.Amount + order.DeliveryFee <= query.AmountMax.Value);

        ValidateRange(query.AmountMin, query.AmountMax, "amountMin");
        ValidateRange(query.CreatedFrom, query.CreatedTo, "createdFrom");
        ValidateRange(query.UpdatedFrom, query.UpdatedTo, "updatedFrom");
        ValidateRange(query.ProofSubmittedFrom, query.ProofSubmittedTo, "proofSubmittedFrom");
        ValidateRange(query.PaymentConfirmedFrom, query.PaymentConfirmedTo, "paymentConfirmedFrom");
        ValidateRange(query.ShippedFrom, query.ShippedTo, "shippedFrom");
        ValidateRange(query.DeliveredFrom, query.DeliveredTo, "deliveredFrom");

        if (query.CreatedFrom.HasValue) orders = orders.Where(order => order.CreatedAt >= query.CreatedFrom);
        if (query.CreatedTo.HasValue) orders = orders.Where(order => order.CreatedAt <= query.CreatedTo);
        if (query.UpdatedFrom.HasValue) orders = orders.Where(order => order.UpdatedAt >= query.UpdatedFrom);
        if (query.UpdatedTo.HasValue) orders = orders.Where(order => order.UpdatedAt <= query.UpdatedTo);
        if (query.ProofSubmittedFrom.HasValue) orders = orders.Where(order => order.PaymentProofs.Any(proof => proof.UploadedAt >= query.ProofSubmittedFrom));
        if (query.ProofSubmittedTo.HasValue) orders = orders.Where(order => order.PaymentProofs.Any(proof => proof.UploadedAt <= query.ProofSubmittedTo));
        if (query.PaymentConfirmedFrom.HasValue) orders = orders.Where(order => order.PaymentConfirmedAt >= query.PaymentConfirmedFrom);
        if (query.PaymentConfirmedTo.HasValue) orders = orders.Where(order => order.PaymentConfirmedAt <= query.PaymentConfirmedTo);
        if (query.ShippedFrom.HasValue) orders = orders.Where(order => order.ShippedAt >= query.ShippedFrom);
        if (query.ShippedTo.HasValue) orders = orders.Where(order => order.ShippedAt <= query.ShippedTo);
        if (query.DeliveredFrom.HasValue) orders = orders.Where(order => order.DeliveredAt >= query.DeliveredFrom);
        if (query.DeliveredTo.HasValue) orders = orders.Where(order => order.DeliveredAt <= query.DeliveredTo);

        return orders;
    }

    private static IOrderedQueryable<TagOrder> ApplySort(
        IQueryable<TagOrder> orders,
        string? sortBy,
        string? sortDir)
    {
        var direction = NormalizeOptional(sortDir)?.ToLowerInvariant() ?? "desc";
        if (direction is not ("asc" or "desc"))
        {
            throw ValidationFailed("sortDir", "Sort direction must be ascending or descending.");
        }

        var descending = direction == "desc";
        var field = NormalizeOptional(sortBy)?.ToLowerInvariant() ?? "createdat";
        IOrderedQueryable<TagOrder> ordered = field switch
        {
            "ordernumber" => Order(orders, order => order.OrderNumber, descending),
            "createdat" => Order(orders, order => order.CreatedAt, descending),
            "updatedat" => Order(orders, order => order.UpdatedAt, descending),
            "customer" => Order(orders, order => order.OwnerUser.DisplayName, descending),
            "amount" => Order(orders, order => order.Amount + order.DeliveryFee, descending),
            "paymentstatus" => Order(orders, order => order.PaymentStatus, descending),
            "proofsubmittedat" => Order(orders, order => order.PaymentProofs.Max(proof => (DateTimeOffset?)proof.UploadedAt), descending),
            "paymentconfirmedat" => Order(orders, order => order.PaymentConfirmedAt, descending),
            "fulfilmentstatus" => Order(orders, order => order.Status, descending),
            "shippedat" => Order(orders, order => order.ShippedAt, descending),
            "deliveredat" => Order(orders, order => order.DeliveredAt, descending),
            _ => throw ValidationFailed("sortBy", "Sorting by this field is not supported.")
        };

        return ordered.ThenBy(order => order.Id);
    }

    private static IOrderedQueryable<TagOrder> Order<TKey>(
        IQueryable<TagOrder> orders,
        Expression<Func<TagOrder, TKey>> key,
        bool descending) => descending ? orders.OrderByDescending(key) : orders.OrderBy(key);

    private static AdminOrderListItemResponse ToListItem(TagOrder order)
    {
        var latestProof = order.PaymentProofs
            .OrderByDescending(proof => proof.UploadedAt)
            .ThenByDescending(proof => proof.CreatedAt)
            .FirstOrDefault();
        var item = order.Items.OrderBy(entry => entry.CreatedAt).FirstOrDefault();

        return new AdminOrderListItemResponse(
            order.Id,
            order.OrderNumber,
            order.OwnerUserId,
            order.OwnerUser.DisplayName,
            order.OwnerUser.Email,
            order.DeliveryPhoneE164,
            order.PetId,
            order.Pet.Name,
            order.TagType,
            order.Variant,
            item?.ProductVariantId,
            item?.ProductNameSnapshot,
            item?.SkuSnapshot,
            item?.VariantNameSnapshot,
            item?.Quantity ?? 1,
            item?.UnitBasePrice ?? order.Amount,
            item?.DiscountAmount ?? 0m,
            item?.FinalAmount ?? order.Amount,
            item?.PromotionNameSnapshot,
            order.Amount,
            order.Currency,
            order.DeliveryFee,
            order.Status,
            order.PaymentStatus,
            ResolveFulfilmentStatus(order.Status),
            latestProof is not null,
            latestProof?.Status,
            latestProof?.UploadedAt,
            latestProof?.PaymentMethod,
            latestProof?.PaymentReference,
            order.SmartTagId,
            order.SmartTag?.TagCode,
            order.City,
            order.State,
            order.TrackingNumber,
            order.PaymentConfirmedAt,
            order.ShippedAt,
            order.DeliveredAt,
            order.CancelledAt,
            order.CreatedAt,
            order.UpdatedAt);
    }

    private static string BuildCsv(IReadOnlyList<AdminOrderListItemResponse> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', ExportHeaders.Select(Csv)));
        foreach (var row in rows) builder.AppendLine(string.Join(',', ExportRow(row).Select(Csv)));
        return builder.ToString();
    }

    private static byte[] BuildXlsx(IReadOnlyList<AdminOrderListItemResponse> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Tag Orders");
        for (var column = 0; column < ExportHeaders.Length; column++)
        {
            sheet.Cell(1, column + 1).Value = ExportHeaders[column];
            sheet.Cell(1, column + 1).Style.Font.Bold = true;
        }
        for (var index = 0; index < rows.Count; index++)
        {
            var values = ExportRow(rows[index]);
            for (var column = 0; column < values.Length; column++)
            {
                sheet.Cell(index + 2, column + 1).SetValue(AdminExportSanitizer.SpreadsheetSafe(values[column]));
            }
        }
        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string[] ExportRow(AdminOrderListItemResponse row) =>
    [
        row.OrderNumber,
        row.OwnerName,
        row.OwnerEmail,
        row.OwnerPhone,
        row.PetName,
        row.ProductName ?? (row.TagType == TagType.QrNfcSmartTag ? "QR + NFC Smart Tag" : "QR Pet Tag"),
        row.TagType == TagType.QrNfcSmartTag ? "QR + NFC Smart Tag" : "QR Pet Tag",
        row.VariantName ?? row.Variant,
        row.Quantity.ToString(),
        $"{row.Currency} {(row.FinalAmount + row.DeliveryFee):0.00}",
        PaymentLabel(row.PaymentStatus),
        row.LatestPaymentProofStatus?.ToString() ?? "",
        row.PaymentReference ?? "",
        FulfilmentLabel(row.FulfilmentStatus),
        row.AssignedTagCode ?? "",
        row.TrackingNumber ?? "",
        row.DeliveryCity,
        row.DeliveryState,
        ExportDate(row.CreatedAt),
        ExportDate(row.PaymentConfirmedAt),
        ExportDate(row.ShippedAt),
        ExportDate(row.DeliveredAt),
        ExportDate(row.UpdatedAt)
    ];

    private static string PaymentLabel(PaymentStatus status) => status switch
    {
        PaymentStatus.ProofSubmitted => "Proof Submitted",
        _ => status.ToString()
    };

    private static string FulfilmentLabel(AdminOrderFulfilmentStatus status) => status switch
    {
        AdminOrderFulfilmentStatus.NotStarted => "Not Started",
        _ => status.ToString()
    };

    private static string ExportDate(DateTimeOffset? value) => value?.UtcDateTime.ToString("yyyy-MM-dd HH:mm") ?? "";
    private static string Csv(string value) => AdminExportSanitizer.Csv(value);

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue)
        {
            throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        }

        var admin = await _dbContext.AdminUsers.SingleOrDefaultAsync(
            item => item.UserId == userId && item.IsActive && item.DisabledAt == null,
            cancellationToken);
        return admin ?? throw new ApiException(
            StatusCodes.Status403Forbidden,
            "forbidden",
            "Admin access is required.");
    }

    private static TagType ParseTagType(string value)
    {
        var normalized = value.Trim().Replace("_", "").Replace("-", "").Replace(" ", "").ToUpperInvariant();
        return normalized switch
        {
            "QR" or "QRPETTAG" => TagType.QrPetTag,
            "QRNFC" or "NFC" or "QRNFCSMARTTAG" => TagType.QrNfcSmartTag,
            _ => throw ValidationFailed("tagType", "Tag type is not supported.")
        };
    }

    private static T ParseEnum<T>(string value, string field, string message) where T : struct, Enum
    {
        var normalized = value.Trim().Replace("_", "").Replace("-", "").Replace(" ", "");
        return Enum.TryParse<T>(normalized, true, out var parsed)
            ? parsed
            : throw ValidationFailed(field, message);
    }

    private static void ValidateRange<T>(T? from, T? to, string field) where T : struct, IComparable<T>
    {
        if (from.HasValue && to.HasValue && from.Value.CompareTo(to.Value) > 0)
        {
            throw ValidationFailed(field, "The start of this range must be before the end.");
        }
    }

    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
