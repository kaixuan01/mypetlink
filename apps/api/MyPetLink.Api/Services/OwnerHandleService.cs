using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The handle lifecycle: claiming, renaming, and what happens to a name after
/// somebody gives it up.
///
/// A handle is an address people share and read as identity. Three protections
/// follow from that, and all three live here:
///
/// <list type="number">
/// <item>Names that would let an account look like MyPetLink, or sit where one
/// of our own routes sits, can never be claimed.</item>
/// <item>A rename is rate limited by a cooldown, because cycling through names
/// faster than anyone can report is what impersonation looks like.</item>
/// <item>A released name is held for a while, so a link shared last week does
/// not start resolving to a stranger's profile.</item>
/// </list>
///
/// Uniqueness is decided by the database. Two people submitting the same handle
/// at the same moment both pass the pre-check; the unique index lets exactly one
/// through and the loser is told the name is unavailable.
/// </summary>
public sealed class OwnerHandleService : SkeletonService, IOwnerHandleService
{
    private const string HandleUniqueIndexName = "IX_OwnerSocialProfiles_NormalizedHandle";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly SocialOptions _options;
    private readonly IAuditLogService _auditLog;
    private readonly TimeProvider _timeProvider;

    public OwnerHandleService(
        MyPetLinkDbContext dbContext,
        IOptions<SocialOptions> options,
        IAuditLogService auditLog,
        TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _options = options.Value;
        _auditLog = auditLog;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>
    /// Whether a well-formed handle is free for this account to take.
    ///
    /// The account's own current handle counts as claimable so re-submitting it
    /// is a harmless no-op, and a name this same account released earlier counts
    /// as claimable so its own hold does not lock it out.
    /// </summary>
    public async Task<bool> IsClaimableAsync(
        string normalizedHandle,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        if (OwnerHandleRules.IsSystemReserved(normalizedHandle))
        {
            return false;
        }

        var takenByAnother = await _dbContext.OwnerSocialProfiles
            .AnyAsync(
                profile => profile.NormalizedHandle == normalizedHandle && profile.UserId != userId,
                cancellationToken);

        if (takenByAnother)
        {
            return false;
        }

        var now = _timeProvider.GetUtcNow();
        var blockingReservation = await _dbContext.OwnerHandleReservations
            .AnyAsync(
                reservation => reservation.NormalizedHandle == normalizedHandle
                    && (reservation.HeldUntil == null || reservation.HeldUntil > now)
                    && (reservation.PreviousUserId == null || reservation.PreviousUserId != userId),
                cancellationToken);

        return !blockingReservation;
    }

    public async Task<DateTimeOffset?> GetChangeAvailableAtAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var lastChangedAt = await _dbContext.OwnerHandleHistories
            .Where(history => history.UserId == userId)
            .OrderByDescending(history => history.ChangedAt)
            .Select(history => (DateTimeOffset?)history.ChangedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (!lastChangedAt.HasValue)
        {
            return null;
        }

        var availableAt = lastChangedAt.Value.Add(_options.HandleRenameCooldown);
        return availableAt > _timeProvider.GetUtcNow() ? availableAt : null;
    }

    public async Task ClaimAsync(
        OwnerSocialProfile profile,
        string requestedHandle,
        CancellationToken cancellationToken = default)
    {
        var normalized = OwnerHandleRules.Normalize(requestedHandle);
        var shapeError = OwnerHandleRules.ValidateShape(normalized);

        if (shapeError is not null)
        {
            throw ValidationFailed("handle", shapeError);
        }

        var display = OwnerHandleRules.NormalizeForDisplay(requestedHandle)!;
        var previousHandle = profile.Handle;
        var previousNormalizedHandle = profile.NormalizedHandle;

        // Re-submitting the handle you already hold changes nothing and must not
        // burn the cooldown.
        if (string.Equals(previousNormalizedHandle, normalized, StringComparison.Ordinal))
        {
            if (!string.Equals(previousHandle, display, StringComparison.Ordinal))
            {
                // Same handle, different capitalisation. This is a display
                // preference, not a rename, so no cooldown and no history.
                profile.Handle = display;
                await _dbContext.SaveChangesAsync(cancellationToken);
            }

            return;
        }

        var isRename = !string.IsNullOrEmpty(previousNormalizedHandle);

        if (isRename)
        {
            var availableAt = await GetChangeAvailableAtAsync(profile.UserId, cancellationToken);

            if (availableAt.HasValue)
            {
                throw new ApiException(
                    StatusCodes.Status422UnprocessableEntity,
                    "handle_change_not_available",
                    $"You can change your handle again after {availableAt.Value.UtcDateTime:d MMMM yyyy}.");
            }
        }

        if (!await IsClaimableAsync(normalized!, profile.UserId, cancellationToken))
        {
            throw HandleUnavailable();
        }

        profile.Handle = display;
        profile.NormalizedHandle = normalized;

        if (isRename)
        {
            _dbContext.OwnerHandleHistories.Add(new OwnerHandleHistory
            {
                UserId = profile.UserId,
                Handle = previousHandle ?? previousNormalizedHandle!,
                NormalizedHandle = previousNormalizedHandle!,
                ChangedAt = _timeProvider.GetUtcNow()
            });

            await HoldReleasedHandleAsync(previousNormalizedHandle!, profile.UserId, cancellationToken);
        }

        // Claiming the handle also releases any hold this same account was
        // carrying on it, so reclaiming a name you previously used does not
        // leave a stale reservation behind to trip up a later rename.
        await ClearOwnReservationAsync(normalized!, profile.UserId, cancellationToken);

        _auditLog.Append(
            profile.UserId,
            ActorType.Owner,
            isRename ? "OwnerSocialHandleRenamed" : "OwnerSocialHandleClaimed",
            nameof(OwnerSocialProfile),
            profile.Id,
            new { Handle = previousHandle },
            new { Handle = display });

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            UniqueConstraintViolation.IsFor(exception, HandleUniqueIndexName)
            || UniqueConstraintViolation.IsFor(exception, "OwnerHandleReservations"))
        {
            // Two accounts submitted the same handle at the same moment. The
            // index decided; this one lost and is told the same thing anyone
            // else would be told.
            throw HandleUnavailable();
        }
    }

