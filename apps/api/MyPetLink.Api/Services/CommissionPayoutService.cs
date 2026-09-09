using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ICommissionPayoutService
{
    Task<(IReadOnlyCollection<CommissionPayoutSummaryResponse> Items, int Total)> ListAsync(
        CommissionPayoutQuery query, CancellationToken cancellationToken = default);
    Task<CommissionPayoutResponse> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<CommissionPayoutResponse> PrepareAsync(Guid? actorUserId,
        PrepareCommissionPayoutRequest request, CancellationToken cancellationToken = default);
    Task<CommissionPayoutResponse> MarkPaidAsync(Guid? actorUserId, Guid id,
        MarkCommissionPayoutPaidRequest request, CancellationToken cancellationToken = default);
    Task<CommissionPayoutResponse> CancelAsync(Guid? actorUserId, Guid id,
        CancelCommissionPayoutRequest request, CancellationToken cancellationToken = default);
}

public sealed class CommissionPayoutService : ICommissionPayoutService
{
    private readonly MyPetLinkDbContext _db;
    private readonly IDocumentNumberService _numbers;
    private readonly IBusinessIdentityService _businessIdentity;
    private readonly IAuditLogService _audit;
    private readonly TimeProvider _time;

    public CommissionPayoutService(MyPetLinkDbContext db, IDocumentNumberService numbers,
        IBusinessIdentityService businessIdentity, IAuditLogService audit, TimeProvider time)
    {
        _db = db;
        _numbers = numbers;
        _businessIdentity = businessIdentity;
        _audit = audit;
        _time = time;
    }

