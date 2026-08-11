using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class PublicSampleExperienceService : SkeletonService, IPublicSampleExperienceService
{
    public static readonly Guid SettingsId = Guid.Parse("e7b2fc49-e065-4c4a-ae65-d2678a2fa7c4");

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IPublicProfileService _publicProfiles;
    private readonly IQrSafetyService _safetyProfiles;

    public PublicSampleExperienceService(
        MyPetLinkDbContext dbContext,
        IPublicProfileService publicProfiles,
        IQrSafetyService safetyProfiles)
    {
        _dbContext = dbContext;
        _publicProfiles = publicProfiles;
        _safetyProfiles = safetyProfiles;
    }

    public async Task<PublicSampleExperienceResponse> GetAsync(
        CancellationToken cancellationToken = default)
    {
        var petId = await _dbContext.PublicSiteSettings
            .AsNoTracking()
            .Where(item => item.Id == SettingsId)
            .Select(item => item.FeaturedSamplePetId)
            .SingleOrDefaultAsync(cancellationToken);

        if (!petId.HasValue)
        {
            return Unavailable();
        }

        var identity = await _dbContext.Pets
            .AsNoTracking()
            .Where(pet => pet.Id == petId.Value)
            .Select(pet => new
            {
                pet.IsSampleEligible,
                pet.DeletedAt,
                pet.LifecycleStatus,
                pet.Slug,
                PublicCode = pet.PublicProfile == null ? null : pet.PublicProfile.PublicCode,
                PublicSlug = pet.PublicProfile == null ? null : pet.PublicProfile.SlugSnapshot,
                PublicEnabled = pet.PublicProfile != null && pet.PublicProfile.IsPublicProfileEnabled,
                SafetyCode = pet.SafetySetting == null ? null : pet.SafetySetting.SafetyCode,
                SafetyEnabled = pet.SafetySetting != null && pet.SafetySetting.QrSafetyEnabled,
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (identity is null
            || !identity.IsSampleEligible
            || identity.DeletedAt.HasValue
            || identity.LifecycleStatus != PetLifecycleStatus.Active
            || !identity.PublicEnabled
            || !identity.SafetyEnabled
            || string.IsNullOrWhiteSpace(identity.PublicCode)
            || (string.IsNullOrWhiteSpace(identity.PublicSlug) && string.IsNullOrWhiteSpace(identity.Slug))
            || string.IsNullOrWhiteSpace(identity.SafetyCode))
        {
            return Unavailable();
        }

        try
        {
            // Reuse the canonical public projections so this endpoint cannot
            // bypass profile or Safety Profile privacy/lifecycle rules.
            var profile = await _publicProfiles.GetByPublicSlugAsync(
                $"{(string.IsNullOrWhiteSpace(identity.PublicSlug) ? identity.Slug : identity.PublicSlug)}-{identity.PublicCode}",
                cancellationToken);
            var safety = await _safetyProfiles.GetBySafetyCodeAsync(
                identity.SafetyCode,
                cancellationToken);

            return new PublicSampleExperienceResponse(
                true,
                new PublicSamplePetResponse(
                    profile.Name,
                    profile.CustomSpecies ?? profile.Species,
                    profile.Breed,
                    profile.Age.DisplayLabel,
                    profile.Bio,
                    profile.ProfilePhotoUrl,
                    profile.PublicSlug,
                    profile.PublicCode,
                    safety.SafetyCode));
        }
        catch (ApiException exception) when (exception.StatusCode is 403 or 404)
        {
            return Unavailable();
        }
    }

    private static PublicSampleExperienceResponse Unavailable() => new(false, null);
}

public sealed class AdminSampleExperienceService : SkeletonService, IAdminSampleExperienceService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;
    private readonly string? _publicMediaBaseUrl;

    public AdminSampleExperienceService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
        _publicMediaBaseUrl = r2Options.Value.PublicBaseUrl;
    }

    public async Task<AdminSampleExperienceResponse> GetAsync(
        CancellationToken cancellationToken = default)
    {
        var settings = await LoadSettingsAsync(trackChanges: false, cancellationToken);
        return await ToResponseAsync(settings, cancellationToken);
    }

    public async Task<AdminSampleExperienceResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateSampleExperienceRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(currentUserId, cancellationToken);
        var settings = await LoadSettingsAsync(trackChanges: true, cancellationToken);
        ApplyConcurrency(settings, request.RowVersion);

        if (request.FeaturedSamplePetId.HasValue)
        {
            var pet = await PetGraph()
                .SingleOrDefaultAsync(item => item.Id == request.FeaturedSamplePetId.Value, cancellationToken);
            if (pet is null || !CanBeFeatured(pet))
            {
                throw Validation(
                    "featuredSamplePetId",
                    "Choose an approved active pet with both public experiences available.");
            }
        }

        var previous = new { settings.FeaturedSamplePetId };
        settings.FeaturedSamplePetId = request.FeaturedSamplePetId;
        settings.UpdatedByAdminUserId = admin.Id;
        settings.UpdatedByAdminUser = admin;
        settings.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(
            admin.Id,
            ActorType.Admin,
            "public-site.sample-experience.update",
            "PublicSiteSetting",
            settings.Id,
            previous,
            new { settings.FeaturedSamplePetId });

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "concurrency_conflict",
                "The Sample Experience was changed by another administrator. Refresh and try again.");
        }

        return await ToResponseAsync(settings, cancellationToken);
    }

    private async Task<AdminSampleExperienceResponse> ToResponseAsync(
        PublicSiteSetting settings,
        CancellationToken cancellationToken)
    {
        var eligible = await PetGraph()
            .Where(pet => pet.IsSampleEligible && pet.DeletedAt == null)
            .OrderBy(pet => pet.Name)
            .ThenBy(pet => pet.Id)
            .ToListAsync(cancellationToken);
        var selected = settings.FeaturedSamplePetId.HasValue
            ? eligible.SingleOrDefault(pet => pet.Id == settings.FeaturedSamplePetId.Value)
                ?? await PetGraph().SingleOrDefaultAsync(
                    pet => pet.Id == settings.FeaturedSamplePetId.Value,
                    cancellationToken)
            : null;
        var selectedOption = selected is null ? null : ToOption(selected);
        var status = !settings.FeaturedSamplePetId.HasValue
            ? "Unconfigured"
            : selectedOption?.CanBeFeatured == true ? "Ready" : "NeedsReplacement";

        return new AdminSampleExperienceResponse(
            settings.FeaturedSamplePetId,
            status,
            selectedOption,
            eligible.Select(ToOption).ToArray(),
            settings.UpdatedAt,
            settings.UpdatedByAdminUser?.User?.DisplayName,
            Convert.ToBase64String(settings.RowVersion));
    }

    private IQueryable<Pet> PetGraph() => _dbContext.Pets
        .AsNoTracking()
        .Include(pet => pet.OwnerUser).ThenInclude(user => user.OwnerProfile)
        .Include(pet => pet.ProfileMediaFile)
        .Include(pet => pet.PublicProfile)
        .Include(pet => pet.SafetySetting);

    private AdminSamplePetOptionResponse ToOption(Pet pet)
    {
        var publicAvailable = PublicAvailable(pet);
        var safetyAvailable = SafetyAvailable(pet);
        return new AdminSamplePetOptionResponse(
            pet.Id,
            pet.Name,
            PetDtoMapper.NormalizeOptional(pet.OwnerUser.OwnerProfile?.OwnerDisplayName)
                ?? PetDtoMapper.NormalizeOptional(pet.OwnerUser.DisplayName)
                ?? pet.OwnerUser.Email,
            pet.OwnerUser.Email,
            pet.LifecycleStatus,
            pet.IsSampleEligible,
            publicAvailable,
            safetyAvailable,
            pet.IsSampleEligible && pet.DeletedAt == null
                && pet.LifecycleStatus == PetLifecycleStatus.Active
                && publicAvailable && safetyAvailable,
            PetDtoMapper.ResolvePublicMediaUrl(pet.ProfileMediaFile, _publicMediaBaseUrl),
            pet.PublicProfile is null ? null : PetDtoMapper.ResolvePublicSlug(pet),
            PetDtoMapper.NormalizeOptional(pet.PublicProfile?.PublicCode),
            PetDtoMapper.NormalizeOptional(pet.SafetySetting?.SafetyCode));
    }

    private static bool CanBeFeatured(Pet pet) => pet.IsSampleEligible
        && pet.DeletedAt == null
        && pet.LifecycleStatus == PetLifecycleStatus.Active
        && PublicAvailable(pet)
        && SafetyAvailable(pet);

    private static bool PublicAvailable(Pet pet) => pet.DeletedAt == null
        && pet.LifecycleStatus == PetLifecycleStatus.Active
        && pet.PublicProfile?.IsPublicProfileEnabled == true
        && !string.IsNullOrWhiteSpace(pet.PublicProfile.PublicCode)
        && (!string.IsNullOrWhiteSpace(pet.PublicProfile.SlugSnapshot)
            || !string.IsNullOrWhiteSpace(pet.Slug));

    private static bool SafetyAvailable(Pet pet) => pet.DeletedAt == null
        && pet.LifecycleStatus == PetLifecycleStatus.Active
        && pet.SafetySetting?.QrSafetyEnabled == true
        && !string.IsNullOrWhiteSpace(pet.SafetySetting.SafetyCode);

    private async Task<PublicSiteSetting> LoadSettingsAsync(
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.PublicSiteSettings
            .Include(item => item.UpdatedByAdminUser)
                .ThenInclude(admin => admin!.User)
            .AsQueryable();
        if (!trackChanges) query = query.AsNoTracking();
        return await query.SingleOrDefaultAsync(
                item => item.Id == PublicSampleExperienceService.SettingsId,
                cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status503ServiceUnavailable,
                "sample_experience_unavailable",
                "Sample Experience settings are not available right now.");
    }

    private void ApplyConcurrency(PublicSiteSetting settings, string? rowVersion)
    {
        if (string.IsNullOrWhiteSpace(rowVersion))
            throw Validation("rowVersion", "Refresh the page before saving.");
        try
        {
            _dbContext.Entry(settings).Property(item => item.RowVersion).OriginalValue =
                Convert.FromBase64String(rowVersion);
        }
        catch (FormatException)
        {
            throw Validation("rowVersion", "Reload the page and try again.");
        }
    }

    private async Task<AdminUser> RequireAdminAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken)
    {
        if (!currentUserId.HasValue)
            throw new ApiException(401, "unauthorized", "Authentication is required.");
        return await _dbContext.AdminUsers
            .Include(item => item.User)
            .SingleOrDefaultAsync(
                item => item.UserId == currentUserId.Value
                    && item.IsActive && item.DisabledAt == null,
                cancellationToken)
            ?? throw new ApiException(403, "forbidden", "Admin access is required.");
    }

    private static ApiException Validation(string field, string message) => new(
        400,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