    /// <summary>
    /// Holds a just-released handle so it cannot immediately be taken by someone
    /// else. The previous holder is recorded so they can reclaim it themselves,
    /// and so support can answer "who used to be @x".
    /// </summary>
    private async Task HoldReleasedHandleAsync(
        string normalizedHandle,
        Guid previousUserId,
        CancellationToken cancellationToken)
    {
        if (OwnerHandleRules.IsSystemReserved(normalizedHandle))
        {
            return;
        }

        var heldUntil = _timeProvider.GetUtcNow().Add(_options.ReleasedHandleHold);
        var existing = await _dbContext.OwnerHandleReservations
            .SingleOrDefaultAsync(
                reservation => reservation.NormalizedHandle == normalizedHandle,
                cancellationToken);

        if (existing is null)
        {
            _dbContext.OwnerHandleReservations.Add(new OwnerHandleReservation
            {
                NormalizedHandle = normalizedHandle,
                Reason = OwnerHandleReservationReason.Released,
                HeldUntil = heldUntil,
                PreviousUserId = previousUserId
            });

            return;
        }

        // Never weaken a System or Moderation reservation into a Released one.
        if (existing.Reason != OwnerHandleReservationReason.Released)
        {
            return;
        }

        existing.HeldUntil = heldUntil;
        existing.PreviousUserId = previousUserId;
    }

    private async Task ClearOwnReservationAsync(
        string normalizedHandle,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var reservation = await _dbContext.OwnerHandleReservations
            .SingleOrDefaultAsync(
                item => item.NormalizedHandle == normalizedHandle
                    && item.Reason == OwnerHandleReservationReason.Released
                    && item.PreviousUserId == userId,
                cancellationToken);

        if (reservation is not null)
        {
            _dbContext.OwnerHandleReservations.Remove(reservation);
        }
    }

    /// <summary>
    /// One message for every unavailable reason. Taken, system-reserved, held
    /// after release and screened-out all answer identically, so this endpoint
    /// cannot be used to work out which handles exist or who holds them.
    /// </summary>
    private static ApiException HandleUnavailable()
    {
        return new ApiException(
            StatusCodes.Status409Conflict,
            "handle_unavailable",
            "That handle isn't available. Try another one.");
    }

    private static ApiException ValidationFailed(string field, string message)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
    }
}
