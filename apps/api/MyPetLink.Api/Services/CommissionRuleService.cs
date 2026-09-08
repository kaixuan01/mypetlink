using System.Data;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ICommissionRuleService
{
    Task<(IReadOnlyCollection<CommissionRuleResponse> Items, int Total)> ListAsync(
        int page, int pageSize, Guid? salespersonId, bool? isActive,
        CancellationToken cancellationToken);
    Task<CommissionRuleResponse> CreateAsync(
        Guid? actorId, UpsertCommissionRuleRequest request, CancellationToken cancellationToken);
    Task<CommissionRuleResponse> UpdateAsync(
        Guid? actorId, Guid id, UpsertCommissionRuleRequest request,
        CancellationToken cancellationToken);
}

public sealed class CommissionRuleService : ICommissionRuleService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public CommissionRuleService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    public async Task<(IReadOnlyCollection<CommissionRuleResponse> Items, int Total)> ListAsync(
        int page,
        int pageSize,
        Guid? salespersonId,
        bool? isActive,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.CommissionRules
            .AsNoTracking()
            .Include(item => item.Salesperson)
            .AsQueryable();
        if (salespersonId.HasValue)
            query = query.Where(item => item.SalespersonId == salespersonId.Value);
        if (isActive.HasValue)
            query = query.Where(item => item.IsActive == isActive.Value);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(item => item.CommissionType)
            .ThenBy(item => item.SalespersonId == null ? 0 : 1)
            .ThenByDescending(item => item.EffectiveFrom)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);
        return (items.Select(ToResponse).ToArray(), total);
    }

    public Task<CommissionRuleResponse> CreateAsync(
        Guid? actorId,
        UpsertCommissionRuleRequest request,
        CancellationToken cancellationToken) =>
        SaveAsync(actorId, null, request, cancellationToken);

    public Task<CommissionRuleResponse> UpdateAsync(
        Guid? actorId,
        Guid id,
        UpsertCommissionRuleRequest request,
        CancellationToken cancellationToken) =>
        SaveAsync(actorId, id, request, cancellationToken);

    private async Task<CommissionRuleResponse> SaveAsync(
        Guid? actorId,
        Guid? id,
        UpsertCommissionRuleRequest request,
        CancellationToken cancellationToken)
    {
        var type = ParseAndValidate(request);
        var strategy = _dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = _dbContext.Database.IsRelational()
                ? await _dbContext.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable, cancellationToken)
                : null;

            CommissionRule rule;
            object? before = null;
            if (id.HasValue)
            {
                rule = await _dbContext.CommissionRules
                    .Include(item => item.Salesperson)
                    .SingleOrDefaultAsync(item => item.Id == id.Value, cancellationToken)
                    ?? throw new ApiException(404, "commission_rule_not_found",
                        "That commission rule no longer exists.");
                ApplyConcurrency(rule, request.ConcurrencyToken);
                before = Snapshot(rule);
            }
            else
            {
                rule = new CommissionRule
                {
                    CreatedAt = _timeProvider.GetUtcNow(),
                };
                _dbContext.CommissionRules.Add(rule);
            }

            var salesperson = await RequireSalespersonAsync(request.SalespersonId, cancellationToken);
            var adminId = actorId.HasValue
                ? await _dbContext.AdminUsers
                    .Where(item => item.UserId == actorId.Value)
                    .Select(item => (Guid?)item.Id)
                    .SingleOrDefaultAsync(cancellationToken)
                : null;
            Apply(rule, request, type, salesperson, adminId);
            await RejectOverlapAsync(rule, cancellationToken);

            _auditLogService.Append(
                actorId,
                ActorType.Admin,
                id.HasValue ? "commission-rule.update" : "commission-rule.create",
                "CommissionRule",
                rule.Id,
                before,
                Snapshot(rule));

            try
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                throw new ApiException(409, "concurrency_conflict",
                    "Someone else changed this commission rule. Reload and try again.");
            }
            catch (DbUpdateException exception) when (
                UniqueConstraintViolation.IsFor(
                    exception,
                    "IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom"))
            {
                throw new ApiException(409, "commission_rule_overlap",
                    "An active commission rule already covers part of that period and quantity range.");
            }

            rule.Salesperson = salesperson;
            return ToResponse(rule);
        });
    }

    private static SalesCommissionType ParseAndValidate(UpsertCommissionRuleRequest request)
    {
        if (!Enum.TryParse<SalesCommissionType>(request.CommissionType, true, out var type)
            || type != SalesCommissionType.DirectRetailPercentage)
        {
            throw Validation("commissionType",
                "Direct retail percentage is the only commission rule available in this release.");
        }
        if (!request.Percentage.HasValue || request.Percentage < 0m || request.Percentage > 100m)
            throw Validation("percentage", "Enter a percentage between 0 and 100.");
        if (decimal.Round(request.Percentage.Value, 2, MidpointRounding.AwayFromZero)
            != request.Percentage.Value)
        {
            throw Validation("percentage", "Use no more than two decimal places.");
        }
        if (request.FixedAmount.HasValue)
            throw Validation("fixedAmount", "Direct retail commission uses a percentage, not a fixed amount.");
        if (!string.Equals(request.Currency?.Trim(), MerchantSalesConstants.Currency,
                StringComparison.OrdinalIgnoreCase))
            throw Validation("currency", "Direct retail commission rules must use MYR.");
        if (request.EffectiveFrom == default)
            throw Validation("effectiveFrom", "Choose when this rule takes effect.");
        if (request.EffectiveTo.HasValue && request.EffectiveTo <= request.EffectiveFrom)
            throw Validation("effectiveTo", "The end must be after the start.");
        if (request.MinQuantity is <= 0)
            throw Validation("minQuantity", "Minimum quantity must be at least 1.");
        if (request.MaxQuantity is <= 0)
            throw Validation("maxQuantity", "Maximum quantity must be at least 1.");
        if (request.MinQuantity.HasValue && request.MaxQuantity < request.MinQuantity)
            throw Validation("maxQuantity", "Maximum quantity cannot be below the minimum.");
        if (request.EligibilityMonths.HasValue)
            throw Validation("eligibilityMonths",
                "Eligibility months are reserved for a later reseller commission phase.");
        return type;
    }

    private async Task<Salesperson?> RequireSalespersonAsync(
        Guid? salespersonId,
        CancellationToken cancellationToken)
    {
        if (!salespersonId.HasValue) return null;
        var salesperson = await _dbContext.Salespersons.SingleOrDefaultAsync(
            item => item.Id == salespersonId.Value, cancellationToken)
            ?? throw Validation("salespersonId", "Choose an existing salesperson.");
        return salesperson;
    }

    private async Task RejectOverlapAsync(
        CommissionRule candidate,
        CancellationToken cancellationToken)
    {
        if (!candidate.IsActive) return;

        var possible = await _dbContext.CommissionRules
            .Where(item => item.Id != candidate.Id
                && item.IsActive
                && item.CommissionType == candidate.CommissionType
                && item.SalespersonId == candidate.SalespersonId
                && (item.EffectiveTo == null || item.EffectiveTo > candidate.EffectiveFrom)
                && (candidate.EffectiveTo == null || item.EffectiveFrom < candidate.EffectiveTo))
            .Select(item => new { item.MinQuantity, item.MaxQuantity })
            .ToListAsync(cancellationToken);

        var overlaps = possible.Any(item =>
            (item.MaxQuantity ?? int.MaxValue) >= (candidate.MinQuantity ?? 1)
            && (candidate.MaxQuantity ?? int.MaxValue) >= (item.MinQuantity ?? 1));
        if (overlaps)
        {
            throw new ApiException(409, "commission_rule_overlap",
                "An active commission rule already covers part of that period and quantity range.");
        }
    }

    private void Apply(
        CommissionRule rule,
        UpsertCommissionRuleRequest request,
        SalesCommissionType type,
        Salesperson? salesperson,
        Guid? actorId)
    {
        rule.CommissionType = type;
        rule.SalespersonId = salesperson?.Id;
        rule.Salesperson = salesperson;
        rule.Percentage = request.Percentage;
        rule.FixedAmount = null;
        rule.MinQuantity = request.MinQuantity;
        rule.MaxQuantity = request.MaxQuantity;
        rule.EligibilityMonths = null;
        rule.Currency = MerchantSalesConstants.Currency;
        rule.EffectiveFrom = request.EffectiveFrom.ToUniversalTime();
        rule.EffectiveTo = request.EffectiveTo?.ToUniversalTime();
        rule.IsActive = request.IsActive;
        rule.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        rule.UpdatedByAdminUserId = actorId;
        rule.UpdatedAt = _timeProvider.GetUtcNow();
    }

    private void ApplyConcurrency(CommissionRule rule, string? token)
    {
        byte[] expected;
        try { expected = Convert.FromBase64String(token ?? ""); }
        catch (FormatException) { throw Validation("concurrencyToken", "Reload this rule and try again."); }
        if (!rule.RowVersion.SequenceEqual(expected))
            throw new ApiException(409, "concurrency_conflict",
                "Someone else changed this commission rule. Reload and try again.");
        _dbContext.Entry(rule).Property(item => item.RowVersion).OriginalValue = expected;
    }

    private static CommissionRuleResponse ToResponse(CommissionRule item) => new(
        item.Id,
        item.CommissionType.ToString(),
        item.SalespersonId,
        item.Salesperson?.SalespersonCode,
        item.Salesperson?.Name,
        item.Percentage,
        item.FixedAmount,
        item.MinQuantity,
        item.MaxQuantity,
        item.EligibilityMonths,
        item.Currency,
        item.EffectiveFrom,
        item.EffectiveTo,
        item.IsActive,
        item.Notes,
        item.UpdatedByAdminUserId,
        item.CreatedAt,
        item.UpdatedAt,
        Convert.ToBase64String(item.RowVersion));

    private static object Snapshot(CommissionRule item) => new
    {
        CommissionType = item.CommissionType.ToString(),
        item.SalespersonId,
        item.Percentage,
        item.FixedAmount,
        item.MinQuantity,
        item.MaxQuantity,
        item.EligibilityMonths,
        item.Currency,
        item.EffectiveFrom,
        item.EffectiveTo,
        item.IsActive,
        item.Notes,
        item.UpdatedByAdminUserId
    };

    private static ApiException Validation(string field, string message) => new(
        400,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
