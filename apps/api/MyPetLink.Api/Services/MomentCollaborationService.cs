using System.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// Consent-based collaboration on a public Moment.
///
/// <b>The Moment stays its author's.</b> Authority to invite, see outgoing
/// state and revoke comes from <see cref="PetMemory.AuthorUserId"/>, never
/// from who currently owns the primary pet, so a future transfer of that pet
/// cannot hand collaboration controls to its new owner. Inviting additionally
/// requires the author to still manage the Moment (own its primary pet), the
/// same rule every ordinary Moment edit already applies. A collaborator decides
/// only whether their household joins, which of the requested pets take part,
/// and whether to leave.
///
/// <b>Consent before association.</b> A Pending invitation never creates a
/// <see cref="MomentPet"/>. Accepting creates rows for exactly the chosen
/// requested pets, tagged with the collaboration; Revoke, Leave and a Block
/// delete exactly those rows. The collaboration and its requested pets stay
/// as history.
///
/// <b>Concurrency.</b> Invitations serialize on a per-Moment SQL application
/// lock (the live-household cap) and a per-household-pair lock (shared with
/// Block, so an invitation and a block between the same two households cannot
/// interleave). Every state change after that is a RowVersion-checked update
/// inside a retrying transaction: whichever commits first wins, and the loser
/// answers with the state that won.
/// </summary>
public sealed class MomentCollaborationService : SkeletonService, IMomentCollaborationService
{
    public const int MaxLiveHouseholds = 3;
    public const int MaxPendingPerHousehold = 3;
    public const int MaxInvitationsPerDay = 30;
    public const int MaxPetsPerInvitation = 10;
    public const int MaxCandidateResults = 10;
    public static readonly TimeSpan InvitationLifetime = TimeSpan.FromDays(14);

    private static readonly OwnerNotificationType[] RequestActivity =
        [OwnerNotificationType.MomentCollaborationRequested];

    private static readonly OwnerNotificationType[] AllActivity =
    [
        OwnerNotificationType.MomentCollaborationRequested,
        OwnerNotificationType.MomentCollaborationAccepted
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IOwnerNotificationService _notifications;
    private readonly CloudflareR2Options _r2Options;

    public MomentCollaborationService(
        MyPetLinkDbContext dbContext,
        IOwnerNotificationService notifications,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _notifications = notifications;
        _r2Options = r2Options.Value;
    }

    // ---- candidates -----------------------------------------------------

    public async Task<CollaborationCandidatesResponse> GetCandidatesAsync(
        Guid? currentUserId,
        string? query,
        Guid? momentId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        await RequireUsableIdentityAsync(actorId, cancellationToken);

        var term = (query ?? "").Trim();
        if (term.Length > SocialDiscoveryService.MaximumSearchLength)
        {
            term = term[..SocialDiscoveryService.MaximumSearchLength];
        }

        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, actorId);
        var households = UsableProfiles()
            .Where(profile =>
                profile.UserId != actorId
                && !blocked.Contains(profile.UserId)
                && _dbContext.Pets.Any(pet =>
                    pet.OwnerUserId == profile.UserId
                    && pet.DeletedAt == null
                    && pet.LifecycleStatus == PetLifecycleStatus.Active
                    && pet.PublicProfile != null
                    && pet.PublicProfile.IsPublicProfileEnabled
                    && pet.SocialProfile != null
                    && pet.SocialProfile.IsSocialEnabled
                    && pet.SocialProfile.ConsentedByUserId == pet.OwnerUserId));

        var searching = term.Length >= SocialDiscoveryService.MinimumSearchLength;
        if (searching)
        {
            var prefix = LikePrefix(term.ToLowerInvariant());
            households = households.Where(profile =>
                EF.Functions.Like(profile.NormalizedHandle!, prefix)
                || EF.Functions.Like(profile.NormalizedDisplayName!, prefix));
        }

        var followedIds = _dbContext.OwnerFollows
            .Where(follow => follow.FollowerUserId == actorId)
            .Select(follow => follow.FollowedUserId);

        // Households the author already follows come first and are the only
        // ones offered before typing. Anybody else must be discoverable: an
        // invitation box is not a way to find a household that chose not to
        // be found.
        var followed = await households
            .Where(profile => followedIds.Contains(profile.UserId))
            .OrderBy(profile => profile.NormalizedDisplayName)
            .Take(MaxCandidateResults)
            .Select(profile => new CandidateRow(
                profile.UserId,
                profile.Handle!,
                profile.DisplayName!,
                profile.AvatarMediaFile,
                true))
            .ToListAsync(cancellationToken);

        var discoverable = searching
            ? await households
                .Where(profile =>
                    profile.IsDiscoverable && !followedIds.Contains(profile.UserId))
                .OrderBy(profile => profile.NormalizedDisplayName)
                .Take(MaxCandidateResults)
                .Select(profile => new CandidateRow(
                    profile.UserId,
                    profile.Handle!,
                    profile.DisplayName!,
                    profile.AvatarMediaFile,
                    false))
                .ToListAsync(cancellationToken)
            : [];

        var rows = followed.Concat(discoverable).ToList();
        var userIds = rows.Select(row => row.UserId).ToArray();

        var pets = await EligiblePets()
            .Where(pet => userIds.Contains(pet.OwnerUserId))
            .OrderBy(pet => pet.Name)
            .Select(pet => new
            {
                pet.OwnerUserId,
                pet.Name,
                pet.Slug,
                Photo = pet.ProfileMediaFile
            })
            .ToListAsync(cancellationToken);

        var states = momentId.HasValue
            ? await LoadInvitationStatesAsync(actorId, momentId.Value, userIds, cancellationToken)
            : new Dictionary<Guid, string>();

        return new CollaborationCandidatesResponse(
            term,
            rows
                .Select(row => new CollaborationCandidateResponse(
                    Attribution(row.Handle, row.DisplayName, row.Avatar),
                    row.IsFollowed,
                    states.TryGetValue(row.UserId, out var state) ? state : null,
                    pets
                        .Where(pet => pet.OwnerUserId == row.UserId)
                        .Select(pet => new CollaborationCandidatePetResponse(
                            pet.Name,
                            pet.Slug,
                            MediaDerivatives.ResolveThumbnailUrl(pet.Photo, _r2Options.PublicBaseUrl)))
                        .ToArray()))
                .ToArray());
    }

