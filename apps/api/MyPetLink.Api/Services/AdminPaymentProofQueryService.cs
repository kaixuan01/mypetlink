using System.Linq.Expressions;
using System.Text;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Read/query/export side of the payment-review queue. Review mutations remain
// in AdminService so Orders and Payment Proofs share one transactional path.
public sealed class AdminPaymentProofQueryService : SkeletonService, IAdminPaymentProofQueryService
{
    private const int MaxExportRows = 10_000;
    private static readonly TimeSpan OverdueAfter = TimeSpan.FromHours(24);
    private static readonly string[] ExportHeaders =
    [
        "Order Number", "Customer Name", "Customer Email", "Expected Amount",
        "Payment Reference", "Payment Method", "Review Status", "Submitted At (UTC)",
        "Reviewer", "Reviewer Email", "Reviewed At (UTC)", "Rejection Reason",
        "Order Payment Status", "Order Status", "Requires Attention", "Updated At (UTC)"
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;

    public AdminPaymentProofQueryService(MyPetLinkDbContext dbContext, IAuditLogService auditLogService)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
    }

    public async Task<(IReadOnlyCollection<AdminPaymentProofListItemResponse> Items, int Total)> ListAsync(
        AdminPaymentProofQuery query,
        CancellationToken cancellationToken = default)
    {
        var filtered = BuildFilteredQuery(query, includeStatus: true);
        var total = await filtered.CountAsync(cancellationToken);
        var proofs = ApplySort(filtered, query.SortBy, query.SortDir)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize);

