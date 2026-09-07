using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IOwnerReferralAttributionService
{
    Task<(IReadOnlyCollection<OwnerReferralAttributionResponse> Items, int Total)> ListAsync(
        int page, int pageSize, string? search, CancellationToken cancellationToken);
    Task<OwnerReferralAttributionResponse> GetAsync(Guid userId, CancellationToken cancellationToken);
    Task<OwnerReferralAttributionResponse> CorrectAsync(
        Guid? actorId, Guid userId, CorrectOwnerReferralAttributionRequest request,
        CancellationToken cancellationToken);
}

public sealed class OwnerReferralAttributionService : IOwnerReferralAttributionService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public OwnerReferralAttributionService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    public async Task<(IReadOnlyCollection<OwnerReferralAttributionResponse> Items, int Total)> ListAsync(
        int page, int pageSize, string? search, CancellationToken cancellationToken)
    {
        var query = Query();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(item =>
                item.User.Email.Contains(term)
                || item.User.DisplayName.Contains(term)
                || item.SalespersonNameSnapshot.Contains(term)
                || item.SalespersonCodeSnapshot.Contains(term)
                || item.ReferralCodeSnapshot.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(item => item.AttributedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        return (items.Select(ToResponse).ToArray(), total);
    }

    public async Task<OwnerReferralAttributionResponse> GetAsync(
        Guid userId, CancellationToken cancellationToken) =>
        ToResponse(await RequireAsync(userId, false, cancellationToken));

    public async Task<OwnerReferralAttributionResponse> CorrectAsync(
        Guid? actorId,
        Guid userId,
        CorrectOwnerReferralAttributionRequest request,
        CancellationToken cancellationToken)
    {
        var attribution = await RequireAsync(userId, true, cancellationToken);
        ApplyConcurrency(attribution, request.ConcurrencyToken);

        var salesperson = await _dbContext.Salespersons.SingleOrDefaultAsync(
            item => item.Id == request.SalespersonId, cancellationToken)
            ?? throw NotFound("That salesperson could not be found.");
        if (!salesperson.IsActive || string.IsNullOrWhiteSpace(salesperson.ReferralCode))
        {
            throw Validation("salespersonId",
                "Choose an active salesperson with a public referral code.");
        }

        var before = Snapshot(attribution);
        var now = _timeProvider.GetUtcNow();
        attribution.SalespersonId = salesperson.Id;
        attribution.ReferralCodeSnapshot = salesperson.ReferralCode;
        attribution.SalespersonCodeSnapshot = salesperson.SalespersonCode;
        attribution.SalespersonNameSnapshot = salesperson.Name;
        attribution.AttributionSource = ReferralAttributionSource.ManualAdmin;
        attribution.CapturedAt = now;
        attribution.AttributedAt = now;
        attribution.UpdatedAt = now;

        _auditLogService.Append(
            actorId,
            ActorType.Admin,
            "owner-referral-attribution.correct",
            "OwnerReferralAttribution",
            attribution.Id,
            before,
            Snapshot(attribution));

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(409, "concurrency_conflict",
                "Someone else changed this attribution. Reload and try again.");
        }

        return ToResponse(await RequireAsync(userId, false, cancellationToken));
    }

    private IQueryable<OwnerReferralAttribution> Query(bool tracked = false)
    {
        var query = _dbContext.OwnerReferralAttributions
            .Include(item => item.User)
            .AsQueryable();
        return tracked ? query : query.AsNoTracking();
    }

    private async Task<OwnerReferralAttribution> RequireAsync(
        Guid userId, bool tracked, CancellationToken cancellationToken) =>
        await Query(tracked).SingleOrDefaultAsync(item => item.UserId == userId, cancellationToken)
        ?? throw NotFound("Referral attribution was not found for this owner.");

    private void ApplyConcurrency(OwnerReferralAttribution attribution, string token)
    {
        byte[] expected;
        try { expected = Convert.FromBase64String(token); }
        catch (FormatException) { throw Validation("concurrencyToken", "Reload this attribution and try again."); }

        if (!attribution.RowVersion.SequenceEqual(expected))
        {
            throw new ApiException(409, "concurrency_conflict",
                "Someone else changed this attribution. Reload and try again.");
        }
        _dbContext.Entry(attribution).Property(item => item.RowVersion).OriginalValue = expected;
    }

    private static OwnerReferralAttributionResponse ToResponse(OwnerReferralAttribution item) => new(
        item.UserId, item.User.DisplayName, item.User.Email, item.SalespersonId,
        item.SalespersonCodeSnapshot, item.SalespersonNameSnapshot,
        item.ReferralCodeSnapshot, item.AttributionSource, item.CapturedAt,
        item.AttributedAt, item.UpdatedAt, Convert.ToBase64String(item.RowVersion));

    private static object Snapshot(OwnerReferralAttribution item) => new
    {
        item.UserId,
        item.SalespersonId,
        item.ReferralCodeSnapshot,
        item.SalespersonCodeSnapshot,
        item.SalespersonNameSnapshot,
        item.AttributionSource,
        item.CapturedAt,
        item.AttributedAt
    };

    private static ApiException NotFound(string message) =>
        new(404, "referral_attribution_not_found", message);

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
}