    // ---- reads for the two parties ---------------------------------------

    public async Task<MomentCollaborationListResponse> GetForMomentAsync(
        Guid? currentUserId,
        Guid momentId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        return await BuildListAsync(actorId, momentId, cancellationToken);
    }

    public async Task<IncomingMomentCollaborationsResponse> GetIncomingAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var now = DateTimeOffset.UtcNow;
        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, actorId);
        var visibleMoments = _dbContext.PetMemories.SociallyVisible();

        var rows = await _dbContext.MomentCollaborations
            .AsNoTracking()
            .Where(item =>
                item.InviteeUserId == actorId
                && item.Status == MomentCollaborationStatus.Pending
                && item.ExpiresAt > now
                && item.InviterUserId == item.Moment.AuthorUserId
                && !blocked.Contains(item.InviterUserId))
            .Where(item => visibleMoments.Any(moment => moment.Id == item.MomentId))
            .OrderByDescending(item => item.CreatedAt)
            .Take(SocialCursor.MaxPageSize)
            .Select(item => new
            {
                item.Id,
                item.MomentId,
                item.Moment.Title,
                item.ExpiresAt,
                item.InviterUserId,
                Handle = item.InviterUser.SocialProfile!.Handle,
                DisplayName = item.InviterUser.SocialProfile.DisplayName,
                Avatar = item.InviterUser.SocialProfile.AvatarMediaFile
            })
            .ToListAsync(cancellationToken);

        var pets = await LoadCollaborationPetsAsync(rows.Select(row => row.Id).ToArray(), cancellationToken);

        return new IncomingMomentCollaborationsResponse(rows
            .Where(row => !string.IsNullOrEmpty(row.Handle) && !string.IsNullOrEmpty(row.DisplayName))
            .Select(row => new IncomingMomentCollaborationResponse(
                row.Id,
                row.MomentId,
                row.Title,
                Attribution(row.Handle!, row.DisplayName!, row.Avatar),
                pets.TryGetValue(row.Id, out var requested) ? requested : [],
                row.ExpiresAt))
            .ToArray());
    }

    // ---- invite ---------------------------------------------------------

    public async Task<MomentCollaborationListResponse> InviteAsync(
        Guid? currentUserId,
        Guid momentId,
        CreateMomentCollaborationRequest? request,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        await RequireUsableIdentityAsync(actorId, cancellationToken);
        var moment = await RequireAuthoredMomentAsync(actorId, momentId, requireManager: true, cancellationToken);

        if (!await IsCollaborationEligibleMomentAsync(momentId, cancellationToken))
        {
            throw MomentNotPublic();
        }

        var inviteeId = await ResolveInviteeAsync(actorId, request?.Handle, cancellationToken);
        var requestedPetIds = await ResolveInviteePetsAsync(
            inviteeId,
            request?.PetSlugs,
            MaxPetsPerInvitation,
            cancellationToken);

        try
        {
            await InTransactionAsync(async transaction =>
            {
                await AcquireLockAsync(transaction, MomentLockResource(momentId), cancellationToken);
                await AcquireLockAsync(transaction, PairLockResource(actorId, inviteeId), cancellationToken);

                var now = DateTimeOffset.UtcNow;
                var existing = await _dbContext.MomentCollaborations
                    .Where(item => item.MomentId == momentId)
                    .ToListAsync(cancellationToken);

                // Expiry is inferred everywhere else; here, where rows are being
                // replaced anyway, it is written down so the live index frees up.
                foreach (var stale in existing.Where(item =>
                    item.Status == MomentCollaborationStatus.Pending && item.ExpiresAt <= now))
                {
                    stale.Status = MomentCollaborationStatus.Expired;
                    stale.EndedAt = stale.ExpiresAt;
                }

                var forInvitee = existing.Where(item => item.InviteeUserId == inviteeId).ToList();
                if (forInvitee.Any(item => item.Status is MomentCollaborationStatus.Pending
                    or MomentCollaborationStatus.Accepted))
                {
                    throw new ApiException(
                        StatusCodes.Status409Conflict,
                        "collaboration_already_invited",
                        "This household is already part of this Moment or has an invitation waiting.");
                }

                if (forInvitee.Any(item => item.Status is MomentCollaborationStatus.Declined
                    or MomentCollaborationStatus.Left
                    or MomentCollaborationStatus.Dissolved))
                {
                    throw ReinviteUnavailable();
                }

                var live = existing.Count(item => item.Status is MomentCollaborationStatus.Pending
                    or MomentCollaborationStatus.Accepted);
                if (live >= MaxLiveHouseholds)
                {
                    throw LimitReached();
                }

                var pendingForHousehold = await _dbContext.MomentCollaborations.CountAsync(
                    item => item.InviterUserId == actorId
                        && item.InviteeUserId == inviteeId
                        && item.Status == MomentCollaborationStatus.Pending
                        && item.ExpiresAt > now,
                    cancellationToken);
                if (pendingForHousehold >= MaxPendingPerHousehold)
                {
                    throw new ApiException(
                        StatusCodes.Status409Conflict,
                        "collaboration_household_pending_limit",
                        $"This household already has {MaxPendingPerHousehold} invitations from you waiting.");
                }

                var sentToday = await _dbContext.MomentCollaborations.CountAsync(
                    item => item.InviterUserId == actorId && item.CreatedAt > now.AddDays(-1),
                    cancellationToken);
                if (sentToday >= MaxInvitationsPerDay)
                {
                    throw new ApiException(
                        StatusCodes.Status429TooManyRequests,
                        "collaboration_daily_limit",
                        "You've sent a lot of invitations today. Please try again tomorrow.");
                }

                // Re-checked inside the pair lock Block also takes.
                if (await IsBlockedAsync(actorId, inviteeId, cancellationToken))
                {
                    throw HouseholdUnavailable();
                }

                var collaboration = new MomentCollaboration
                {
                    MomentId = momentId,
                    InviterUserId = actorId,
                    InviteeUserId = inviteeId,
                    Status = MomentCollaborationStatus.Pending,
                    CreatedAt = now,
                    ExpiresAt = now.Add(InvitationLifetime)
                };
                _dbContext.MomentCollaborations.Add(collaboration);
                foreach (var petId in requestedPetIds)
                {
                    _dbContext.MomentCollaborationPets.Add(new MomentCollaborationPet
                    {
                        CollaborationId = collaboration.Id,
                        PetId = petId,
                        CreatedAt = now
                    });
                }

                await _notifications.StageCollaborationRequested(
                    collaboration.Id,
                    actorId,
                    inviteeId,
                    momentId,
                    requestedPetIds[0],
                    cancellationToken);
                await _dbContext.SaveChangesAsync(cancellationToken);
            }, cancellationToken);
        }
        catch (DbUpdateException exception)
            when (UniqueConstraintViolation.IsFor(exception, "IX_MomentCollaborations_Live"))
        {
            _dbContext.ChangeTracker.Clear();
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "collaboration_already_invited",
                "This household is already part of this Moment or has an invitation waiting.");
        }

        _dbContext.ChangeTracker.Clear();
        return await BuildListAsync(actorId, moment.Id, cancellationToken);
    }

    // ---- revoke (author) ------------------------------------------------

    public async Task<MomentCollaborationListResponse> RevokeAsync(
        Guid? currentUserId,
        Guid momentId,
        Guid collaborationId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        await RequireAuthoredMomentAsync(actorId, momentId, requireManager: false, cancellationToken);

        await ChangeStateAsync(
            collaborationId,
            item => item.MomentId == momentId && item.Moment.AuthorUserId == actorId,
            async collaboration =>
            {
                var now = DateTimeOffset.UtcNow;
                if (collaboration.Status == MomentCollaborationStatus.Pending)
                {
                    collaboration.Status = MomentCollaborationStatus.Revoked;
                    collaboration.EndedAt = now;
                    await _notifications.StageCollaborationWithdrawal(
                        collaboration.Id, RequestActivity, cancellationToken);
                    return true;
                }

                if (collaboration.Status == MomentCollaborationStatus.Accepted)
                {
                    collaboration.Status = MomentCollaborationStatus.Revoked;
                    collaboration.EndedAt = now;
                    await RemoveAssociationsAsync(collaboration.Id, cancellationToken);
                    await _notifications.StageCollaborationWithdrawal(
                        collaboration.Id, AllActivity, cancellationToken);
                    return true;
                }

                // Already over: nothing to revoke, and that is not an error.
                return false;
            },
            cancellationToken,
            reapplyAfterConflict: true);

        return await BuildListAsync(actorId, momentId, cancellationToken);
    }

    // ---- respond (invitee) ----------------------------------------------

    public async Task<MomentCollaborationListResponse> AcceptAsync(
        Guid? currentUserId,
        Guid collaborationId,
        AcceptMomentCollaborationRequest? request,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var snapshot = await RequireInviteeCollaborationAsync(actorId, collaborationId, cancellationToken);

        if (snapshot.Status == MomentCollaborationStatus.Accepted)
        {
            return await BuildListAsync(actorId, snapshot.MomentId, cancellationToken, afterOwnResponse: true);
        }

        EnsureActionablePending(snapshot);
        await RequireUsableIdentityAsync(actorId, cancellationToken);

        var slugs = (request?.PetSlugs ?? [])
            .Where(slug => !string.IsNullOrWhiteSpace(slug))
            .Select(slug => slug.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (slugs.Length == 0)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "collaboration_pets_required",
                "Choose at least one pet to join this Moment.");
        }

        var requested = await _dbContext.MomentCollaborationPets
            .AsNoTracking()
            .Where(item => item.CollaborationId == collaborationId)
            .Select(item => new { item.PetId, item.Pet.Slug, item.Pet.PublicProfile!.PublicCode })
            .ToListAsync(cancellationToken);

        var chosenPetIds = new List<Guid>();
        foreach (var slug in slugs)
        {
            var code = PetDtoMapper.ExtractPublicCode(slug);
            var match = requested.FirstOrDefault(pet =>
                string.Equals(pet.Slug, slug, StringComparison.OrdinalIgnoreCase)
                || string.Equals(pet.PublicCode, code, StringComparison.OrdinalIgnoreCase));
            if (match is null)
            {
                throw new ApiException(
                    StatusCodes.Status422UnprocessableEntity,
                    "collaboration_pet_not_requested",
                    "Only the pets this invitation asked about can join.");
            }

            chosenPetIds.Add(match.PetId);
        }

        var eligible = await EligiblePets()
            .Where(pet => pet.OwnerUserId == actorId && chosenPetIds.Contains(pet.Id))
            .Select(pet => pet.Id)
            .ToListAsync(cancellationToken);
        if (eligible.Count != chosenPetIds.Count)
        {
            throw PetUnavailable();
        }

        try
        {
            await ChangeStateAsync(
                collaborationId,
                item => item.InviteeUserId == actorId,
                async collaboration =>
                {
                    if (collaboration.Status == MomentCollaborationStatus.Accepted)
                    {
                        return false;
                    }

                    EnsureActionablePending(collaboration);

                    // Everything that could have changed since the invitation:
                    // the Moment, both households, and a block between them.
                    if (!await IsCollaborationEligibleMomentAsync(collaboration.MomentId, cancellationToken)
                        || !await IsUsableIdentityAsync(collaboration.InviterUserId, cancellationToken)
                        || !await _dbContext.PetMemories.AnyAsync(
                            moment => moment.Id == collaboration.MomentId
                                && moment.AuthorUserId == collaboration.InviterUserId,
                            cancellationToken)
                        || await IsBlockedAsync(collaboration.InviterUserId, actorId, cancellationToken))
                    {
                        throw Unavailable();
                    }

                    var now = DateTimeOffset.UtcNow;
                    var pets = await _dbContext.MomentCollaborationPets
                        .Where(item => item.CollaborationId == collaboration.Id)
                        .ToListAsync(cancellationToken);
                    foreach (var pet in pets)
                    {
                        pet.IsAccepted = chosenPetIds.Contains(pet.PetId);
                    }

                    foreach (var petId in chosenPetIds)
                    {
                        _dbContext.MomentPets.Add(new MomentPet
                        {
                            MomentId = collaboration.MomentId,
                            PetId = petId,
                            CollaborationId = collaboration.Id,
                            CreatedAt = now
                        });
                    }

                    collaboration.Status = MomentCollaborationStatus.Accepted;
                    collaboration.RespondedAt = now;

                    await _notifications.StageCollaborationWithdrawal(
                        collaboration.Id, RequestActivity, cancellationToken);
                    await _notifications.StageCollaborationAccepted(
                        collaboration.Id,
                        actorId,
                        collaboration.InviterUserId,
                        collaboration.MomentId,
                        chosenPetIds[0],
                        cancellationToken);
                    return true;
                },
                cancellationToken);
        }
        catch (DbUpdateException exception)
            when (exception is not DbUpdateConcurrencyException
                && UniqueConstraintViolation.IsFor(exception, "IX_MomentPets_MomentId_PetId"))
        {
            // A second accept racing the first: whichever committed stands.
            _dbContext.ChangeTracker.Clear();
        }

        return await BuildListAsync(actorId, snapshot.MomentId, cancellationToken, afterOwnResponse: true);
    }

    public async Task<MomentCollaborationListResponse> DeclineAsync(
        Guid? currentUserId,
        Guid collaborationId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var snapshot = await RequireInviteeCollaborationAsync(actorId, collaborationId, cancellationToken);

        await ChangeStateAsync(
            collaborationId,
            item => item.InviteeUserId == actorId,
            async collaboration =>
            {
                if (collaboration.Status == MomentCollaborationStatus.Declined)
                {
                    return false;
                }

                EnsureActionablePending(collaboration);
                collaboration.Status = MomentCollaborationStatus.Declined;
                collaboration.RespondedAt = DateTimeOffset.UtcNow;
                await _notifications.StageCollaborationWithdrawal(
                    collaboration.Id, RequestActivity, cancellationToken);
                return true;
            },
            cancellationToken);

        return await BuildListAsync(actorId, snapshot.MomentId, cancellationToken, afterOwnResponse: true);
    }

    public async Task<MomentCollaborationListResponse> LeaveAsync(
        Guid? currentUserId,
        Guid collaborationId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var snapshot = await RequireInviteeCollaborationAsync(actorId, collaborationId, cancellationToken);

        await ChangeStateAsync(
            collaborationId,
            item => item.InviteeUserId == actorId,
            async collaboration =>
            {
                if (collaboration.Status == MomentCollaborationStatus.Accepted)
                {
                    collaboration.Status = MomentCollaborationStatus.Left;
                    collaboration.EndedAt = DateTimeOffset.UtcNow;
                    await RemoveAssociationsAsync(collaboration.Id, cancellationToken);
                    await _notifications.StageCollaborationWithdrawal(
                        collaboration.Id, AllActivity, cancellationToken);
                    return true;
                }

                if (collaboration.Status == MomentCollaborationStatus.Pending)
                {
                    throw new ApiException(
                        StatusCodes.Status409Conflict,
                        "collaboration_not_joined",
                        "You haven't joined this Moment. Decline the invitation instead.");
                }

                // Revoked, dissolved or already left: the association is gone.
                return false;
            },
            cancellationToken,
            reapplyAfterConflict: true);

        return await BuildListAsync(actorId, snapshot.MomentId, cancellationToken, afterOwnResponse: true);
    }

    // ---- block ----------------------------------------------------------

    /// <summary>
    /// Stages what a block between two households does to their
    /// collaborations, in either direction: every Pending or Accepted one is
    /// Dissolved, the association rows it created are deleted, and its unread
    /// activity is withdrawn. Collaborations with anybody else, including other
    /// collaborators on the same Moment, are untouched. Unblocking restores
    /// nothing: Dissolved is final. Called by the Block service inside its own
    /// transaction; saving is the caller's.
    /// </summary>
    public static async Task StageBlockDissolutionAsync(
        MyPetLinkDbContext dbContext,
        IOwnerNotificationService notifications,
        Guid firstUserId,
        Guid secondUserId,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var live = await dbContext.MomentCollaborations
            .Where(item =>
                ((item.InviterUserId == firstUserId && item.InviteeUserId == secondUserId)
                    || (item.InviterUserId == secondUserId && item.InviteeUserId == firstUserId))
                && (item.Status == MomentCollaborationStatus.Pending
                    || item.Status == MomentCollaborationStatus.Accepted))
            .ToListAsync(cancellationToken);

        foreach (var collaboration in live)
        {
            collaboration.Status = MomentCollaborationStatus.Dissolved;
            collaboration.EndedAt = now;

            var associations = await dbContext.MomentPets
                .Where(item => item.CollaborationId == collaboration.Id)
                .ToListAsync(cancellationToken);
            dbContext.MomentPets.RemoveRange(associations);

            await notifications.StageCollaborationWithdrawal(
                collaboration.Id, AllActivity, cancellationToken);
        }
    }

    /// <summary>The lock an invitation and a block between two households share.</summary>
    public static string PairLockResource(Guid firstUserId, Guid secondUserId)
    {
        var (low, high) = firstUserId.CompareTo(secondUserId) <= 0
            ? (firstUserId, secondUserId)
            : (secondUserId, firstUserId);
        return $"mypetlink:moment-collab-pair:{low:N}:{high:N}";
    }

    private static string MomentLockResource(Guid momentId) =>
        $"mypetlink:moment-collab:{momentId:N}";

    // ---- shared machinery -----------------------------------------------

    /// <summary>
    /// Applies one state change to a collaboration inside a retrying
    /// transaction. The row is re-read inside the transaction and its
    /// RowVersion makes a concurrent change lose deterministically: the first
    /// commit wins.
    ///
    /// A response (Accept, Decline) that loses reports the winning state. An
    /// ending (Revoke, Leave) that loses is re-applied to the winning state,
    /// because the intent still holds: a revoke racing an accept still ends the
    /// collaboration, and a revoke after a leave finds nothing left to do.
    /// </summary>
    private async Task ChangeStateAsync(
        Guid collaborationId,
        System.Linq.Expressions.Expression<Func<MomentCollaboration, bool>> authorised,
        Func<MomentCollaboration, Task<bool>> change,
        CancellationToken cancellationToken,
        bool reapplyAfterConflict = false)
    {
        for (var attempt = 1; ; attempt += 1)
        {
            try
            {
                await InTransactionAsync(async _ =>
                {
                    var collaboration = await _dbContext.MomentCollaborations
                        .Where(item => item.Id == collaborationId)
                        .Where(authorised)
                        .SingleOrDefaultAsync(cancellationToken)
                        ?? throw CollaborationNotFound();

                    if (await change(collaboration))
                    {
                        await _dbContext.SaveChangesAsync(cancellationToken);
                    }
                }, cancellationToken);
                break;
            }
            catch (DbUpdateConcurrencyException)
            {
                _dbContext.ChangeTracker.Clear();
                if (!reapplyAfterConflict || attempt >= 3)
                {
                    break;
                }
            }
        }

        _dbContext.ChangeTracker.Clear();
    }

    private async Task InTransactionAsync(
        Func<IDbContextTransaction?, Task> work,
        CancellationToken cancellationToken)
    {
        var strategy = _dbContext.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            _dbContext.ChangeTracker.Clear();
            await using IDbContextTransaction? transaction = _dbContext.Database.IsRelational()
                ? await _dbContext.Database.BeginTransactionAsync(
                    _dbContext.Database.IsSqlServer()
                        ? IsolationLevel.ReadCommitted
                        : IsolationLevel.Serializable,
                    cancellationToken)
                : null;

            await work(transaction);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
        });
    }

    private Task AcquireLockAsync(
        IDbContextTransaction? transaction,
        string resource,
        CancellationToken cancellationToken)
    {
        if (transaction is null || !_dbContext.Database.IsSqlServer())
        {
            return Task.CompletedTask;
        }

        return SqlApplicationLock.AcquireAsync(
            _dbContext,
            transaction,
            resource,
            "collaboration_temporarily_unavailable",
            "We couldn't update this Moment's collaborators right now. Please try again.",
            cancellationToken);
    }

    private async Task RemoveAssociationsAsync(Guid collaborationId, CancellationToken cancellationToken)
    {
        var associations = await _dbContext.MomentPets
            .Where(item => item.CollaborationId == collaborationId)
            .ToListAsync(cancellationToken);
        _dbContext.MomentPets.RemoveRange(associations);
    }

    /// <summary>
    /// The viewer's view of a Moment's collaborations. After the viewer's own
    /// response (<paramref name="afterOwnResponse"/>) a Moment that has since
    /// become hidden answers with an empty view rather than not-found: the
    /// response did commit, and the invitee already knows the Moment exists.
    /// </summary>
    private async Task<MomentCollaborationListResponse> BuildListAsync(
        Guid actorId,
        Guid momentId,
        CancellationToken cancellationToken,
        bool afterOwnResponse = false)
    {
        _dbContext.ChangeTracker.Clear();
        var now = DateTimeOffset.UtcNow;
        var moment = await _dbContext.PetMemories
            .AsNoTracking()
            .Where(item => item.Id == momentId && item.DeletedAt == null)
            .Select(item => new
            {
                item.Id,
                item.AuthorUserId,
                ManagedByAuthor = item.Pet.OwnerUserId == item.AuthorUserId,
                AuthorHandle = item.AuthorUser.SocialProfile!.Handle,
                AuthorDisplayName = item.AuthorUser.SocialProfile.DisplayName,
                AuthorAvatar = item.AuthorUser.SocialProfile.AvatarMediaFile
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (moment is null)
        {
            throw MomentNotFound();
        }

        var author = !string.IsNullOrEmpty(moment.AuthorHandle) && !string.IsNullOrEmpty(moment.AuthorDisplayName)
            ? Attribution(moment.AuthorHandle!, moment.AuthorDisplayName!, moment.AuthorAvatar)
            : null;
        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, actorId);

        if (moment.AuthorUserId == actorId)
        {
            // The author's own management list. A household on either side of
            // a block with the author is left out entirely, and so is anything a
            // block dissolved: neither may become a way to learn who blocked whom.
            var items = await LoadCollaborationsAsync(
                _dbContext.MomentCollaborations.Where(item =>
                    item.MomentId == momentId
                    && item.Status != MomentCollaborationStatus.Dissolved
                    && item.Status != MomentCollaborationStatus.Unknown
                    && !blocked.Contains(item.InviteeUserId)),
                now,
                cancellationToken);
            var live = items.Count(item => item.Status is "Pending" or "Accepted");
            var eligible = moment.ManagedByAuthor
                && await IsCollaborationEligibleMomentAsync(momentId, cancellationToken);

            return new MomentCollaborationListResponse(
                "author",
                author,
                MaxLiveHouseholds,
                live,
                eligible && live < MaxLiveHouseholds,
                !eligible ? "moment-not-public" : live >= MaxLiveHouseholds ? "limit-reached" : null,
                items);
        }

        var visible = await _dbContext.PetMemories
            .VisibleTo(_dbContext, actorId)
            .AnyAsync(item => item.Id == momentId, cancellationToken);

        if (!visible)
        {
            if (afterOwnResponse)
            {
                return new MomentCollaborationListResponse("none", null, MaxLiveHouseholds, 0, false, null, []);
            }

            throw MomentNotFound();
        }

        var own = await LoadCollaborationsAsync(
            _dbContext.MomentCollaborations.Where(item =>
                item.MomentId == momentId
                && item.InviteeUserId == actorId
                && ((item.Status == MomentCollaborationStatus.Pending && item.ExpiresAt > now)
                    || item.Status == MomentCollaborationStatus.Accepted)),
            now,
            cancellationToken);

        return own.Count == 0
            ? new MomentCollaborationListResponse("none", author, MaxLiveHouseholds, 0, false, null, [])
            : new MomentCollaborationListResponse("invitee", author, MaxLiveHouseholds, 0, false, null, own);
    }

    private async Task<List<MomentCollaborationResponse>> LoadCollaborationsAsync(
        IQueryable<MomentCollaboration> query,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var rows = await query
            .AsNoTracking()
            .OrderBy(item => item.CreatedAt)
            .Select(item => new
            {
                item.Id,
                item.Status,
                item.CreatedAt,
                item.ExpiresAt,
                item.RespondedAt,
                item.EndedAt,
                Handle = item.InviteeUser.SocialProfile!.Handle,
                DisplayName = item.InviteeUser.SocialProfile.DisplayName,
                Avatar = item.InviteeUser.SocialProfile.AvatarMediaFile
            })
            .ToListAsync(cancellationToken);

        var pets = await LoadCollaborationPetsAsync(rows.Select(row => row.Id).ToArray(), cancellationToken);

        return rows
            .Select(row => new MomentCollaborationResponse(
                row.Id,
                row.Status == MomentCollaborationStatus.Pending && row.ExpiresAt <= now
                    ? nameof(MomentCollaborationStatus.Expired)
                    : row.Status.ToString(),
                Attribution(
                    row.Handle ?? "",
                    string.IsNullOrEmpty(row.DisplayName) ? "A MyPetLink household" : row.DisplayName,
                    row.Avatar),
                pets.TryGetValue(row.Id, out var items) ? items : [],
                row.CreatedAt,
                row.ExpiresAt,
                row.RespondedAt,
                row.EndedAt))
            .ToList();
    }

    private async Task<Dictionary<Guid, MomentCollaborationPetResponse[]>> LoadCollaborationPetsAsync(
        IReadOnlyCollection<Guid> collaborationIds,
        CancellationToken cancellationToken)
    {
        if (collaborationIds.Count == 0)
        {
            return new Dictionary<Guid, MomentCollaborationPetResponse[]>();
        }

        var rows = await _dbContext.MomentCollaborationPets
            .AsNoTracking()
            .Where(item => collaborationIds.Contains(item.CollaborationId))
            .OrderBy(item => item.Pet.Name)
            .Select(item => new
            {
                item.CollaborationId,
                item.Pet.Name,
                item.Pet.Slug,
                Photo = item.Pet.ProfileMediaFile,
                item.IsAccepted
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.CollaborationId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(row => new MomentCollaborationPetResponse(
                        row.Name,
                        row.Slug,
                        MediaDerivatives.ResolveThumbnailUrl(row.Photo, _r2Options.PublicBaseUrl),
                        row.IsAccepted))
                    .ToArray());
    }

    private async Task<Dictionary<Guid, string>> LoadInvitationStatesAsync(
        Guid actorId,
        Guid momentId,
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var rows = await _dbContext.MomentCollaborations
            .AsNoTracking()
            .Where(item =>
                item.MomentId == momentId
                && item.Moment.AuthorUserId == actorId
                && userIds.Contains(item.InviteeUserId))
            .Select(item => new { item.InviteeUserId, item.Status, item.ExpiresAt })
            .ToListAsync(cancellationToken);

        var states = new Dictionary<Guid, string>();
        foreach (var group in rows.GroupBy(row => row.InviteeUserId))
        {
            if (group.Any(row => row.Status == MomentCollaborationStatus.Accepted))
            {
                states[group.Key] = "Accepted";
            }
            else if (group.Any(row => row.Status == MomentCollaborationStatus.Pending && row.ExpiresAt > now))
            {
                states[group.Key] = "Pending";
            }
            else if (group.Any(row => row.Status is MomentCollaborationStatus.Declined
                or MomentCollaborationStatus.Left
                or MomentCollaborationStatus.Dissolved))
            {
                states[group.Key] = "Unavailable";
            }
        }

        return states;
    }

    private async Task<Guid> ResolveInviteeAsync(
        Guid actorId,
        string? handle,
        CancellationToken cancellationToken)
    {
        var normalized = OwnerHandleRules.Normalize(handle) ?? throw HouseholdUnavailable();
        var inviteeId = await UsableProfiles()
            .Where(profile => profile.NormalizedHandle == normalized)
            .Select(profile => (Guid?)profile.UserId)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw HouseholdUnavailable();

        if (inviteeId == actorId)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "collaboration_self",
                "Your own pets are added under Who's in this Moment.");
        }

        // Blocked in either direction answers exactly like a household that
        // does not exist, so an invitation is never a way to test a block.
        if (await IsBlockedAsync(actorId, inviteeId, cancellationToken))
        {
            throw HouseholdUnavailable();
        }

        return inviteeId;
    }

    private async Task<Guid[]> ResolveInviteePetsAsync(
        Guid inviteeId,
        IReadOnlyCollection<string>? slugs,
        int maximum,
        CancellationToken cancellationToken)
    {
        var requested = (slugs ?? [])
            .Where(slug => !string.IsNullOrWhiteSpace(slug))
            .Select(slug => slug.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (requested.Length == 0)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "collaboration_pets_required",
                "Choose at least one of their pets to invite.");
        }

        if (requested.Length > maximum)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "collaboration_too_many_pets",
                $"Invite up to {maximum} pets from one household.");
        }

        var codes = requested.Select(PetDtoMapper.ExtractPublicCode).ToArray();
        var petIds = await EligiblePets()
            .Where(pet =>
                pet.OwnerUserId == inviteeId
                && (requested.Contains(pet.Slug) || codes.Contains(pet.PublicProfile!.PublicCode)))
            .Select(pet => pet.Id)
            .ToListAsync(cancellationToken);

        // Any pet that is not this household's, or not currently shared, fails
        // the whole request the same way: nothing reveals which pets exist.
        if (petIds.Count != requested.Length)
        {
            throw PetUnavailable();
        }

        return petIds.ToArray();
    }

    private async Task<PetMemory> RequireAuthoredMomentAsync(
        Guid actorId,
        Guid momentId,
        bool requireManager,
        CancellationToken cancellationToken)
    {
        var moment = await _dbContext.PetMemories
            .AsNoTracking()
            .Include(item => item.Pet)
            .SingleOrDefaultAsync(
                item => item.Id == momentId && item.DeletedAt == null && item.AuthorUserId == actorId,
                cancellationToken);

        // The canonical author, and nobody else. Owning the primary pet never
        // makes somebody the author; for inviting, the author must also still
        // be the one managing the Moment.
        if (moment is null || (requireManager && moment.Pet.OwnerUserId != actorId))
        {
            throw MomentNotFound();
        }

        return moment;
    }

    private async Task<MomentCollaboration> RequireInviteeCollaborationAsync(
        Guid actorId,
        Guid collaborationId,
        CancellationToken cancellationToken)
    {
        return await _dbContext.MomentCollaborations
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.Id == collaborationId && item.InviteeUserId == actorId,
                cancellationToken)
            ?? throw CollaborationNotFound();
    }

    private static void EnsureActionablePending(MomentCollaboration collaboration)
    {
        if (collaboration.Status != MomentCollaborationStatus.Pending
            || collaboration.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            throw Unavailable();
        }
    }

    private Task<bool> IsCollaborationEligibleMomentAsync(Guid momentId, CancellationToken cancellationToken)
    {
        return _dbContext.PetMemories
            .SociallyVisible()
            .AnyAsync(
                moment => moment.Id == momentId
                    && moment.AuthorUser.SocialProfile!.Handle != null
                    && moment.AuthorUser.SocialProfile.Handle != ""
                    && moment.AuthorUser.SocialProfile.DisplayName != null
                    && moment.AuthorUser.SocialProfile.DisplayName != "",
                cancellationToken);
    }

    private Task<bool> IsBlockedAsync(Guid firstUserId, Guid secondUserId, CancellationToken cancellationToken)
    {
        return _dbContext.OwnerBlocks.AnyAsync(
            block => (block.BlockerUserId == firstUserId && block.BlockedUserId == secondUserId)
                || (block.BlockerUserId == secondUserId && block.BlockedUserId == firstUserId),
            cancellationToken);
    }

    private async Task RequireUsableIdentityAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (!await IsUsableIdentityAsync(userId, cancellationToken))
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "community_profile_required",
                "Set up your Community profile to collaborate on Moments.");
        }
    }

    private Task<bool> IsUsableIdentityAsync(Guid userId, CancellationToken cancellationToken)
    {
        return UsableProfiles().AnyAsync(profile => profile.UserId == userId, cancellationToken);
    }

    /// <summary>Active accounts with a complete, enabled Community identity.</summary>
    private IQueryable<OwnerSocialProfile> UsableProfiles()
    {
        return _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile =>
                profile.IsSocialEnabled
                && profile.Handle != null
                && profile.Handle != ""
                && profile.DisplayName != null
                && profile.DisplayName != ""
                && profile.User.DeletedAt == null
                && profile.User.Status == UserStatus.Active);
    }

    /// <summary>
    /// Pets that may be asked about or accepted: active, shared, in Community
    /// with their current owner's consent. Discoverability is not required.
    /// </summary>
    private IQueryable<Pet> EligiblePets()
    {
        return _dbContext.Pets
            .AsNoTracking()
            .Where(pet =>
                pet.DeletedAt == null
                && pet.LifecycleStatus == PetLifecycleStatus.Active
                && pet.PublicProfile != null
                && pet.PublicProfile.IsPublicProfileEnabled
                && pet.SocialProfile != null
                && pet.SocialProfile.IsSocialEnabled
                && pet.SocialProfile.ConsentedByUserId == pet.OwnerUserId);
    }

    private PublicOwnerAttributionResponse Attribution(string handle, string displayName, MediaFile? avatar)
    {
        return new PublicOwnerAttributionResponse(
            handle,
            displayName,
            MediaDerivatives.ResolveOriginalUrl(avatar, _r2Options.PublicBaseUrl),
            MediaDerivatives.ResolveThumbnailUrl(avatar, _r2Options.PublicBaseUrl));
    }

    private static string LikePrefix(string term)
    {
        var escaped = term
            .Replace("[", "[[]", StringComparison.Ordinal)
            .Replace("%", "[%]", StringComparison.Ordinal)
            .Replace("_", "[_]", StringComparison.Ordinal);
        return escaped + "%";
    }

    private static Guid RequireUserId(Guid? currentUserId) =>
        currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");

    private static ApiException MomentNotFound() => new(
        StatusCodes.Status404NotFound,
        "social_moment_not_found",
        "This Moment is not available.");

    private static ApiException MomentNotPublic() => new(
        StatusCodes.Status422UnprocessableEntity,
        "collaboration_moment_not_public",
        "Only public Community Moments can have collaborators.");

    private static ApiException HouseholdUnavailable() => new(
        StatusCodes.Status404NotFound,
        "collaboration_household_unavailable",
        "This household can't be invited.");

    private static ApiException PetUnavailable() => new(
        StatusCodes.Status422UnprocessableEntity,
        "collaboration_pet_unavailable",
        "One or more of these pets can't join this Moment.");

    private static ApiException LimitReached() => new(
        StatusCodes.Status409Conflict,
        "collaboration_limit_reached",
        $"Maximum {MaxLiveHouseholds} collaborator households for this Moment.");

    private static ApiException ReinviteUnavailable() => new(
        StatusCodes.Status409Conflict,
        "collaboration_reinvite_unavailable",
        "This household can't be invited to this Moment again.");

    private static ApiException CollaborationNotFound() => new(
        StatusCodes.Status404NotFound,
        "collaboration_not_found",
        "This invitation isn't available.");

    private static ApiException Unavailable() => new(
        StatusCodes.Status409Conflict,
        "collaboration_unavailable",
        "This invitation is no longer available.");

    private sealed record CandidateRow(
        Guid UserId,
        string Handle,
        string DisplayName,
        MediaFile? Avatar,
        bool IsFollowed);
}
