using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// The public social read surface: an owner's profile at <c>/u/{handle}</c>, and
/// the cursor-paginated Moment listings behind both profile kinds.
///
/// Two rules govern every query in this class.
///
/// <b>Gating is layered and every layer is checked in SQL.</b> A pet appears
/// socially only when its owner has social on, the pet has social on, the pet's
/// share profile is enabled, and the pet is alive and not archived. A shareable
/// link is not social participation, and social participation does not override
/// the pet's own field-level visibility.
///
/// <b>Nothing here touches the safety or account surfaces.</b> There is no code
/// path from this class to <c>PetContact</c>, <c>PetSafetySetting</c>,
/// <c>SmartTag.TagCode</c>, <c>TagScan</c>, <c>FoundReport</c>, or the owner's
/// account or finder identity.
/// </summary>
public sealed class PublicSocialProfileService : SkeletonService, IPublicSocialProfileService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;
    private readonly SocialMomentProjection _momentCards;

    public PublicSocialProfileService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options,
        SocialMomentProjection momentCards)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
        _momentCards = momentCards;
    }

    public async Task<PublicOwnerProfileResponse> GetOwnerProfileAsync(
        string handle,
        CancellationToken cancellationToken = default)
    {
        var normalized = OwnerHandleRules.Normalize(handle);

        if (normalized is null)
        {
            throw NotFound();
        }

        var profile = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(item =>
                item.NormalizedHandle == normalized
                && item.IsSocialEnabled
                && item.User.DeletedAt == null
                && item.User.Status == UserStatus.Active)
            .Select(item => new
            {
                item.UserId,
                item.Handle,
                item.DisplayName,
                item.Bio,
                item.GeneralArea,
                item.AllowFollowers,
                Avatar = item.AvatarMediaFile
            })
            .SingleOrDefaultAsync(cancellationToken);

        // A profile with social on but no handle or display name has nothing to
        // show. Treated as absent rather than rendered half-built.
        if (profile is null
            || string.IsNullOrWhiteSpace(profile.Handle)
            || string.IsNullOrWhiteSpace(profile.DisplayName))
        {
            throw NotFound();
        }

        var pets = await SociallyVisiblePets(_dbContext.Pets)
            .Where(pet => pet.OwnerUserId == profile.UserId)
            .OrderBy(pet => pet.CreatedAt)
            .Select(pet => new
            {
                pet.Id,
                pet.Name,
                pet.Species,
                pet.CustomSpecies,
                pet.Breed,
                pet.Slug,
                pet.LostModeEnabled,
                Photo = pet.ProfileMediaFile,
                HasActiveSmartTag = pet.SmartTags.Any(tag =>
                    tag.Status == SmartTagStatus.Active
                    && tag.DeletedAt == null
                    && tag.ArchivedAt == null)
            })
            .ToListAsync(cancellationToken);

        return new PublicOwnerProfileResponse(
            profile.Handle!,
            profile.DisplayName!,
            profile.Bio,
            MediaDerivatives.ResolveOriginalUrl(profile.Avatar, _r2Options.PublicBaseUrl),
            MediaDerivatives.ResolveThumbnailUrl(profile.Avatar, _r2Options.PublicBaseUrl),
            profile.GeneralArea,
            profile.AllowFollowers,
            pets
                .Select(pet => new PublicOwnerPetResponse(
                    pet.Name,
                    pet.Species,
                    pet.CustomSpecies,
                    pet.Breed,
                    pet.Slug,
                    MediaDerivatives.ResolveOriginalUrl(pet.Photo, _r2Options.PublicBaseUrl),
                    MediaDerivatives.ResolveThumbnailUrl(pet.Photo, _r2Options.PublicBaseUrl),
                    pet.HasActiveSmartTag,
                    pet.LostModeEnabled))
                .ToArray());
    }

    /// <summary>
    /// Where a handle points now.
    ///
    /// Answers "current" for a live handle and "moved" for one an account used
    /// to hold, so the edge can redirect instead of serving a dead link. It
    /// deliberately reveals nothing but the destination handle — never who held
    /// it, never when it changed, never an account identifier.
    /// </summary>
    public async Task<OwnerHandleResolutionResponse> ResolveHandleAsync(
        string handle,
        CancellationToken cancellationToken = default)
    {
        var normalized = OwnerHandleRules.Normalize(handle);

        if (normalized is null)
        {
            throw NotFound();
        }

        var current = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(item =>
                item.NormalizedHandle == normalized
                && item.IsSocialEnabled
                && item.User.DeletedAt == null)
            .Select(item => item.Handle)
            .SingleOrDefaultAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(current))
        {
            return new OwnerHandleResolutionResponse(current!, "current", current);
        }

        // Not live. Was it renamed? Take the most recent account to have held
        // it, and only if that account is still social.
        var moved = await _dbContext.OwnerHandleHistories
            .AsNoTracking()
            .Where(history => history.NormalizedHandle == normalized)
            .OrderByDescending(history => history.ChangedAt)
            .Select(history => history.User.SocialProfile)
            .Where(social =>
                social != null
                && social.IsSocialEnabled
                && social.Handle != null
                && social.DisplayName != null)
            .Select(social => social!.Handle)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(moved))
        {
            throw NotFound();
        }

        return new OwnerHandleResolutionResponse(normalized, "moved", moved);
    }

    /// <summary>
    /// A page of public Moments authored by one owner.
    ///
    /// Authored, not "about their pets": a Moment appears once on its author's
    /// profile however many of their pets it features.
    /// </summary>
    public async Task<PublicMomentPageResponse> GetOwnerMomentsAsync(
        string handle,
        string? cursor,
        int? pageSize,
        Guid? viewerId = null,
        CancellationToken cancellationToken = default)
    {
        var normalized = OwnerHandleRules.Normalize(handle);

        if (normalized is null)
        {
            throw NotFound();
        }

        var ownerUserId = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(item =>
                item.NormalizedHandle == normalized
                && item.IsSocialEnabled
                && item.Handle != null
                && item.DisplayName != null
                && item.User.DeletedAt == null
                && item.User.Status == UserStatus.Active)
            .Select(item => (Guid?)item.UserId)
            .SingleOrDefaultAsync(cancellationToken);

        if (!ownerUserId.HasValue)
        {
            throw NotFound();
        }

        var query = SociallyVisibleMoments()
            .Where(moment => moment.AuthorUserId == ownerUserId.Value);

        return await PageMomentsAsync(query, cursor, pageSize, viewerId, cancellationToken);
    }

    /// <summary>
    /// A page of public Moments a pet is a subject of.
    ///
    /// Matches the pet on <c>PetMemories.PetId</c> OR membership in
    /// <c>MomentPets</c>: the primary pet's own page must not depend on a join
    /// row existing. A Moment appears once per pet regardless of how many of the
    /// two conditions it satisfies.
    /// </summary>
    public async Task<PublicMomentPageResponse> GetPetMomentsAsync(
        string publicSlug,
        string? cursor,
        int? pageSize,
        Guid? viewerId = null,
        CancellationToken cancellationToken = default)
    {
        var publicCode = PetDtoMapper.ExtractPublicCode(publicSlug ?? "");

        var pet = await SociallyVisiblePets(_dbContext.Pets)
            .Where(item => item.PublicProfile!.PublicCode == publicCode)
            .Select(item => new
            {
                item.Id,
                item.PublicProfile!.ShowMoments,
                item.PublicProfile.ShowTimeline
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (pet is null || (!pet.ShowMoments && !pet.ShowTimeline))
        {
            throw NotFound();
        }

        var showMoments = pet.ShowMoments;
        var showTimeline = pet.ShowTimeline;

        var query = SociallyVisibleMoments()
            .Where(moment =>
                (moment.PetId == pet.Id
                    || moment.MomentPets.Any(subject => subject.PetId == pet.Id))
                && (showMoments || (showTimeline && moment.ShowInLifeTimeline)));

        return await PageMomentsAsync(query, cursor, pageSize, viewerId, cancellationToken);
    }

    // Both predicates live in SocialVisibility so the like endpoints ask exactly
    // the same question these listings do. Kept as local wrappers only to leave
    // the call sites in this file reading as they did.
    private static IQueryable<Pet> SociallyVisiblePets(IQueryable<Pet> pets)
    {
        return pets.SociallyVisible();
    }

    private IQueryable<PetMemory> SociallyVisibleMoments()
    {
        return _dbContext.PetMemories.SociallyVisible();
    }

    /// <summary>
    /// Hands an already-narrowed query to the shared card projection.
    ///
    /// The selection above is this class's job; describing a Moment is not.
    /// </summary>
    private Task<PublicMomentPageResponse> PageMomentsAsync(
        IQueryable<PetMemory> query,
        string? cursor,
        int? pageSize,
        Guid? viewerId,
        CancellationToken cancellationToken)
    {
        return _momentCards.PageAsync(query, cursor, pageSize, viewerId, cancellationToken);
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "social_profile_not_found",
            "This profile is not available.");
    }
}
