using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
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
    /// An owner's current handle and whether it is a protected name, for the
    /// admin screen. Reads one profile row and carries no account or finder
    /// identity.
    /// </summary>
    public async Task<AdminOwnerSocialHandleResponse> GetOwnerHandleAsync(
        Guid targetUserId,
        CancellationToken cancellationToken = default)
    {
        var profile = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(item => item.UserId == targetUserId)
            .Select(item => new
            {
                item.Handle,
                item.NormalizedHandle,
                item.IsSocialEnabled
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (profile is null)
        {
            // Every account gets a row on first read of its own settings, so an
            // owner who has never opened the social screen has none yet. That is
            // a real state, not an error: report it as "no handle".
            return new AdminOwnerSocialHandleResponse(targetUserId, null, false, false);
        }

        return new AdminOwnerSocialHandleResponse(
            targetUserId,
            profile.Handle,
            OwnerHandleRules.IsSystemReserved(profile.NormalizedHandle),
            profile.IsSocialEnabled);
    }

    /// <summary>
    /// Gives a reserved handle to a social profile, on an administrator's
    /// authority.
    ///
    /// This is the only way <c>@mypetlink</c> can ever be held, and it is
    /// deliberately a different door from <see cref="ClaimAsync"/> rather than a
    /// flag on it: the self-service path must have no parameter, header or body
    /// field that could widen what it is allowed to do. Authorization is the
    /// caller's problem and is enforced at the controller by an admin
    /// capability; this method assumes it has already been established.
    ///
    /// What it will not do:
    /// <list type="bullet">
    /// <item>assign a name that is <b>not</b> reserved — ordinary handles go
    /// through the owner's own screen, so this cannot become a way to hand
    /// somebody a name another person was about to take;</item>
    /// <item>take a reserved handle off a profile that currently holds it
    /// unless the caller explicitly asked to reassign it;</item>
    /// <item>enable Social, or change any other part of the profile.</item>
    /// </list>
    ///
    /// The reservation row is left exactly as it is. A System reservation is
    /// what keeps the name unclaimable, and it has to outlive the assignment —
    /// otherwise the day this profile gives the handle up, the brand name would
    /// fall into the public pool.
    /// </summary>
    public async Task<OwnerSocialProfile> AssignReservedHandleAsync(
        Guid adminUserId,
        Guid targetUserId,
        string requestedHandle,
        bool confirmReassign,
        CancellationToken cancellationToken = default)
    {
        var normalized = OwnerHandleRules.Normalize(requestedHandle);
        var shapeError = OwnerHandleRules.ValidateShape(normalized);

        if (shapeError is not null)
        {
            throw ValidationFailed("handle", shapeError);
        }

        if (!OwnerHandleRules.IsSystemReserved(normalized))
        {
            // Not a brand or route name. An owner can take this themselves, and
            // an administrator handing out ordinary names would be a way around
            // the cooldown and the release hold.
            throw ValidationFailed(
                "handle",
                "This is not a reserved handle. Only protected names are assigned here.");
        }

        var profile = await _dbContext.OwnerSocialProfiles
            .SingleOrDefaultAsync(item => item.UserId == targetUserId, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status404NotFound,
                "not_found",
                "This owner does not have a social profile yet.");

        var currentHolder = await _dbContext.OwnerSocialProfiles
            .Where(item => item.NormalizedHandle == normalized)
            .Select(item => new { item.UserId })
            .SingleOrDefaultAsync(cancellationToken);

        if (currentHolder is not null && currentHolder.UserId == targetUserId)
        {
            // Already theirs. Nothing to do, and nothing to record.
            return profile;
        }

        if (currentHolder is not null && !confirmReassign)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "reserved_handle_assigned",
                "Another social profile already holds this reserved handle. "
                + "Reassign it explicitly if that is what you intend.");
        }

        var display = OwnerHandleRules.NormalizeForDisplay(requestedHandle)!;
        var previousHandle = profile.Handle;
        var previousNormalizedHandle = profile.NormalizedHandle;
        var isRename = !string.IsNullOrEmpty(previousNormalizedHandle);

        // The owner's 30-day rename cooldown is deliberately NOT applied. It
        // exists to stop an account cycling through names faster than anyone can
        // report it; an administrator acting under an audited capability is not
        // that, and letting a stale cooldown block the brand identity would make
        // the recovery path unusable exactly when it is needed.
        if (currentHolder is not null)
        {
            var previousHolderProfile = await _dbContext.OwnerSocialProfiles
                .SingleAsync(item => item.NormalizedHandle == normalized, cancellationToken);

            _dbContext.OwnerHandleHistories.Add(new OwnerHandleHistory
            {
                UserId = previousHolderProfile.UserId,
                Handle = previousHolderProfile.Handle ?? normalized!,
                NormalizedHandle = normalized!,
                ChangedAt = _timeProvider.GetUtcNow()
            });

            previousHolderProfile.Handle = null;
            previousHolderProfile.NormalizedHandle = null;
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

            // The name they gave up follows the ordinary hold, so a link shared
            // last week does not start resolving to somebody else.
            await HoldReleasedHandleAsync(previousNormalizedHandle!, profile.UserId, cancellationToken);
        }

        _auditLog.Append(
            adminUserId,
            ActorType.Admin,
            "OwnerSocialReservedHandleAssigned",
            nameof(OwnerSocialProfile),
            profile.Id,
            new { TargetUserId = targetUserId, Handle = previousHandle },
            new { TargetUserId = targetUserId, Handle = display, Reassigned = currentHolder is not null });

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            UniqueConstraintViolation.IsFor(exception, HandleUniqueIndexName))
        {
            // Two administrators aimed the same reserved handle at two profiles
            // at the same moment. The unique index decides; this one lost.
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "reserved_handle_assigned",
                "Another social profile already holds this reserved handle. "
                + "Reload and try again.");
        }

        return profile;
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