    public async Task<(IReadOnlyCollection<CommissionPayoutSummaryResponse> Items, int Total)> ListAsync(
        CommissionPayoutQuery query, CancellationToken cancellationToken = default)
    {
        if (query.From.HasValue && query.ToExclusive.HasValue
            && query.ToExclusive.Value.ToUniversalTime() <= query.From.Value.ToUniversalTime())
            throw Validation("toExclusive", "The end must be later than the start.");
        var rows = _db.CommissionPayouts.AsNoTracking().AsQueryable();
        if (query.SalespersonId.HasValue)
            rows = rows.Where(item => item.SalespersonId == query.SalespersonId.Value);
        var status = ParseStatus(query.Status);
        if (status.HasValue) rows = rows.Where(item => item.Status == status.Value);
        if (query.From.HasValue) rows = rows.Where(item => item.PeriodToExclusive > query.From.Value.ToUniversalTime());
        if (query.ToExclusive.HasValue) rows = rows.Where(item => item.PeriodFrom < query.ToExclusive.Value.ToUniversalTime());
        var number = Trimmed(query.PayoutNumber);
        if (number is not null) rows = rows.Where(item => item.PayoutNumber.Contains(number));
        var total = await rows.CountAsync(cancellationToken);
        var entities = await rows.Include(item => item.Items).ThenInclude(item => item.SalesCommission)
            .OrderByDescending(item => item.PreparedAt).ThenByDescending(item => item.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .ToListAsync(cancellationToken);
        return (entities.Select(ToSummary).ToArray(), total);
    }

    public async Task<CommissionPayoutResponse> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        ToResponse(await RequirePayoutAsync(id, tracked: false, cancellationToken));

    public async Task<CommissionPayoutResponse> PrepareAsync(Guid? actorUserId,
        PrepareCommissionPayoutRequest request, CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var input = ValidatePrepare(request);
        var fingerprint = Fingerprint(input);

        var replay = await _db.CommissionPayouts.AsNoTracking()
            .SingleOrDefaultAsync(item => item.IdempotencyKey == input.IdempotencyKey, cancellationToken);
        if (replay is not null)
            return await ReplayAsync(replay, fingerprint, cancellationToken);

        var identity = await _businessIdentity.RequireForDocumentAsync(
            BusinessDocumentKind.CommissionPayout, cancellationToken);
        var strategy = _db.Database.CreateExecutionStrategy();
        try
        {
            return await strategy.ExecuteAsync(async () =>
            {
                await using var transaction = _db.Database.IsRelational()
                    ? await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
                    : null;

                if (_db.Database.IsSqlServer())
                {
                    await _db.Database.ExecuteSqlInterpolatedAsync(
                        $"SELECT 1 FROM [CommissionPayouts] WITH (UPDLOCK, HOLDLOCK) WHERE [IdempotencyKey] = {input.IdempotencyKey}",
                        cancellationToken);
                }

                var existing = await _db.CommissionPayouts.AsNoTracking()
                    .SingleOrDefaultAsync(item => item.IdempotencyKey == input.IdempotencyKey, cancellationToken);
                if (existing is not null)
                {
                    if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                    return await ReplayAsync(existing, fingerprint, cancellationToken);
                }

                await LockCommissionsAsync(input.CommissionIds, cancellationToken);
                var commissions = await _db.SalesCommissions
                    .Include(item => item.MerchantOrder).Include(item => item.TagOrder)
                    .Include(item => item.PayoutItems.Where(claim => claim.ReleasedAt == null))
                    .Where(item => input.CommissionIds.Contains(item.Id))
                    .OrderBy(item => item.Id).ToListAsync(cancellationToken);

                if (commissions.Count != input.CommissionIds.Length)
                    throw Conflict("commission_selection_changed", "One or more selected commissions no longer exist. Refresh the ledger and try again.");
                if (commissions.Any(item => item.SalespersonId != input.SalespersonId))
                    throw Conflict("payout_salesperson_mismatch", "Every selected commission must belong to the selected salesperson.");
                if (commissions.Any(item => item.Currency != MerchantSalesConstants.Currency))
                    throw Conflict("unsupported_payout_currency", "Only MYR commission payouts are supported.");
                if (commissions.Any(item => item.Status != SalesCommissionStatus.Payable))
                    throw Conflict("commission_not_payable", "Every selected commission must still be payable.");
                if (commissions.Any(item => item.PayoutItems.Count != 0))
                    throw Conflict("commission_already_claimed", "One or more selected commissions already belong to an active payout.");
                if (commissions.Any(item => item.CalculatedAt < input.PeriodFrom || item.CalculatedAt >= input.PeriodToExclusive))
                    throw Conflict("commission_outside_payout_period", "Every selected commission must have been earned inside the payout period.");

                var authoritativeTotal = commissions.Sum(item => item.CommissionAmount);
                if (authoritativeTotal != input.ExpectedTotal)
                    throw Conflict("payout_total_changed", "The selected commission total changed. Refresh the ledger and confirm the new total.");

                var salesperson = await _db.Salespersons.AsNoTracking()
                    .SingleOrDefaultAsync(item => item.Id == input.SalespersonId, cancellationToken)
                    ?? throw Conflict("salesperson_not_found", "The selected salesperson no longer exists.");
                var now = _time.GetUtcNow();
                var payout = new CommissionPayout
                {
                    PayoutNumber = await _numbers.NextCommissionPayoutNumberAsync(now, cancellationToken),
                    SalespersonId = salesperson.Id,
                    SalespersonCodeSnapshot = salesperson.SalespersonCode,
                    SalespersonNameSnapshot = salesperson.Name,
                    Seller = SellerIdentitySnapshot.From(identity),
                    PeriodFrom = input.PeriodFrom,
                    PeriodToExclusive = input.PeriodToExclusive,
                    Currency = MerchantSalesConstants.Currency,
                    PreparedAmount = authoritativeTotal,
                    Status = CommissionPayoutStatus.Prepared,
                    PreparedAt = now,
                    PreparedByAdminUserId = admin.Id,
                    Notes = input.Notes,
                    IdempotencyKey = input.IdempotencyKey,
                    RequestFingerprint = fingerprint,
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                foreach (var commission in commissions)
                {
                    payout.Items.Add(new CommissionPayoutItem
                    {
                        SalesCommissionId = commission.Id,
                        SourceTypeSnapshot = commission.SourceType,
                        CommissionTypeSnapshot = commission.CommissionType,
                        MerchantOrderIdSnapshot = commission.MerchantOrderId,
                        TagOrderIdSnapshot = commission.TagOrderId,
                        SourceOrderNumberSnapshot = SourceOrderNumber(commission),
                        CommissionBaseAmountSnapshot = commission.CommissionBaseAmount,
                        CommissionAmountSnapshot = commission.CommissionAmount,
                        CommissionPercentageSnapshot = commission.CommissionPercentageSnapshot,
                        CommissionFixedAmountSnapshot = commission.CommissionFixedAmountSnapshot,
                        CurrencySnapshot = commission.Currency,
                        CalculatedAtSnapshot = commission.CalculatedAt,
                        CreatedAt = now,
                        UpdatedAt = now,
                    });
                }
                _db.CommissionPayouts.Add(payout);
                _audit.Append(actorUserId, ActorType.Admin, "commission-payout.prepared",
                    "CommissionPayout", payout.Id, null, AuditSnapshot(payout));
                await _db.SaveChangesAsync(cancellationToken);
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return ToResponse(await RequirePayoutAsync(payout.Id, tracked: false, cancellationToken));
            });
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            _db.ChangeTracker.Clear();
            var winner = await _db.CommissionPayouts.AsNoTracking()
                .SingleOrDefaultAsync(item => item.IdempotencyKey == input.IdempotencyKey, cancellationToken);
            if (winner is not null) return await ReplayAsync(winner, fingerprint, cancellationToken);
            throw Conflict("commission_already_claimed", "One or more selected commissions already belong to an active payout.");
        }
    }

    public Task<CommissionPayoutResponse> MarkPaidAsync(Guid? actorUserId, Guid id,
        MarkCommissionPayoutPaidRequest request, CancellationToken cancellationToken = default) =>
        MutateAsync(actorUserId, id, (payout, admin, now) =>
        {
            var reference = Trimmed(request.PaymentReference);
            if (reference is null) throw Validation("paymentReference", "Enter the payout payment reference.");
            if (reference.Length > 200) throw Validation("paymentReference", "Keep the payment reference to 200 characters or fewer.");
            if (!Enum.IsDefined(request.PaymentMethod))
                throw Validation("paymentMethod", "Choose a valid payout payment method.");
            if (payout.Status == CommissionPayoutStatus.Paid)
            {
                if (payout.PaymentMethod == request.PaymentMethod && payout.PaymentReference == reference)
                    return false;
                throw Conflict("payout_already_paid", "This payout is already paid with different payment details.");
            }
            if (payout.Status == CommissionPayoutStatus.Cancelled)
                throw Conflict("payout_cancelled", "A cancelled payout cannot be paid.");
            ApplyConcurrency(payout, request.ConcurrencyToken);
            var active = payout.Items.Where(item => item.ReleasedAt == null).ToArray();
            if (active.Length == 0 || active.Length != payout.Items.Count)
                throw Conflict("payout_reconciliation_failed", "This payout's reserved commission set is incomplete.");
            if (active.Sum(item => item.CommissionAmountSnapshot) != payout.PreparedAmount)
                throw Conflict("payout_reconciliation_failed", "This payout total no longer reconciles to its items.");
            if (payout.Currency != MerchantSalesConstants.Currency
                || active.Any(item => item.CurrencySnapshot != MerchantSalesConstants.Currency))
                throw Conflict("unsupported_payout_currency", "Only MYR commission payouts are supported.");
            if (active.Any(item => item.SalesCommission is null
                || item.SalesCommission.Status != SalesCommissionStatus.Payable
                || !MatchesSnapshot(payout, item, item.SalesCommission)))
                throw Conflict("payout_reconciliation_failed", "One or more reserved commissions are no longer eligible for payment.");

            var before = AuditSnapshot(payout);
            foreach (var item in active)
                SalesCommissionTransitions.MarkPaid(item.SalesCommission!, admin.Id, now);
            payout.Status = CommissionPayoutStatus.Paid;
            payout.PaidAt = now;
            payout.PaidByAdminUserId = admin.Id;
            payout.PaymentMethod = request.PaymentMethod;
            payout.PaymentReference = reference;
            payout.UpdatedAt = now;
            _audit.Append(actorUserId, ActorType.Admin, "commission-payout.paid",
                "CommissionPayout", payout.Id, before, AuditSnapshot(payout));
            return true;
        }, cancellationToken);

    public Task<CommissionPayoutResponse> CancelAsync(Guid? actorUserId, Guid id,
        CancelCommissionPayoutRequest request, CancellationToken cancellationToken = default) =>
        MutateAsync(actorUserId, id, (payout, admin, now) =>
        {
            var reason = Trimmed(request.Reason);
            if (reason is null) throw Validation("reason", "Enter why this payout is being cancelled.");
            if (reason.Length > 1000) throw Validation("reason", "Keep the cancellation reason to 1,000 characters or fewer.");
            if (payout.Status == CommissionPayoutStatus.Cancelled)
            {
                if (payout.CancellationReason == reason) return false;
                throw Conflict("payout_already_cancelled", "This payout is already cancelled with a different reason.");
            }
            if (payout.Status == CommissionPayoutStatus.Paid)
                throw Conflict("payout_already_paid", "A paid payout cannot be cancelled.");
            ApplyConcurrency(payout, request.ConcurrencyToken);
            if (payout.Items.Count == 0 || payout.Items.Any(item => item.ReleasedAt != null)
                || payout.Items.Any(item => item.SalesCommission?.Status != SalesCommissionStatus.Payable))
                throw Conflict("payout_reconciliation_failed", "This payout's reserved commission set is incomplete.");
            var before = AuditSnapshot(payout);
            foreach (var item in payout.Items.Where(item => item.ReleasedAt == null))
            {
                item.ReleasedAt = now;
                item.ReleasedByAdminUserId = admin.Id;
                item.ReleaseReason = reason;
                item.UpdatedAt = now;
                _audit.Append(actorUserId, ActorType.Admin, "commission-payout.item-released",
                    "CommissionPayoutItem", item.Id, null,
                    new { payout.Id, payout.PayoutNumber, item.SalesCommissionId, item.ReleasedAt, item.ReleasedByAdminUserId, item.ReleaseReason });
            }
            payout.Status = CommissionPayoutStatus.Cancelled;
            payout.CancelledAt = now;
            payout.CancelledByAdminUserId = admin.Id;
            payout.CancellationReason = reason;
            payout.UpdatedAt = now;
            _audit.Append(actorUserId, ActorType.Admin, "commission-payout.cancelled",
                "CommissionPayout", payout.Id, before, AuditSnapshot(payout));
            return true;
        }, cancellationToken);

    private async Task<CommissionPayoutResponse> MutateAsync(Guid? actorUserId, Guid id,
        Func<CommissionPayout, AdminUser, DateTimeOffset, bool> mutation,
        CancellationToken cancellationToken)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = _db.Database.IsRelational()
                ? await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
                : null;
            await LockPayoutAsync(id, cancellationToken);
            var payout = await RequirePayoutAsync(id, tracked: true, cancellationToken);
            await LockCommissionsAsync(payout.Items.Select(item => item.SalesCommissionId).OrderBy(value => value).ToArray(), cancellationToken);
            var changed = mutation(payout, admin, _time.GetUtcNow());
            if (changed)
            {
                try { await _db.SaveChangesAsync(cancellationToken); }
                catch (DbUpdateConcurrencyException) { throw Conflict("concurrency_conflict", "Someone else changed this payout. Reload and try again."); }
            }
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            _db.ChangeTracker.Clear();
            return ToResponse(await RequirePayoutAsync(id, tracked: false, cancellationToken));
        });
    }

    private async Task LockPayoutAsync(Guid id, CancellationToken token)
    {
        if (_db.Database.IsSqlServer())
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT 1 FROM [CommissionPayouts] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {id}", token);
    }

    private async Task LockCommissionsAsync(IEnumerable<Guid> ids, CancellationToken token)
    {
        if (!_db.Database.IsSqlServer()) return;
        foreach (var id in ids.Distinct().OrderBy(value => value))
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT 1 FROM [SalesCommissions] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {id}", token);
    }

    private async Task<CommissionPayout> RequirePayoutAsync(Guid id, bool tracked, CancellationToken token)
    {
        var query = _db.CommissionPayouts
            .Include(item => item.Items).ThenInclude(item => item.SalesCommission)
            .Include(item => item.PreparedByAdminUser).ThenInclude(item => item!.User)
            .Include(item => item.PaidByAdminUser).ThenInclude(item => item!.User)
            .Include(item => item.CancelledByAdminUser).ThenInclude(item => item!.User)
            .AsQueryable();
        if (!tracked) query = query.AsNoTracking();
        return await query.SingleOrDefaultAsync(item => item.Id == id, token)
            ?? throw new ApiException(404, "commission_payout_not_found", "That commission payout no longer exists.");
    }

    private async Task<CommissionPayoutResponse> ReplayAsync(CommissionPayout existing,
        string fingerprint, CancellationToken token)
    {
        if (!string.Equals(existing.RequestFingerprint, fingerprint, StringComparison.Ordinal))
            throw Conflict("idempotency_key_conflict", "This request key was already used for a different payout.");
        return ToResponse(await RequirePayoutAsync(existing.Id, tracked: false, token));
    }

    private async Task<AdminUser> RequireAdminAsync(Guid? actorUserId, CancellationToken token)
    {
        if (!actorUserId.HasValue) throw new ApiException(401, "unauthorized", "Authentication is required.");
        return await _db.AdminUsers.SingleOrDefaultAsync(item => item.UserId == actorUserId.Value
                && item.IsActive && item.DisabledAt == null, token)
            ?? throw new ApiException(403, "forbidden", "Admin access is required.");
    }

    private void ApplyConcurrency(CommissionPayout payout, string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            if (_db.Database.IsRelational()) throw Validation("concurrencyToken", "Reload this payout and try again.");
            return;
        }
        byte[] expected;
        try { expected = Convert.FromBase64String(token); }
        catch (FormatException) { throw Validation("concurrencyToken", "That edit token is not valid. Reload and try again."); }
        if (!payout.RowVersion.SequenceEqual(expected))
            throw Conflict("concurrency_conflict", "Someone else changed this payout. Reload and try again.");
        _db.Entry(payout).Property(item => item.RowVersion).OriginalValue = expected;
    }

    private static PreparedInput ValidatePrepare(PrepareCommissionPayoutRequest request)
    {
        if (request.SalesCommissionIds is null || request.SalesCommissionIds.Count == 0)
            throw Validation("salesCommissionIds", "Select at least one payable commission.");
        var ids = request.SalesCommissionIds.OrderBy(value => value).ToArray();
        if (ids.Distinct().Count() != ids.Length)
            throw Validation("salesCommissionIds", "Each commission may be selected only once.");
        if (request.SalespersonId == Guid.Empty)
            throw Validation("salespersonId", "Choose the salesperson receiving this payout.");
        var from = request.PeriodFrom.ToUniversalTime();
        var to = request.PeriodToExclusive.ToUniversalTime();
        if (to <= from) throw Validation("periodToExclusive", "The payout period end must be later than its start.");
        if (request.ExpectedTotal < 0) throw Validation("expectedTotal", "The expected total cannot be negative.");
        var key = Trimmed(request.IdempotencyKey);
        if (key is null) throw Validation("idempotencyKey", "Provide a request key for this payout.");
        if (key.Length > 80) throw Validation("idempotencyKey", "Keep the request key to 80 characters or fewer.");
        var notes = Trimmed(request.Notes);
        if (notes?.Length > 2000) throw Validation("notes", "Keep notes to 2,000 characters or fewer.");
        return new(ids, request.SalespersonId, from, to, request.ExpectedTotal, key, notes);
    }

    private static string Fingerprint(PreparedInput input)
    {
        var canonical = string.Join('|', input.SalespersonId.ToString("N"),
            input.PeriodFrom.ToString("O", CultureInfo.InvariantCulture),
            input.PeriodToExclusive.ToString("O", CultureInfo.InvariantCulture),
            input.ExpectedTotal.ToString("0.00", CultureInfo.InvariantCulture),
            input.Notes ?? "", string.Join(';', input.CommissionIds.Select(id => id.ToString("N"))));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    private static CommissionPayoutStatus? ParseStatus(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null
        : Enum.TryParse<CommissionPayoutStatus>(value, true, out var parsed) ? parsed
        : throw Validation("status", "Choose a valid payout status.");

    private static string SourceOrderNumber(SalesCommission commission) => commission.SourceType switch
    {
        SalesCommissionSourceType.MerchantOrder => commission.MerchantOrder?.MerchantOrderNumber ?? "",
        SalesCommissionSourceType.TagOrder => commission.TagOrder?.OrderNumber ?? "",
        _ => "",
    };

    private static bool MatchesSnapshot(CommissionPayout payout, CommissionPayoutItem item,
        SalesCommission commission) =>
        commission.SalespersonId == payout.SalespersonId
        && commission.SourceType == item.SourceTypeSnapshot
        && commission.CommissionType == item.CommissionTypeSnapshot
        && commission.MerchantOrderId == item.MerchantOrderIdSnapshot
        && commission.TagOrderId == item.TagOrderIdSnapshot
        && commission.CommissionBaseAmount == item.CommissionBaseAmountSnapshot
        && commission.CommissionAmount == item.CommissionAmountSnapshot
        && commission.CommissionPercentageSnapshot == item.CommissionPercentageSnapshot
        && commission.CommissionFixedAmountSnapshot == item.CommissionFixedAmountSnapshot
        && commission.Currency == item.CurrencySnapshot
        && commission.CalculatedAt == item.CalculatedAtSnapshot
        && commission.CalculatedAt >= payout.PeriodFrom
        && commission.CalculatedAt < payout.PeriodToExclusive;

    private static CommissionPayoutSummaryResponse ToSummary(CommissionPayout payout)
    {
        var recovery = payout.Status == CommissionPayoutStatus.Paid
            ? payout.Items.Where(item => item.SalesCommission?.Status == SalesCommissionStatus.Reversed)
                .Sum(item => item.CommissionAmountSnapshot)
            : 0m;
        return new(payout.Id, payout.PayoutNumber, payout.SalespersonId,
            payout.SalespersonCodeSnapshot, payout.SalespersonNameSnapshot,
            payout.PeriodFrom, payout.PeriodToExclusive, payout.Currency, payout.PreparedAmount,
            payout.Status.ToString(), payout.Items.Count, recovery, payout.PreparedAt,
            payout.PaidAt, payout.CancelledAt, payout.PaymentMethod?.ToString(),
            payout.PaymentReference, Convert.ToBase64String(payout.RowVersion));
    }

    private static CommissionPayoutResponse ToResponse(CommissionPayout payout) => new(
        ToSummary(payout), payout.Seller, payout.PreparedByAdminUserId,
        AdminName(payout.PreparedByAdminUser) ?? "Administrator", payout.PaidByAdminUserId,
        AdminName(payout.PaidByAdminUser), payout.PaymentMethod?.ToString(),
        payout.PaymentReference, payout.Notes, payout.CancelledByAdminUserId,
        AdminName(payout.CancelledByAdminUser), payout.CancellationReason,
        payout.Items.OrderBy(item => item.CalculatedAtSnapshot).ThenBy(item => item.Id).Select(item =>
            new CommissionPayoutItemResponse(item.Id, item.SalesCommissionId,
                item.SourceTypeSnapshot.ToString(), item.CommissionTypeSnapshot.ToString(),
                item.MerchantOrderIdSnapshot, item.TagOrderIdSnapshot, item.SourceOrderNumberSnapshot,
                item.CommissionBaseAmountSnapshot, item.CommissionAmountSnapshot,
                item.CommissionPercentageSnapshot, item.CommissionFixedAmountSnapshot,
                item.CurrencySnapshot, item.CalculatedAtSnapshot,
                item.SalesCommission?.Status.ToString() ?? "Missing",
                item.SalesCommission?.ReversedAt, item.SalesCommission?.ReversalReason,
                item.ReleasedAt, item.ReleaseReason,
                payout.Status == CommissionPayoutStatus.Paid
                    && item.SalesCommission?.Status == SalesCommissionStatus.Reversed)).ToArray());

    private static string? AdminName(AdminUser? admin) =>
        admin?.User?.DisplayName?.Trim() is { Length: > 0 } name ? name : null;

    private static object AuditSnapshot(CommissionPayout payout) => new
    {
        payout.PayoutNumber, payout.SalespersonId, payout.SalespersonCodeSnapshot,
        payout.PeriodFrom, payout.PeriodToExclusive, payout.PreparedAmount, payout.Currency,
        Status = payout.Status.ToString(), payout.PreparedAt, payout.PreparedByAdminUserId,
        payout.PaidAt, payout.PaidByAdminUserId, PaymentMethod = payout.PaymentMethod?.ToString(),
        payout.PaymentReference,
        payout.CancelledAt, payout.CancelledByAdminUserId, payout.CancellationReason,
        CommissionIds = payout.Items.Select(item => item.SalesCommissionId).OrderBy(id => id).ToArray(),
    };

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is Microsoft.Data.SqlClient.SqlException sql && sql.Number is 2601 or 2627;
    private static string? Trimmed(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
    private static ApiException Conflict(string code, string message) => new(409, code, message);
    private sealed record PreparedInput(Guid[] CommissionIds, Guid SalespersonId,
        DateTimeOffset PeriodFrom, DateTimeOffset PeriodToExclusive, decimal ExpectedTotal,
        string IdempotencyKey, string? Notes);
}

internal static class SalesCommissionTransitions
{
    public static void MarkPaid(SalesCommission commission, Guid? adminUserId, DateTimeOffset now)
    {
        if (commission.Status != SalesCommissionStatus.Payable)
            throw new InvalidOperationException("Only a payable commission can be marked paid.");
        commission.Status = SalesCommissionStatus.Paid;
        commission.PaidAt = now;
        commission.PaidByAdminUserId = adminUserId;
        commission.UpdatedAt = now;
    }
}
