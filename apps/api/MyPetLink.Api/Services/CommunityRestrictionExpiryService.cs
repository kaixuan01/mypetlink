using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ICommunityRestrictionExpiryService
{
    /// <summary>
    /// Ends every timed Community restriction whose end has passed, restoring
    /// each household's own Community choice. Returns how many ended.
    /// </summary>
    Task<int> ExpireDueRestrictionsAsync(int batchSize, CancellationToken cancellationToken = default);
}

/// <summary>
/// Ends timed Community restrictions on time, so no moderator ever has to
/// remember to lift a 24-hour, 7-day or 30-day restriction.
///
/// Each one is ended exactly as a moderator's Lift would end it
/// (<see cref="CommunityModeration.LiftRestriction"/>), under the same household
/// lock every moderation action takes, after re-reading the restriction: one
/// lifted or given a new end in the meantime is left alone, and a second worker
/// instance finds nothing left to do. The household's history records the
/// expiry with no moderator, and the audit log with the System actor.
/// </summary>
public sealed class CommunityRestrictionExpiryService : ICommunityRestrictionExpiryService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<CommunityRestrictionExpiryService> _logger;

    public CommunityRestrictionExpiryService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider,
        ILogger<CommunityRestrictionExpiryService> logger)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<int> ExpireDueRestrictionsAsync(
        int batchSize,
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();
        var dueOwnerIds = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile => profile.CommunityRestrictedAt != null
                && profile.CommunityRestrictedUntil != null
                && profile.CommunityRestrictedUntil <= now)
            .OrderBy(profile => profile.CommunityRestrictedUntil)
            .Take(Math.Clamp(batchSize, 1, 200))
            .Select(profile => profile.UserId)
            .ToListAsync(cancellationToken);

        var ended = 0;
        foreach (var ownerId in dueOwnerIds)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            try
            {
                if (await TryExpireAsync(ownerId, cancellationToken))
                {
                    ended++;
                }
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // One household must not stop the batch; it is tried again on
                // the next cycle. Only the account id is logged.
                _logger.LogError(
                    exception,
                    "Failed to end the Community restriction for owner {OwnerId}.",
                    ownerId);
            }
        }

        if (ended > 0)
        {
            _logger.LogInformation("Ended {EndedCount} timed Community restrictions.", ended);
        }

        return ended;
    }

    private Task<bool> TryExpireAsync(Guid ownerId, CancellationToken cancellationToken) =>
        CommunityModerationTransaction.RunAsync(
            _dbContext,
            [CommunityModerationTransaction.HouseholdLock(ownerId)],
            async () =>
            {
                var profile = await _dbContext.OwnerSocialProfiles
                    .SingleOrDefaultAsync(item => item.UserId == ownerId, cancellationToken);
                var now = _timeProvider.GetUtcNow();
                if (profile is null || !CommunityModeration.IsRestrictionDue(profile, now))
                {
                    return false;
                }

                var previous = new
                {
                    restricted = true,
                    restrictedAt = profile.CommunityRestrictedAt,
                    restrictedUntil = profile.CommunityRestrictedUntil,
                    ownerChoice = profile.CommunityEnabledBeforeRestriction
                };
                CommunityModeration.LiftRestriction(profile);
                var action = CommunityModerationHistory.Record(
                    _dbContext,
                    ownerId,
                    CommunityModerationActionType.CommunityRestrictionExpired,
                    reason: null,
                    internalRemark: null,
                    performedByUserId: null,
                    now);
                _auditLogService.Append(
                    null,
                    ActorType.System,
                    CommunityModerationAudit.HouseholdRestrictionExpired,
                    CommunityModerationAudit.HouseholdEntity,
                    profile.Id,
                    previous,
                    new
                    {
                        restricted = false,
                        communityEnabled = profile.IsSocialEnabled,
                        ownerId,
                        moderationActionId = action.Id
                    });

                await _dbContext.SaveChangesAsync(cancellationToken);
                return true;
            },
            "The restriction changed while it was ending.",
            cancellationToken);
}