        return (await Project(proofs).ToArrayAsync(cancellationToken), total);
    }

    public async Task<AdminPaymentProofListItemResponse> GetAsync(
        Guid paymentProofId,
        CancellationToken cancellationToken = default)
    {
        return await Project(_dbContext.PaymentProofs.AsNoTracking().Where(item => item.Id == paymentProofId))
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw NotFound("Payment proof was not found.");
    }

    public async Task<AdminPaymentProofCountsResponse> CountByStatusAsync(
        AdminPaymentProofQuery query,
        CancellationToken cancellationToken = default)
    {
        var proofs = BuildFilteredQuery(query, includeStatus: false);
        var counts = await proofs.GroupBy(_ => 1).Select(group => new
        {
            All = group.Count(),
            PendingReview = group.Count(proof => proof.Status == PaymentProofStatus.PendingReview),
            Approved = group.Count(proof => proof.Status == PaymentProofStatus.Approved),
            Rejected = group.Count(proof => proof.Status == PaymentProofStatus.Rejected),
            Superseded = group.Count(proof => proof.Status == PaymentProofStatus.Superseded),
            NeedsAttention = group.Count(proof =>
                proof.Status == PaymentProofStatus.PendingReview
                && (proof.Order.Status != OrderStatus.PaymentProofSubmitted
                    || proof.Order.PaymentStatus != PaymentStatus.ProofSubmitted
                    || proof.Order.CancelledAt != null
                    || proof.MediaFile.IsPublic
                    || proof.MediaFile.UploadStatus != MediaUploadStatus.Ready
                    || proof.MediaFile.DeletedAt != null
                    || proof.MediaFile.ObjectKey == ""
                    || proof.Order.PaymentProofs.Count(item => item.Status == PaymentProofStatus.PendingReview) > 1
                    || (proof.PaymentReference != null && _dbContext.PaymentProofs.Any(other =>
                        other.Id != proof.Id
                        && other.OrderId != proof.OrderId
                        && other.PaymentReference == proof.PaymentReference))
                    || (proof.Sha256 != "" && _dbContext.PaymentProofs.Any(other =>
                        other.Id != proof.Id
                        && other.OrderId != proof.OrderId
                        && other.Sha256 == proof.Sha256))))
        }).SingleOrDefaultAsync(cancellationToken);

        return counts is null
            ? new AdminPaymentProofCountsResponse(0, 0, 0, 0, 0, 0)
            : new AdminPaymentProofCountsResponse(
                counts.All,
                counts.PendingReview,
                counts.Approved,
                counts.Rejected,
                counts.Superseded,
                counts.NeedsAttention);
    }

    public async Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminPaymentProofQuery query,
        string? format,
        IReadOnlyCollection<Guid>? paymentProofIds,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var normalizedFormat = NormalizeOptional(format)?.ToLowerInvariant() ?? "csv";
        if (normalizedFormat is not ("csv" or "xlsx"))
        {
            throw ValidationFailed("format", "Choose CSV or Excel for the export.");
        }

        var filtered = BuildFilteredQuery(query, includeStatus: true);
        if (paymentProofIds is { Count: > 0 })
        {
            filtered = filtered.Where(proof => paymentProofIds.Contains(proof.Id));
        }

        var count = await filtered.CountAsync(cancellationToken);
        if (count > MaxExportRows)
        {
            throw ValidationFailed("filters", $"Narrow the filters to {MaxExportRows} payment proofs or fewer before exporting.");
        }

        var rows = await Project(ApplySort(filtered, query.SortBy, query.SortDir)).ToArrayAsync(cancellationToken);

        _auditLogService.Append(
            admin.Id,
            ActorType.Admin,
            "payment-proofs.export",
            "PaymentProof",
            null,
            null,
            new { format = normalizedFormat, rowCount = rows.Length, selectedRowsOnly = paymentProofIds is { Count: > 0 } });
        await _dbContext.SaveChangesAsync(cancellationToken);

        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmm");
        return normalizedFormat == "xlsx"
            ? new AdminTagInventoryExport(
                $"mypetlink-payment-proofs-{stamp}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                BuildXlsx(rows))
            : new AdminTagInventoryExport(
                $"mypetlink-payment-proofs-{stamp}.csv",
                "text/csv",
                Encoding.UTF8.GetBytes(BuildCsv(rows)));
    }

    private IQueryable<PaymentProof> BuildFilteredQuery(AdminPaymentProofQuery query, bool includeStatus)
    {
        ValidateRange(query.AmountMin, query.AmountMax, "amount");
        ValidateRange(query.SubmittedFrom, query.SubmittedTo, "submitted");
        ValidateRange(query.ReviewedFrom, query.ReviewedTo, "reviewed");

        var proofs = _dbContext.PaymentProofs.AsNoTracking();
        if (includeStatus && NormalizeOptional(query.Status) is { } status)
        {
            proofs = proofs.Where(proof => proof.Status == ParseEnum<PaymentProofStatus>(status, "status", "Payment proof status is not supported."));
        }
        if (NormalizeOptional(query.OrderPaymentStatus) is { } paymentStatus)
        {
            proofs = proofs.Where(proof => proof.Order.PaymentStatus == ParseEnum<PaymentStatus>(paymentStatus, "orderPaymentStatus", "Order payment status is not supported."));
        }
        if (NormalizeOptional(query.Search) is { } search)
        {
            proofs = proofs.Where(proof =>
                proof.Order.OrderNumber.Contains(search)
                || proof.Order.OwnerUser.DisplayName.Contains(search)
                || proof.Order.OwnerUser.Email.Contains(search)
                || proof.Order.DeliveryPhoneE164.Contains(search)
                || (proof.PaymentReference != null && proof.PaymentReference.Contains(search))
                || (proof.ReviewedByAdminUser != null && (proof.ReviewedByAdminUser.User.DisplayName.Contains(search) || proof.ReviewedByAdminUser.User.Email.Contains(search)))
                || (proof.Order.SmartTag != null && proof.Order.SmartTag.TagCode.Contains(search)));
        }
        if (NormalizeOptional(query.PaymentMethod) is { } method) proofs = proofs.Where(proof => proof.PaymentMethod.Contains(method));
        if (query.OwnerId.HasValue) proofs = proofs.Where(proof => proof.Order.OwnerUserId == query.OwnerId.Value);
        if (NormalizeOptional(query.Owner) is { } owner) proofs = proofs.Where(proof => proof.Order.OwnerUser.DisplayName.Contains(owner) || proof.Order.OwnerUser.Email.Contains(owner) || proof.Order.DeliveryPhoneE164.Contains(owner));
        if (NormalizeOptional(query.Reviewer) is { } reviewer) proofs = proofs.Where(proof => proof.ReviewedByAdminUser != null && (proof.ReviewedByAdminUser.User.DisplayName.Contains(reviewer) || proof.ReviewedByAdminUser.User.Email.Contains(reviewer)));
        if (query.HasReference.HasValue) proofs = proofs.Where(proof => (proof.PaymentReference != null && proof.PaymentReference != "") == query.HasReference.Value);
        if (query.HasMedia.HasValue) proofs = proofs.Where(proof =>
            (!proof.MediaFile.IsPublic
                && proof.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && proof.MediaFile.DeletedAt == null
                && proof.MediaFile.ObjectKey != "") == query.HasMedia.Value);
        if (query.AmountMin.HasValue) proofs = proofs.Where(proof => proof.Order.Amount + proof.Order.DeliveryFee >= query.AmountMin);
        if (query.AmountMax.HasValue) proofs = proofs.Where(proof => proof.Order.Amount + proof.Order.DeliveryFee <= query.AmountMax);
        if (query.SubmittedFrom.HasValue) proofs = proofs.Where(proof => proof.UploadedAt >= query.SubmittedFrom);
        if (query.SubmittedTo.HasValue) proofs = proofs.Where(proof => proof.UploadedAt <= query.SubmittedTo);
        if (query.ReviewedFrom.HasValue) proofs = proofs.Where(proof => proof.ReviewedAt >= query.ReviewedFrom);
        if (query.ReviewedTo.HasValue) proofs = proofs.Where(proof => proof.ReviewedAt <= query.ReviewedTo);
        if (query.Overdue.HasValue)
        {
            var cutoff = DateTimeOffset.UtcNow.Subtract(OverdueAfter);
            proofs = proofs.Where(proof => (proof.Status == PaymentProofStatus.PendingReview && proof.UploadedAt <= cutoff) == query.Overdue.Value);
        }
        if (query.NeedsAttention.HasValue) proofs = proofs.Where(proof =>
            (proof.Status == PaymentProofStatus.PendingReview
                && (proof.Order.Status != OrderStatus.PaymentProofSubmitted
                    || proof.Order.PaymentStatus != PaymentStatus.ProofSubmitted
                    || proof.Order.CancelledAt != null
                    || proof.MediaFile.IsPublic
                    || proof.MediaFile.UploadStatus != MediaUploadStatus.Ready
                    || proof.MediaFile.DeletedAt != null
                    || proof.MediaFile.ObjectKey == ""
                    || proof.Order.PaymentProofs.Count(item => item.Status == PaymentProofStatus.PendingReview) > 1
                    || (proof.PaymentReference != null && _dbContext.PaymentProofs.Any(other => other.Id != proof.Id && other.OrderId != proof.OrderId && other.PaymentReference == proof.PaymentReference))
                    || (proof.Sha256 != "" && _dbContext.PaymentProofs.Any(other => other.Id != proof.Id && other.OrderId != proof.OrderId && other.Sha256 == proof.Sha256)))) == query.NeedsAttention.Value);

        return proofs;
    }

    private static IOrderedQueryable<PaymentProof> ApplySort(IQueryable<PaymentProof> proofs, string? sortBy, string? sortDir)
    {
        var field = NormalizeOptional(sortBy)?.ToLowerInvariant();
        if (field is null)
        {
            return proofs
                .OrderBy(proof => proof.Status == PaymentProofStatus.PendingReview ? 0 : 1)
                .ThenBy(proof => proof.UploadedAt)
                .ThenBy(proof => proof.Id);
        }

        var direction = NormalizeOptional(sortDir)?.ToLowerInvariant() ?? "desc";
        if (direction is not ("asc" or "desc")) throw ValidationFailed("sortDir", "Sort direction must be ascending or descending.");
        var descending = direction == "desc";
        IOrderedQueryable<PaymentProof> ordered = field switch
        {
            "submittedat" => Order(proofs, proof => proof.UploadedAt, descending),
            "reviewedat" => Order(proofs, proof => proof.ReviewedAt, descending),
            "ordernumber" => Order(proofs, proof => proof.Order.OrderNumber, descending),
            "customer" => Order(proofs, proof => proof.Order.OwnerUser.DisplayName, descending),
            "amount" => Order(proofs, proof => proof.Order.Amount + proof.Order.DeliveryFee, descending),
            "status" => Order(proofs, proof => proof.Status, descending),
            "reviewer" => Order(proofs, proof => proof.ReviewedByAdminUser == null ? "" : proof.ReviewedByAdminUser.User.DisplayName, descending),
            "updatedat" => Order(proofs, proof => proof.UpdatedAt, descending),
            _ => throw ValidationFailed("sortBy", "Sorting by this field is not supported.")
        };
        return ordered.ThenBy(proof => proof.Id);
    }

    private static IOrderedQueryable<PaymentProof> Order<TKey>(IQueryable<PaymentProof> proofs, Expression<Func<PaymentProof, TKey>> key, bool descending) =>
        descending ? proofs.OrderByDescending(key) : proofs.OrderBy(key);

    private IQueryable<AdminPaymentProofListItemResponse> Project(IQueryable<PaymentProof> proofs) =>
        proofs.Select(proof => new AdminPaymentProofListItemResponse(
            proof.Id,
            proof.OrderId,
            proof.Order.OrderNumber,
            proof.Order.OwnerUserId,
            proof.Order.OwnerUser.DisplayName,
            proof.Order.OwnerUser.Email,
            proof.Order.DeliveryPhoneE164,
            proof.Order.Pet.Name,
            proof.Order.SmartTag == null ? null : proof.Order.SmartTag.TagCode,
            proof.Order.Amount + proof.Order.DeliveryFee,
            proof.Order.Currency,
            proof.Status,
            proof.Order.Status,
            proof.Order.PaymentStatus,
            proof.Order.Status == OrderStatus.PreparingTag ? AdminOrderFulfilmentStatus.Preparing
                : proof.Order.Status == OrderStatus.Shipped ? AdminOrderFulfilmentStatus.Shipped
                : proof.Order.Status == OrderStatus.Delivered ? AdminOrderFulfilmentStatus.Delivered
                : proof.Order.Status == OrderStatus.Cancelled ? AdminOrderFulfilmentStatus.Cancelled
                : AdminOrderFulfilmentStatus.NotStarted,
            proof.OriginalFileName,
            proof.ContentType,
            proof.FileSize,
            !proof.MediaFile.IsPublic
                && proof.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && proof.MediaFile.DeletedAt == null
                && proof.MediaFile.ObjectKey != "",
            proof.PaymentMethod,
            proof.PaymentReference,
            proof.OwnerNote,
            proof.RejectionReason,
            proof.UploadedAt,
            proof.ReviewedAt,
            proof.ReviewedByAdminUser == null ? null : proof.ReviewedByAdminUser.User.DisplayName,
            proof.ReviewedByAdminUser == null ? null : proof.ReviewedByAdminUser.User.Email,
            proof.UpdatedAt,
            proof.PaymentReference != null && _dbContext.PaymentProofs.Any(other => other.Id != proof.Id && other.OrderId != proof.OrderId && other.PaymentReference == proof.PaymentReference),
            proof.Sha256 != "" && _dbContext.PaymentProofs.Any(other => other.Id != proof.Id && other.OrderId != proof.OrderId && other.Sha256 == proof.Sha256),
            proof.Order.Status != OrderStatus.PaymentProofSubmitted || proof.Order.PaymentStatus != PaymentStatus.ProofSubmitted || proof.Order.CancelledAt != null,
            proof.Order.PaymentProofs.Count(item => item.Status == PaymentProofStatus.PendingReview),
            proof.Status == PaymentProofStatus.PendingReview
                && (proof.Order.Status != OrderStatus.PaymentProofSubmitted
                    || proof.Order.PaymentStatus != PaymentStatus.ProofSubmitted
                    || proof.Order.CancelledAt != null
                    || proof.MediaFile.IsPublic
                    || proof.MediaFile.UploadStatus != MediaUploadStatus.Ready
                    || proof.MediaFile.DeletedAt != null
                    || proof.MediaFile.ObjectKey == ""
                    || proof.Order.PaymentProofs.Count(item => item.Status == PaymentProofStatus.PendingReview) > 1
                    || (proof.PaymentReference != null && _dbContext.PaymentProofs.Any(other => other.Id != proof.Id && other.OrderId != proof.OrderId && other.PaymentReference == proof.PaymentReference))
                    || (proof.Sha256 != "" && _dbContext.PaymentProofs.Any(other => other.Id != proof.Id && other.OrderId != proof.OrderId && other.Sha256 == proof.Sha256)))));

    private static string BuildCsv(IReadOnlyList<AdminPaymentProofListItemResponse> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', ExportHeaders.Select(Csv)));
        foreach (var row in rows) builder.AppendLine(string.Join(',', ExportRow(row).Select(Csv)));
        return builder.ToString();
    }

    private static byte[] BuildXlsx(IReadOnlyList<AdminPaymentProofListItemResponse> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Payment Proofs");
        for (var column = 0; column < ExportHeaders.Length; column++)
        {
            sheet.Cell(1, column + 1).Value = ExportHeaders[column];
            sheet.Cell(1, column + 1).Style.Font.Bold = true;
        }
        for (var index = 0; index < rows.Count; index++)
        {
            var values = ExportRow(rows[index]);
            for (var column = 0; column < values.Length; column++) sheet.Cell(index + 2, column + 1).SetValue(values[column]);
        }
        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 200));
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string[] ExportRow(AdminPaymentProofListItemResponse row) =>
    [
        row.OrderNumber,
        row.OwnerName,
        row.OwnerEmail,
        $"{row.Currency} {row.ExpectedAmount:0.00}",
        row.PaymentReference ?? "",
        row.PaymentMethod,
        ProofStatusLabel(row.Status),
        ExportDate(row.SubmittedAt),
        row.ReviewerName ?? "",
        row.ReviewerEmail ?? "",
        ExportDate(row.ReviewedAt),
        row.RejectionReason ?? "",
        PaymentStatusLabel(row.OrderPaymentStatus),
        row.OrderStatus.ToString(),
        row.RequiresAttention ? "Yes" : "No",
        ExportDate(row.UpdatedAt)
    ];

    private static string ProofStatusLabel(PaymentProofStatus status) => status == PaymentProofStatus.PendingReview ? "Pending Review" : status.ToString();
    private static string PaymentStatusLabel(PaymentStatus status) => status == PaymentStatus.ProofSubmitted ? "Proof Submitted" : status.ToString();
    private static string ExportDate(DateTimeOffset? value) => value?.UtcDateTime.ToString("yyyy-MM-dd HH:mm") ?? "";
    private static string Csv(string value) => $"\"{value.Replace("\"", "\"\"")}\"";

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue) throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        var admin = await _dbContext.AdminUsers.SingleOrDefaultAsync(item => item.UserId == userId && item.IsActive && item.DisabledAt == null, cancellationToken);
        return admin ?? throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private static T ParseEnum<T>(string value, string field, string message) where T : struct, Enum
    {
        var normalized = value.Trim().Replace("_", "").Replace("-", "").Replace(" ", "");
        return Enum.TryParse<T>(normalized, true, out var parsed) ? parsed : throw ValidationFailed(field, message);
    }

    private static void ValidateRange<T>(T? from, T? to, string field) where T : struct, IComparable<T>
    {
        if (from.HasValue && to.HasValue && from.Value.CompareTo(to.Value) > 0) throw ValidationFailed(field, "The start of this range must be before the end.");
    }

    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ApiException ValidationFailed(string field, string message) => new(StatusCodes.Status400BadRequest, "validation_failed", "Please check the submitted fields.", new Dictionary<string, string[]> { [field] = [message] });
    private static ApiException NotFound(string message) => new(StatusCodes.Status404NotFound, "not_found", message);
}
