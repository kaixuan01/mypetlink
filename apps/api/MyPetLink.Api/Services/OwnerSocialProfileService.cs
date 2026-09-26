using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// Reads and writes the owner's public social identity.
///
/// The one rule that governs this whole class: nothing here may copy a value
/// from <see cref="User"/> or <see cref="OwnerProfile"/> into the social
/// profile. Those carry the account identity and the finder-facing identity, and
/// a person who put their real name on a lost-pet page did not thereby agree to
/// publish it to a social network.
///
/// The authenticated user is always the subject. No method takes a user id from
/// a caller.
/// </summary>
public sealed class OwnerSocialProfileService : SkeletonService, IOwnerSocialProfileService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IOwnerHandleService _handleService;
    private readonly CloudflareR2Options _r2Options;
    private readonly SocialOptions _socialOptions;
    private readonly IAuditLogService _auditLog;
    private readonly TimeProvider _timeProvider;

    public OwnerSocialProfileService(
        MyPetLinkDbContext dbContext,
        IOwnerHandleService handleService,
        IOptions<CloudflareR2Options> r2Options,
        IOptions<SocialOptions> socialOptions,
        IAuditLogService auditLog,
        TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _handleService = handleService;
        _r2Options = r2Options.Value;
        _socialOptions = socialOptions.Value;
        _auditLog = auditLog;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    public async Task<OwnerSocialProfileResponse> GetAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var profile = await LoadOrCreateAsync(userId, cancellationToken);
        return await BuildResponseAsync(profile, cancellationToken);
    }

    public async Task<OwnerSocialProfileResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateOwnerSocialProfileRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var profile = await LoadOrCreateAsync(userId, cancellationToken);

        ApplyConcurrencyToken(profile, request.RowVersion);

        var before = Snapshot(profile);
        var errors = new Dictionary<string, string[]>();

        if (request.DisplayName is not null)
        {
            var displayName = OwnerSocialDisplayNameRules.Normalize(request.DisplayName);

            // An explicit empty value clears the name. Clearing it is allowed —
            // and the enable check below is what stops a cleared name from
            // leaving a live profile with nothing to show.
            if (displayName is not null)
            {
                var error = OwnerSocialDisplayNameRules.Validate(displayName);

                if (error is not null)
                {
                    errors["displayName"] = [error];
                }
            }

            profile.DisplayName = displayName;
            profile.NormalizedDisplayName = OwnerSocialDisplayNameRules.NormalizeForSearch(displayName);
        }

        if (request.Bio is not null)
        {
            var bio = OwnerSocialBioRules.Normalize(request.Bio);
            var error = OwnerSocialBioRules.Validate(bio);

            if (error is not null)
            {
                errors["bio"] = [error];
            }

            profile.Bio = bio;
        }

        if (request.GeneralArea is not null)
        {
            // Held to exactly the same rule as a pet's area. A social profile is
            // a wider audience than a finder, so this is the last place that
            // should accept something address-shaped.
            var generalArea = GeneralAreaRules.Normalize(request.GeneralArea);
            var error = GeneralAreaRules.Validate(generalArea);

            if (error is not null)
            {
                errors["generalArea"] = [error];
            }

            profile.GeneralArea = generalArea;
        }

        if (request.AllowFollowers.HasValue)
        {
            profile.AllowFollowers = request.AllowFollowers.Value;
        }

        var restricted = CommunityModeration.IsRestricted(profile);

        if (request.IsSocialEnabled.HasValue && restricted)
        {
            // Community is paused by MyPetLink. It cannot be switched back on
            // from here, and this is the only place it is ever switched on.
            // Switching it off is still the owner's choice, and is remembered
            // for when the restriction is lifted.
            if (request.IsSocialEnabled.Value)
            {
                throw new ApiException(
                    StatusCodes.Status403Forbidden,
                    "community_restricted",
                    CommunityModeration.RestrictedMessage);
            }

            profile.CommunityEnabledBeforeRestriction = false;
        }
        else if (request.IsSocialEnabled.HasValue)
        {
            if (request.IsSocialEnabled.Value && !MeetsEnableRequirements(profile))
            {
                errors["isSocialEnabled"] =
                    ["Choose a handle and a display name before turning your Community Profile on."];
            }
            else
            {
                profile.IsSocialEnabled = request.IsSocialEnabled.Value;
            }
        }

        if (request.IsDiscoverable.HasValue)
        {
            profile.IsDiscoverable = request.IsDiscoverable.Value;
        }

        // Discoverability is meaningless while the profile is off, and leaving
        // it set would mean switching social back on silently republishes the
        // account to discovery. Clear it with the parent switch instead —
        // except while restricted: then Community is off by MyPetLink, not by
        // the owner, and their discoverability choice is kept for the lift.
        if (!profile.IsSocialEnabled && !restricted)
        {
            profile.IsDiscoverable = false;
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }

        _auditLog.Append(
            userId,
            ActorType.Owner,
            "OwnerSocialProfileUpdated",
            nameof(OwnerSocialProfile),
            profile.Id,
            before,
            Snapshot(profile));

        await SaveWithConcurrencyAsync(cancellationToken);

        return await BuildResponseAsync(profile, cancellationToken);
    }

    public async Task<OwnerSocialProfileResponse> ClaimHandleAsync(
        Guid? currentUserId,
        ClaimOwnerHandleRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var profile = await LoadOrCreateAsync(userId, cancellationToken);

        await _handleService.ClaimAsync(profile, request.Handle, cancellationToken);

        return await BuildResponseAsync(profile, cancellationToken);
    }

    public async Task<OwnerHandleAvailabilityResponse> CheckHandleAvailabilityAsync(
        Guid? currentUserId,
        string handle,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var normalized = OwnerHandleRules.Normalize(handle);
        var isAvailable = normalized is not null
            && OwnerHandleRules.ValidateShape(normalized) is null
            && await _handleService.IsClaimableAsync(normalized, userId, cancellationToken);

        return new OwnerHandleAvailabilityResponse(
            OwnerHandleRules.NormalizeForDisplay(handle) ?? "",
            isAvailable);
    }

    /// <summary>
    /// Every account has a row so the settings screen always has something to
    /// read. The row is created switched off and empty: having one is not
    /// participation.
    /// </summary>
    private async Task<OwnerSocialProfile> LoadOrCreateAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var profile = await _dbContext.OwnerSocialProfiles
            .Include(item => item.AvatarMediaFile)
            .SingleOrDefaultAsync(item => item.UserId == userId, cancellationToken);

        if (profile is not null)
        {
            return profile;
        }

        var userExists = await _dbContext.Users.AnyAsync(
            user => user.Id == userId && user.DeletedAt == null,
            cancellationToken);

        if (!userExists)
        {
            throw Unauthorized();
        }

        profile = OwnerSocialProfileFactory.CreateDisabled(userId);
        _dbContext.OwnerSocialProfiles.Add(profile);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return profile;
    }

    private async Task<OwnerSocialProfileResponse> BuildResponseAsync(
        OwnerSocialProfile profile,
        CancellationToken cancellationToken)
    {
        if (profile.AvatarMediaFileId.HasValue && profile.AvatarMediaFile is null)
        {
            profile.AvatarMediaFile = await _dbContext.MediaFiles
                .AsNoTracking()
                .SingleOrDefaultAsync(item => item.Id == profile.AvatarMediaFileId.Value, cancellationToken);
        }

        var avatar = profile.AvatarMediaFile is { DeletedAt: null, UploadStatus: MediaUploadStatus.Ready }
            ? profile.AvatarMediaFile
            : null;

        var missing = MissingRequirements(profile);

        return new OwnerSocialProfileResponse(
            profile.Handle,
            profile.DisplayName,
            profile.Bio,
            avatar?.Id,
            PetDtoMapper.ResolvePublicMediaUrl(avatar, _r2Options.PublicBaseUrl),
            PetDtoMapper.ResolvePublicThumbnailUrl(avatar, _r2Options.PublicBaseUrl),
            profile.GeneralArea,
            profile.IsSocialEnabled,
            profile.IsDiscoverable,
            profile.AllowFollowers,
            missing.Count == 0,
            missing,
            await _handleService.GetChangeAvailableAtAsync(profile.UserId, cancellationToken),
            Convert.ToBase64String(profile.RowVersion));
    }

    private static bool MeetsEnableRequirements(OwnerSocialProfile profile)
    {
        return MissingRequirements(profile).Count == 0;
    }

    private static IReadOnlyCollection<string> MissingRequirements(OwnerSocialProfile profile)
    {
        var missing = new List<string>(2);

        if (string.IsNullOrWhiteSpace(profile.NormalizedHandle))
        {
            missing.Add("handle");
        }

        if (string.IsNullOrWhiteSpace(profile.DisplayName))
        {
            missing.Add("displayName");
        }

        return missing;
    }

    /// <summary>
    /// What an audit entry records. Only the social identity — never a value
    /// from the account or the finder identity.
    /// </summary>
    private static object Snapshot(OwnerSocialProfile profile)
    {
        return new
        {
            profile.Handle,
            profile.DisplayName,
            profile.Bio,
            profile.GeneralArea,
            profile.IsSocialEnabled,
            profile.IsDiscoverable,
            profile.AllowFollowers
        };
    }

    private void ApplyConcurrencyToken(OwnerSocialProfile profile, string? rowVersion)
    {
        if (string.IsNullOrWhiteSpace(rowVersion))
        {
            return;
        }

        try
        {
            _dbContext.Entry(profile).Property(item => item.RowVersion).OriginalValue =
                Convert.FromBase64String(rowVersion);
        }
        catch (FormatException)
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["rowVersion"] = ["This form is out of date. Reload and try again."]
            });
        }
    }

    private async Task SaveWithConcurrencyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "concurrency_conflict",
                "Your Community Profile was changed somewhere else. Reload and try again.");
        }
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw Unauthorized();
    }

    private static ApiException ValidationFailed(IReadOnlyDictionary<string, string[]> errors)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            errors);
    }

    private static ApiException Unauthorized()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }
}
