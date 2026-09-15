using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class PublicProfileService : SkeletonService, IPublicProfileService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;
    private readonly TimeProvider _timeProvider;

    public PublicProfileService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options,
        TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>
    /// The public pet profile.
    ///
    /// This used to load the pet's ENTIRE Moment and Care Record history with
    /// <c>.Include()</c> and then filter it in memory. That was survivable only
    /// because the plan capped a pet at ten Moments; now that public Moments are
    /// uncapped, loading every row of the most-requested page in the product
    /// would be a real problem, and — worse — it meant private, archived and
    /// deleted Moments were pulled out of the database on a public request and
    /// discarded afterwards.
    ///
    /// It is now three narrow projections, each filtered in SQL:
    ///
    ///   1. the profile, pet, owner and media fields actually rendered,
    ///   2. the PUBLIC Moments only, already filtered and ordered,
    ///   3. their media links, batched by Moment id (no N+1),
    ///
    ///   plus a fourth two-column read for public care badges.
    ///
    /// No entity graph is materialised, and a private Moment never leaves the
    /// database on this path.
    /// </summary>
    public async Task<PublicPetProfileResponse> GetByPublicSlugAsync(
        string publicSlug,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(publicSlug))
        {
            throw NotFound();
        }

        var publicCode = PetDtoMapper.ExtractPublicCode(publicSlug);

        var source = await _dbContext.PetPublicProfiles
            .AsNoTracking()
            .Where(item => item.PublicCode == publicCode)
            .Select(item => new PublicProfileProjection
            {
                PublicCode = item.PublicCode,
                IsPublicProfileEnabled = item.IsPublicProfileEnabled,
                ShowOwnerName = item.ShowOwnerName,
                ShowGeneralArea = item.ShowGeneralArea,
                ShowCareBadges = item.ShowCareBadges,
                ShowMoments = item.ShowMoments,
                ShowTimeline = item.ShowTimeline,
                ShowBirthdayOnTimeline = item.ShowBirthdayOnTimeline,
                ShowAllergiesOnPublicProfile = item.ShowAllergiesOnPublicProfile,
                ProfileUpdatedAt = item.UpdatedAt,

                PetId = item.PetId,
                PetUpdatedAt = item.Pet.UpdatedAt,
                Slug = item.Pet.Slug,
                Name = item.Pet.Name,
                Species = item.Pet.Species,
                CustomSpecies = item.Pet.CustomSpecies,
                Breed = item.Pet.Breed,
                Gender = item.Pet.Gender,
                Color = item.Pet.Color,
                Birthday = item.Pet.Birthday,
                EstimatedBirthYear = item.Pet.EstimatedBirthYear,
                AdoptionDay = item.Pet.AdoptionDay,
                ProfileTheme = item.Pet.ProfileTheme,
                LifecycleStatus = item.Pet.LifecycleStatus,
                ShowMemorialOnPublicProfile = item.Pet.ShowMemorialOnPublicProfile,
                MemorialMessage = item.Pet.MemorialMessage,
                DeletedAt = item.Pet.DeletedAt,
                Bio = item.Pet.Bio,
                PersonalityTagsJson = item.Pet.PersonalityTagsJson,
                FavoriteFoodsJson = item.Pet.FavoriteFoodsJson,
                FavoriteToysJson = item.Pet.FavoriteToysJson,
                AllergiesJson = item.Pet.AllergiesJson,
                CoverPositionX = item.Pet.CoverPositionX,
                CoverPositionY = item.Pet.CoverPositionY,
                PetGeneralArea = item.Pet.GeneralArea,

                LostModeEnabled = item.Pet.LostModeEnabled,
                LostLastSeenArea = item.Pet.LostLastSeenArea,
                LostLastSeenDateTime = item.Pet.LostLastSeenDateTime,
                LostMessage = item.Pet.LostMessage,
                LostRewardNote = item.Pet.LostRewardNote,
                LostExtraContactInstruction = item.Pet.LostExtraContactInstruction,

                ContactUseOwnerDefaults = item.Pet.Contact == null
                    ? (bool?)null
                    : item.Pet.Contact.UseOwnerDefaults,
                ContactOwnerDisplayName = item.Pet.Contact == null
                    ? null
                    : item.Pet.Contact.OwnerDisplayName,
                ContactGeneralAreaOverride = item.Pet.Contact == null
                    ? null
                    : item.Pet.Contact.GeneralAreaOverride,

                OwnerDisplayName = item.Pet.OwnerUser.DisplayName,
                OwnerProfileDisplayName = item.Pet.OwnerUser.OwnerProfile == null
                    ? null
                    : item.Pet.OwnerUser.OwnerProfile.OwnerDisplayName,
                OwnerDefaultGeneralArea = item.Pet.OwnerUser.OwnerProfile == null
                    ? null
                    : item.Pet.OwnerUser.OwnerProfile.DefaultGeneralArea,

                QrSafetyEnabled = item.Pet.SafetySetting != null
                    && item.Pet.SafetySetting.QrSafetyEnabled,
                SafetyCode = item.Pet.SafetySetting == null
                    ? null
                    : item.Pet.SafetySetting.SafetyCode,

                ProfileMedia = item.Pet.ProfileMediaFile == null
                    ? null
                    : new PublicMediaProjection
                    {
                        ObjectKey = item.Pet.ProfileMediaFile.ObjectKey,
                        IsPublic = item.Pet.ProfileMediaFile.IsPublic,
                        UploadStatus = item.Pet.ProfileMediaFile.UploadStatus,
                        DeletedAt = item.Pet.ProfileMediaFile.DeletedAt,
                        ThumbnailObjectKey = item.Pet.ProfileMediaFile.ThumbnailObjectKey,
                        DerivativeStatus = item.Pet.ProfileMediaFile.DerivativeStatus
                    },
                CoverMedia = item.Pet.CoverMediaFile == null
                    ? null
                    : new PublicMediaProjection
                    {
                        ObjectKey = item.Pet.CoverMediaFile.ObjectKey,
                        IsPublic = item.Pet.CoverMediaFile.IsPublic,
                        UploadStatus = item.Pet.CoverMediaFile.UploadStatus,
                        DeletedAt = item.Pet.CoverMediaFile.DeletedAt,
                        ThumbnailObjectKey = item.Pet.CoverMediaFile.ThumbnailObjectKey,
                        DerivativeStatus = item.Pet.CoverMediaFile.DerivativeStatus
                    }
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (source is null
            || !source.IsPublicProfileEnabled
            || source.DeletedAt.HasValue
            || source.LifecycleStatus == PetLifecycleStatus.Archived)
        {
            throw NotFound();
        }

        if (source.LifecycleStatus == PetLifecycleStatus.Memorial
            && !source.ShowMemorialOnPublicProfile)
        {
            throw NotFound();
        }

        var memories = await LoadPublicMemoriesAsync(source, cancellationToken);
        var careRecords = await LoadPublicCareBadgesAsync(source, cancellationToken);

        var age = PetAgeCalculator.Calculate(source.Birthday, source.EstimatedBirthYear);
        var profilePhotoUrl = source.ProfileMedia?.ResolveUrl(_r2Options.PublicBaseUrl);
        var coverPhotoUrl = source.CoverMedia?.ResolveUrl(_r2Options.PublicBaseUrl);
        var publicProfileVersion = PublicProfileVersion.Create(
            source.ToVersionInputs(),
            age.DisplayLabel,
            profilePhotoUrl,
            coverPhotoUrl);
        var lostModeActive = source.LostModeEnabled
            && source.LifecycleStatus == PetLifecycleStatus.Active;

        return new PublicPetProfileResponse(
            source.PublicCode,
            source.Slug,
            publicProfileVersion,
            source.LifecycleStatus == PetLifecycleStatus.Active && source.QrSafetyEnabled
                ? source.SafetyCode
                : null,
            source.Name,
            source.Species,
            source.CustomSpecies,
            source.Breed,
            source.Gender,
            source.Color,
            source.Birthday,
            source.EstimatedBirthYear,
            age,
            source.AdoptionDay,
            source.ProfileTheme,
            source.LifecycleStatus,
            lostModeActive,
            lostModeActive ? source.LostLastSeenArea : null,
            lostModeActive ? source.LostLastSeenDateTime : null,
            lostModeActive ? source.LostMessage : null,
            lostModeActive ? source.LostRewardNote : null,
            lostModeActive ? source.LostExtraContactInstruction : null,
            source.ShowOwnerName ? source.ResolveOwnerDisplayName() : null,
            source.ShowGeneralArea ? source.ResolveGeneralArea() : null,
            source.ShowCareBadges,
            source.ShowMoments,
            source.ShowTimeline,
            source.ShowBirthdayOnTimeline,
            profilePhotoUrl,
            coverPhotoUrl,
            source.CoverPositionX,
            source.CoverPositionY,
            source.Bio,
            PetDtoMapper.ParsePersonalityTags(source.PersonalityTagsJson),
            PetDtoMapper.ParseFavoriteList(source.FavoriteFoodsJson),
            PetDtoMapper.ParseFavoriteList(source.FavoriteToysJson),
            source.ShowAllergiesOnPublicProfile
                ? PetDtoMapper.ParseAllergies(source.AllergiesJson)
                : Array.Empty<string>(),
            source.LifecycleStatus == PetLifecycleStatus.Memorial ? source.MemorialMessage : null,
            memories,
            careRecords);
    }

    /// <summary>
    /// The pet's PUBLIC Moments, filtered and ordered in SQL.
    ///
    /// Gallery and Timeline are independent surfaces. Public is the only
    /// audience allowed through this boundary; every other visibility value is
    /// compatibility-private and is excluded by the query itself, so a private
    /// Moment is never read on a public request.
    ///
    /// Note this is deliberately still UNPAGINATED, matching the behaviour the
    /// Public Share Profile has today — removing content silently would be
    /// worse than returning it. Now that the ten-Moment ceiling is gone, a
    /// cursor-paginated Moments endpoint is required before the Social profile
    /// ships; see docs/architecture/social-foundation.md.
    /// </summary>
    private async Task<PublicMemorySummaryResponse[]> LoadPublicMemoriesAsync(
        PublicProfileProjection source,
        CancellationToken cancellationToken)
    {
        if (!source.ShowMoments && !source.ShowTimeline)
        {
            return Array.Empty<PublicMemorySummaryResponse>();
        }

        var showMoments = source.ShowMoments;
        var showTimeline = source.ShowTimeline;

        var memories = await _dbContext.PetMemories
            .AsNoTracking()
            .Where(memory =>
                memory.PetId == source.PetId
                && memory.DeletedAt == null
                && memory.ArchivedAt == null
                && memory.Visibility == MemoryVisibility.Public
                && (showMoments || (showTimeline && memory.ShowInLifeTimeline)))
            .OrderByDescending(memory => memory.MomentDate)
            .ThenByDescending(memory => memory.CreatedAt)
            .Select(memory => new
            {
                memory.Id,
                memory.Title,
                memory.MomentDate,
                memory.Type,
                memory.Caption,
                memory.Visibility,
                memory.ShowInLifeTimeline,
                memory.TimelineNote
            })
            .ToListAsync(cancellationToken);

        if (memories.Count == 0)
        {
            return Array.Empty<PublicMemorySummaryResponse>();
        }

        var media = await LoadPublicMemoryMediaAsync(
            memories.Select(memory => memory.Id).ToArray(),
            cancellationToken);

        return memories
            .Select(memory => new PublicMemorySummaryResponse(
                memory.Title,
                memory.MomentDate,
                memory.Type,
                memory.Caption,
                memory.Visibility,
                // This response field remains temporarily for existing
                // clients, but now represents effective gallery placement.
                source.ShowMoments,
                memory.ShowInLifeTimeline,
                memory.TimelineNote,
                media.TryGetValue(memory.Id, out var items)
                    ? items
                    : Array.Empty<MemoryMediaResponse>()))
            .ToArray();
    }

    /// <summary>
    /// The public care badges: the most recent public record per care type.
    ///
    /// Only two columns are read, and only for records already filtered to
    /// public in SQL. The "latest per type" grouping then runs over a handful of
    /// values rather than over a materialised CareRecord graph.
    ///
    /// Allergies are excluded here on purpose — they are surfaced through the
    /// pet's own allergy list under its own visibility flag, not as a care badge.
    /// </summary>
    private async Task<PublicCareSummaryResponse[]> LoadPublicCareBadgesAsync(
        PublicProfileProjection source,
        CancellationToken cancellationToken)
    {
        if (!source.ShowCareBadges)
        {
            return Array.Empty<PublicCareSummaryResponse>();
        }

        var records = await _dbContext.CareRecords
            .AsNoTracking()
            .Where(record =>
                record.PetId == source.PetId
                && record.DeletedAt == null
                && record.ArchivedAt == null
                && record.Type != CareRecordType.Allergy
                && (record.PublicVisibility == CareRecordPublicVisibility.PublicBadgeOnly
                    || record.PublicVisibility == CareRecordPublicVisibility.PublicDetails))
            .Select(record => new { record.Id, record.Type, record.RecordDate })
            .ToListAsync(cancellationToken);

        return records
            .GroupBy(record => record.Type)
            .Select(group => group
                .OrderByDescending(record => record.RecordDate)
                .ThenBy(record => record.Id)
                .First())
            .OrderByDescending(record => record.RecordDate)
            .ThenBy(record => record.Type.ToString(), StringComparer.Ordinal)
            .Select(record => new PublicCareSummaryResponse(
                record.Type.ToString(),
                record.RecordDate))
            .ToArray();
    }

    public async Task<PublicProfileSocialResponse> GetSocialByPublicSlugAsync(
        string publicSlug,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(publicSlug))
        {
            throw NotFound();
        }

        var publicCode = PetDtoMapper.ExtractPublicCode(publicSlug);
        var profile = await _dbContext.PetPublicProfiles
            .AsNoTracking()
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.ProfileMediaFile)
            .Include(item => item.Pet)
                .ThenInclude(pet => pet.CoverMediaFile)
            .SingleOrDefaultAsync(item => item.PublicCode == publicCode, cancellationToken);

        if (profile is null
            || !profile.IsPublicProfileEnabled
            || profile.Pet.DeletedAt.HasValue
            || profile.Pet.LifecycleStatus == PetLifecycleStatus.Archived
            || (profile.Pet.LifecycleStatus == PetLifecycleStatus.Memorial
                && !profile.Pet.ShowMemorialOnPublicProfile))
        {
            throw NotFound();
        }

        var pet = profile.Pet;
        var age = PetAgeCalculator.Calculate(pet.Birthday, pet.EstimatedBirthYear);
        var profilePhotoUrl = PetDtoMapper.ResolvePublicMediaUrl(
            pet.ProfileMediaFile,
            _r2Options.PublicBaseUrl);
        var coverPhotoUrl = PetDtoMapper.ResolvePublicMediaUrl(
            pet.CoverMediaFile,
            _r2Options.PublicBaseUrl);

        return new PublicProfileSocialResponse(
            profile.PublicCode,
            PetDtoMapper.ResolvePublicSlug(pet),
            PublicProfileVersion.Create(
                profile,
                pet,
                age.DisplayLabel,
                profilePhotoUrl,
                coverPhotoUrl),
            pet.Name,
            pet.Species,
            pet.CustomSpecies,
            pet.Breed,
            age.DisplayLabel,
            pet.LifecycleStatus,
            pet.LostModeEnabled && pet.LifecycleStatus == PetLifecycleStatus.Active,
            profilePhotoUrl,
            coverPhotoUrl,
            pet.CoverPositionX,
            pet.CoverPositionY,
            ShareCardPalette.Resolve(pet.ProfileTheme) == ShareCardPalette.Default
                ? "default"
                : pet.ProfileTheme.Trim());
    }

    public async Task<PublicProfileCardOccasions> GetSocialCardOccasionsAsync(
        string publicSlug,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(publicSlug)) throw NotFound();

        var publicCode = PetDtoMapper.ExtractPublicCode(publicSlug);
        var source = await _dbContext.PetPublicProfiles
            .AsNoTracking()
            .Where(item => item.PublicCode == publicCode)
            .Select(item => new
            {
                item.IsPublicProfileEnabled,
                item.Pet.Birthday,
                item.Pet.AdoptionDay,
                item.Pet.DeletedAt,
                item.Pet.LifecycleStatus
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (source is null
            || !source.IsPublicProfileEnabled
            || source.DeletedAt.HasValue
            || source.LifecycleStatus is PetLifecycleStatus.Archived or PetLifecycleStatus.Memorial)
        {
            throw NotFound();
        }

        var today = PetOccasionCalculator.MalaysiaToday(_timeProvider.GetUtcNow());
        return PetOccasionCalculator.Calculate(source.Birthday, source.AdoptionDay, today);
    }

    private async Task<Dictionary<Guid, MemoryMediaResponse[]>> LoadPublicMemoryMediaAsync(
        IReadOnlyCollection<Guid> memoryIds,
        CancellationToken cancellationToken)
    {
        var links = await _dbContext.MediaFileLinks
            .AsNoTracking()
            .Include(link => link.MediaFile)
            .Where(link =>
                memoryIds.Contains(link.OwnerId)
                && link.OwnerType == MediaOwnerType.PetMemory
                && link.ArchivedAt == null
                && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && link.MediaFile.IsPublic
                && link.MediaFile.DeletedAt == null)
            .OrderBy(link => link.SortOrder)
            .ToListAsync(cancellationToken);

        return links
            .GroupBy(link => link.OwnerId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .Select(link => new MemoryMediaResponse(
                        link.MediaFileId,
                        link.MediaFile.MediaType == MediaFileType.Video ? "video" : "image",
                        PetDtoMapper.ResolvePublicMediaUrl(link.MediaFile, _r2Options.PublicBaseUrl),
                        link.Caption,
                        link.AltText,
                        link.SortOrder))
                    .ToArray());
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "public_profile_not_found",
            "This public pet profile is not available.");
    }

    /// <summary>
    /// Exactly the columns the public profile renders. A flat projection rather
    /// than an entity graph, so a public request reads what it shows and nothing
    /// else — no private notes, no contact numbers, no unrelated rows.
    /// </summary>
    private sealed class PublicProfileProjection
    {
        public required string PublicCode { get; init; }
        public required bool IsPublicProfileEnabled { get; init; }
        public required bool ShowOwnerName { get; init; }
        public required bool ShowGeneralArea { get; init; }
        public required bool ShowCareBadges { get; init; }
        public required bool ShowMoments { get; init; }
        public required bool ShowTimeline { get; init; }
        public required bool ShowBirthdayOnTimeline { get; init; }
        public required bool ShowAllergiesOnPublicProfile { get; init; }
        public required DateTimeOffset ProfileUpdatedAt { get; init; }

        public required Guid PetId { get; init; }
        public required DateTimeOffset PetUpdatedAt { get; init; }
        public required string Slug { get; init; }
        public required string Name { get; init; }
        public required string Species { get; init; }
        public string? CustomSpecies { get; init; }
        public string? Breed { get; init; }
        public string? Gender { get; init; }
        public string? Color { get; init; }
        public DateOnly? Birthday { get; init; }
        public short? EstimatedBirthYear { get; init; }
        public DateOnly? AdoptionDay { get; init; }
        public required string ProfileTheme { get; init; }
        public required PetLifecycleStatus LifecycleStatus { get; init; }
        public required bool ShowMemorialOnPublicProfile { get; init; }
        public string? MemorialMessage { get; init; }
        public DateTimeOffset? DeletedAt { get; init; }
        public string? Bio { get; init; }
        public required string PersonalityTagsJson { get; init; }
        public required string FavoriteFoodsJson { get; init; }
        public required string FavoriteToysJson { get; init; }
        public required string AllergiesJson { get; init; }
        public required byte CoverPositionX { get; init; }
        public required byte CoverPositionY { get; init; }
        public string? PetGeneralArea { get; init; }

        public required bool LostModeEnabled { get; init; }
        public string? LostLastSeenArea { get; init; }
        public DateTimeOffset? LostLastSeenDateTime { get; init; }
        public string? LostMessage { get; init; }
        public string? LostRewardNote { get; init; }
        public string? LostExtraContactInstruction { get; init; }

        public bool? ContactUseOwnerDefaults { get; init; }
        public string? ContactOwnerDisplayName { get; init; }
        public string? ContactGeneralAreaOverride { get; init; }

        public required string OwnerDisplayName { get; init; }
        public string? OwnerProfileDisplayName { get; init; }
        public string? OwnerDefaultGeneralArea { get; init; }

        public required bool QrSafetyEnabled { get; init; }
        public string? SafetyCode { get; init; }

        public PublicMediaProjection? ProfileMedia { get; init; }
        public PublicMediaProjection? CoverMedia { get; init; }

        /// <summary>
        /// Mirrors <c>PetDtoMapper.ResolveOwnerDisplayName</c> against projected
        /// columns. A per-pet override wins; otherwise the owner profile name,
        /// then the account name.
        /// </summary>
        public string? ResolveOwnerDisplayName()
        {
            if (ContactUseOwnerDefaults == false)
            {
                return Normalize(ContactOwnerDisplayName);
            }

            return Normalize(OwnerProfileDisplayName) ?? Normalize(OwnerDisplayName);
        }

        /// <summary>
        /// Mirrors <c>PetDtoMapper.ResolveGeneralArea</c>: the per-pet override,
        /// then the pet's own area, then the owner default.
        /// </summary>
        public string? ResolveGeneralArea()
        {
            return Normalize(ContactGeneralAreaOverride)
                ?? Normalize(PetGeneralArea)
                ?? Normalize(OwnerDefaultGeneralArea);
        }

        public PublicProfileVersionInputs ToVersionInputs()
        {
            return new PublicProfileVersionInputs(
                PublicCode,
                IsPublicProfileEnabled,
                ProfileUpdatedAt,
                PetUpdatedAt,
                Name,
                Species,
                CustomSpecies,
                Breed,
                CoverPositionX,
                CoverPositionY,
                ProfileTheme,
                LifecycleStatus,
                LostModeEnabled);
        }

        private static string? Normalize(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }
    }

    /// <summary>
    /// The media columns needed to decide whether a file may be served publicly
    /// and which URL to serve. Mirrors <c>MediaDerivatives</c> so the rule stays
    /// in one place.
    /// </summary>
    private sealed class PublicMediaProjection
    {
        public required string ObjectKey { get; init; }
        public required bool IsPublic { get; init; }
        public required MediaUploadStatus UploadStatus { get; init; }
        public DateTimeOffset? DeletedAt { get; init; }
        public string? ThumbnailObjectKey { get; init; }
        public required MediaDerivativeStatus DerivativeStatus { get; init; }

        public string? ResolveUrl(string? publicBaseUrl)
        {
            if (!IsPublic || UploadStatus != MediaUploadStatus.Ready || DeletedAt.HasValue)
            {
                return null;
            }

            var url = MediaUrlBuilder.BuildPublicUrl(publicBaseUrl, ObjectKey);
            return string.IsNullOrWhiteSpace(url) ? null : url;
        }
    }
}
