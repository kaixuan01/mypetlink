using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class PetService : SkeletonService, IPetService
{
    private const string FreePlanCode = "Free";
    private static readonly Regex E164Pattern = new(@"^\+[1-9]\d{6,14}$", RegexOptions.Compiled);

    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;

    public PetService(MyPetLinkDbContext dbContext, IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
    }

    public async Task<(IReadOnlyCollection<PetListItemResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        string? lifecycleStatus,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var query = _dbContext.Pets
            .AsNoTracking()
            .Include(pet => pet.PublicProfile)
            .Include(pet => pet.SafetySetting)
            .Include(pet => pet.ProfileMediaFile)
            .Include(pet => pet.CoverMediaFile)
            .Where(pet => pet.OwnerUserId == userId && pet.DeletedAt == null);

        query = ApplyLifecycleFilter(query, lifecycleStatus);

        var total = await query.CountAsync(cancellationToken);
        var pets = await query
            .OrderByDescending(pet => pet.UpdatedAt)
            .ThenBy(pet => pet.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = pets.Select(ToListItem).ToArray();

        return (items, total);
    }

    public async Task<PetDetailResponse> CreateAsync(
        Guid? currentUserId,
        CreatePetRequest request,
        CancellationToken cancellationToken = default)
    {
        var user = await LoadOwnerUserAsync(currentUserId, cancellationToken);
        var age = ValidateCreateRequest(request);
        ValidateContact(request.Contact);
        ValidateCoverPosition(request.CoverPositionX, request.CoverPositionY);
        await EnsureCanCreateActivePetAsync(user, cancellationToken);

        var publicCode = await GenerateUniquePublicCodeAsync(cancellationToken);
        var safetyCode = await GenerateUniqueSafetyCodeAsync(cancellationToken);
        var publicSlug = PetDtoMapper.BuildPublicSlug(request.Name, publicCode);
        var visibility = request.Visibility ?? ParseOwnerDefaultVisibility(user.OwnerProfile!);

        var pet = new Pet
        {
            OwnerUserId = user.Id,
            OwnerUser = user,
            Slug = publicSlug,
            Name = request.Name.Trim(),
            Species = request.Species.Trim(),
            CustomSpecies = PetDtoMapper.NormalizeOptional(request.CustomSpecies),
            Breed = PetDtoMapper.NormalizeOptional(request.Breed),
            Gender = PetDtoMapper.NormalizeOptional(request.Gender),
            Color = PetDtoMapper.NormalizeOptional(request.Color),
            Birthday = age.Birthday,
            EstimatedBirthYear = age.EstimatedBirthYear,
            AdoptionDay = request.AdoptionDay,
            GeneralArea = PetDtoMapper.NormalizeOptional(request.GeneralArea) ?? user.OwnerProfile!.DefaultGeneralArea,
            Bio = PetDtoMapper.NormalizeOptional(request.Bio),
            PersonalityTagsJson = PetDtoMapper.SerializePersonalityTags(request.PersonalityTags),
            FavoriteFoodsJson = PetDtoMapper.SerializeFavoriteList(
                ResolveFavoriteItems(request.FavoriteFoods, request.FavoriteFood)),
            FavoriteToysJson = PetDtoMapper.SerializeFavoriteList(
                ResolveFavoriteItems(request.FavoriteToys, request.FavoriteToy)),
            CoverPositionX = request.CoverPositionX ?? 50,
            CoverPositionY = request.CoverPositionY ?? 50,
            ProfileTheme = PetDtoMapper.NormalizeOptional(request.ProfileTheme) ?? "default",
            LifecycleStatus = PetLifecycleStatus.Active,
            LostModeEnabled = false,
            SafetyNote = PetDtoMapper.NormalizeOptional(request.SafetyNote),
            EmergencyNote = PetDtoMapper.NormalizeOptional(request.EmergencyNote),
            PublicProfile = new PetPublicProfile
            {
                PublicCode = publicCode,
                SlugSnapshot = publicSlug,
                ShowOwnerName = visibility.ShowOwnerName,
                ShowGeneralArea = visibility.ShowGeneralArea,
                ShowCareBadges = visibility.ShowCareBadges,
                ShowMoments = visibility.ShowMoments,
                ShowTimeline = visibility.ShowTimeline,
                ShowBirthdayOnTimeline = visibility.ShowBirthdayOnTimeline,
                ShowAdoptionDayOnTimeline = visibility.ShowAdoptionDayOnTimeline,
                ShowHealthSummary = visibility.ShowHealthSummary,
                IsPublicProfileEnabled = true
            },
            SafetySetting = new PetSafetySetting
            {
                SafetyCode = safetyCode,
                QrSafetyEnabled = true,
                ShowPhone = visibility.ShowPhone,
                ShowWhatsapp = visibility.ShowWhatsapp,
                ShowEmergencyNote = visibility.ShowEmergencyNote,
                ShowFoundLocationAction = true
            }
        };

        pet.Contact = BuildPetContact(request.Contact, user);

        _dbContext.Pets.Add(pet);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToDetail(pet);
    }

    public async Task<PetDetailResponse> GetAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default)
    {
        var pet = await LoadOwnedPetAsync(currentUserId, petId, trackChanges: false, cancellationToken);
        return ToDetail(pet);
    }

    public async Task<PetDetailResponse> UpdateAsync(
        Guid? currentUserId,
        Guid petId,
        UpdatePetRequest request,
        CancellationToken cancellationToken = default)
    {
        var pet = await LoadOwnedPetAsync(currentUserId, petId, trackChanges: true, cancellationToken);
        var ageUpdate = ValidateUpdateRequest(request);
        ValidateContact(request.Contact);
        ValidateCoverPosition(request.CoverPositionX, request.CoverPositionY);
        await EnsurePetPublicArtifactsAsync(pet, cancellationToken);

        if (request.Name is not null)
        {
            pet.Name = request.Name.Trim();
            var publicCode = pet.PublicProfile!.PublicCode;
            pet.Slug = PetDtoMapper.BuildPublicSlug(pet.Name, publicCode);
            pet.PublicProfile.SlugSnapshot = pet.Slug;
        }

        if (request.Species is not null)
        {
            pet.Species = request.Species.Trim();
        }

        if (request.CustomSpecies is not null)
        {
            pet.CustomSpecies = PetDtoMapper.NormalizeOptional(request.CustomSpecies);
        }

        if (request.Breed is not null)
        {
            pet.Breed = PetDtoMapper.NormalizeOptional(request.Breed);
        }

        if (request.Gender is not null)
        {
            pet.Gender = PetDtoMapper.NormalizeOptional(request.Gender);
        }

        if (request.Color is not null)
        {
            pet.Color = PetDtoMapper.NormalizeOptional(request.Color);
        }

        if (ageUpdate is not null)
        {
            pet.Birthday = ageUpdate.Birthday;
            pet.EstimatedBirthYear = ageUpdate.EstimatedBirthYear;
            pet.EstimatedAgeLabel = null;
        }

        if (request.AdoptionDay.HasValue)
        {
            pet.AdoptionDay = request.AdoptionDay;
        }

        if (request.GeneralArea is not null)
        {
            pet.GeneralArea = PetDtoMapper.NormalizeOptional(request.GeneralArea);
        }

        if (request.Bio is not null)
        {
            pet.Bio = PetDtoMapper.NormalizeOptional(request.Bio);
        }

        // A provided list (including an empty one) replaces the saved tags, so the
        // owner can add, remove, replace, or clear them. Null means "no change".
        if (request.PersonalityTags is not null)
        {
            pet.PersonalityTagsJson = PetDtoMapper.SerializePersonalityTags(request.PersonalityTags);
        }

        // Favourite lists follow the same replace-or-no-change rule. The legacy
        // single-value fields are still honoured when a list is not provided.
        if (request.FavoriteFoods is not null || request.FavoriteFood is not null)
        {
            pet.FavoriteFoodsJson = PetDtoMapper.SerializeFavoriteList(
                ResolveFavoriteItems(request.FavoriteFoods, request.FavoriteFood));
        }

        if (request.FavoriteToys is not null || request.FavoriteToy is not null)
        {
            pet.FavoriteToysJson = PetDtoMapper.SerializeFavoriteList(
                ResolveFavoriteItems(request.FavoriteToys, request.FavoriteToy));
        }

        if (request.ProfileTheme is not null)
        {
            pet.ProfileTheme = PetDtoMapper.NormalizeOptional(request.ProfileTheme) ?? "default";
        }

        if (request.CoverPositionX.HasValue)
        {
            pet.CoverPositionX = request.CoverPositionX.Value;
        }

        if (request.CoverPositionY.HasValue)
        {
            pet.CoverPositionY = request.CoverPositionY.Value;
        }

        if (request.SafetyNote is not null)
        {
            pet.SafetyNote = PetDtoMapper.NormalizeOptional(request.SafetyNote);
        }

        if (request.EmergencyNote is not null)
        {
            pet.EmergencyNote = PetDtoMapper.NormalizeOptional(request.EmergencyNote);
        }

        if (request.Contact is not null)
        {
            ApplyPetContact(pet, request.Contact, pet.OwnerUser);
        }

        if (request.Visibility is not null)
        {
            ApplyVisibility(pet, request.Visibility);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToDetail(pet);
    }

    public async Task<PetDetailResponse> MarkMemorialAsync(
        Guid? currentUserId,
        Guid petId,
        MarkPetMemorialRequest request,
        CancellationToken cancellationToken = default)
    {
        var pet = await LoadOwnedPetAsync(currentUserId, petId, trackChanges: true, cancellationToken);

        if (pet.LifecycleStatus == PetLifecycleStatus.Archived)
        {
            throw InvalidState("Archived pets must be restored before marking memorial.");
        }

        if (request.PassedAwayDate.HasValue && request.PassedAwayDate.Value > DateOnly.FromDateTime(DateTime.UtcNow))
        {
            throw ValidationFailed("passedAwayDate", "Passed away date cannot be in the future.");
        }

        pet.PreviousLifecycleStatus = pet.LifecycleStatus;
        pet.LifecycleStatus = PetLifecycleStatus.Memorial;
        pet.MemorialPassedAwayDate = request.PassedAwayDate;
        pet.MemorialMessage = PetDtoMapper.NormalizeOptional(request.MemorialMessage);
        pet.ShowMemorialOnPublicProfile = request.ShowMemorialOnPublicProfile;
        pet.LostModeEnabled = false;
        pet.ArchivedAt = null;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToDetail(pet);
    }

    public async Task<PetDetailResponse> RestoreActiveAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default)
    {
        var pet = await LoadOwnedPetAsync(currentUserId, petId, trackChanges: true, cancellationToken);

        if (pet.LifecycleStatus == PetLifecycleStatus.Active)
        {
            return ToDetail(pet);
        }

        await EnsureCanRestoreActivePetAsync(pet, cancellationToken);

        pet.PreviousLifecycleStatus = pet.LifecycleStatus;
        pet.LifecycleStatus = PetLifecycleStatus.Active;
        pet.ArchivedAt = null;
        // Memorial details belong to the pet's history. Restoring finder and
        // active-list behavior must not silently erase the owner's date or note.

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToDetail(pet);
    }

    public async Task<PetDetailResponse> ArchiveAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default)
    {
        var pet = await LoadOwnedPetAsync(currentUserId, petId, trackChanges: true, cancellationToken);

        if (pet.LifecycleStatus != PetLifecycleStatus.Archived)
        {
            pet.PreviousLifecycleStatus = pet.LifecycleStatus;
            pet.LifecycleStatus = PetLifecycleStatus.Archived;
        }

        pet.ArchivedAt ??= DateTimeOffset.UtcNow;
        pet.LostModeEnabled = false;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToDetail(pet);
    }

    private async Task<User> LoadOwnerUserAsync(Guid? currentUserId, CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var user = await _dbContext.Users
            .Include(item => item.OwnerProfile)!
                .ThenInclude(profile => profile!.Plan)
                    .ThenInclude(plan => plan.Limit)
            .SingleOrDefaultAsync(item => item.Id == userId && item.DeletedAt == null, cancellationToken);

        if (user is null || user.Status != UserStatus.Active)
        {
            throw Unauthorized();
        }

        if (user.OwnerProfile is null)
        {
            var freePlan = await _dbContext.Plans
                .Include(plan => plan.Limit)
                .SingleOrDefaultAsync(plan => plan.Code == FreePlanCode && plan.ArchivedAt == null, cancellationToken)
                ?? throw ServerConfig("default_plan_not_configured", "The default owner plan is not configured.");

            user.OwnerProfile = new OwnerProfile
            {
                UserId = user.Id,
                PlanId = freePlan.Id,
                Plan = freePlan,
                OwnerDisplayName = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName,
                PrivacyDefaultsJson = PetDtoMapper.SerializeVisibility(PetDtoMapper.DefaultVisibilityRequest),
                NotificationPreferencesJson = "{}"
            };

            _dbContext.OwnerProfiles.Add(user.OwnerProfile);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return user;
    }

    private async Task<Pet> LoadOwnedPetAsync(
        Guid? currentUserId,
        Guid petId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var userId = RequireUserId(currentUserId);
        var query = _dbContext.Pets
            .Include(pet => pet.OwnerUser)
                .ThenInclude(user => user.OwnerProfile)
            .Include(pet => pet.Contact)
            .Include(pet => pet.PublicProfile)
            .Include(pet => pet.SafetySetting)
            .Include(pet => pet.ProfileMediaFile)
            .Include(pet => pet.CoverMediaFile)
            .Where(pet => pet.Id == petId && pet.OwnerUserId == userId && pet.DeletedAt == null);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var pet = await query.SingleOrDefaultAsync(cancellationToken);
        if (pet is null)
        {
            throw NotFound("Pet was not found.");
        }

        return pet;
    }

    private PetListItemResponse ToListItem(Pet pet)
    {
        return PetDtoMapper.ToListItem(pet, _r2Options.PublicBaseUrl);
    }

    private PetDetailResponse ToDetail(Pet pet)
    {
        return PetDtoMapper.ToDetail(pet, _r2Options.PublicBaseUrl);
    }

    // Prefers the multi-value list; falls back to the legacy single-value field
    // from older clients (wrapped as a one-item list, empty string clears).
    private static IReadOnlyList<string>? ResolveFavoriteItems(
        IReadOnlyList<string>? items,
        string? legacySingleValue)
    {
        if (items is not null)
        {
            return items;
        }

        if (legacySingleValue is null)
        {
            return null;
        }

        return string.IsNullOrWhiteSpace(legacySingleValue)
            ? Array.Empty<string>()
            : new[] { legacySingleValue };
    }

    private static IQueryable<Pet> ApplyLifecycleFilter(IQueryable<Pet> query, string? lifecycleStatus)
    {
        if (string.IsNullOrWhiteSpace(lifecycleStatus))
        {
            return query.Where(pet => pet.LifecycleStatus == PetLifecycleStatus.Active);
        }

        if (string.Equals(lifecycleStatus, "All", StringComparison.OrdinalIgnoreCase))
        {
            return query;
        }

        if (!Enum.TryParse<PetLifecycleStatus>(lifecycleStatus, ignoreCase: true, out var status))
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]>
                {
                    ["lifecycleStatus"] = ["Lifecycle status must be Active, Memorial, Archived, or All."]
                });
        }

        return query.Where(pet => pet.LifecycleStatus == status);
    }

    private async Task EnsureCanCreateActivePetAsync(User user, CancellationToken cancellationToken)
    {
        var activePetCount = await _dbContext.Pets.CountAsync(
            pet =>
                pet.OwnerUserId == user.Id
                && pet.DeletedAt == null
                && pet.LifecycleStatus == PetLifecycleStatus.Active,
            cancellationToken);

        var maxPets = user.OwnerProfile?.Plan.Limit?.MaxPets
            ?? throw ServerConfig("plan_limit_not_configured", "The active plan limit is not configured.");

        if (activePetCount >= maxPets)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "plan_limit_reached",
                $"Your current plan allows up to {maxPets} active pet profiles.");
        }
    }

    private async Task EnsureCanRestoreActivePetAsync(Pet pet, CancellationToken cancellationToken)
    {
        var user = await LoadOwnerUserAsync(pet.OwnerUserId, cancellationToken);
        var activePetCount = await _dbContext.Pets.CountAsync(
            item =>
                item.OwnerUserId == pet.OwnerUserId
                && item.Id != pet.Id
                && item.DeletedAt == null
                && item.LifecycleStatus == PetLifecycleStatus.Active,
            cancellationToken);

        var maxPets = user.OwnerProfile?.Plan.Limit?.MaxPets
            ?? throw ServerConfig("plan_limit_not_configured", "The active plan limit is not configured.");

        if (activePetCount >= maxPets)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "plan_limit_reached",
                $"Your current plan allows up to {maxPets} active pet profiles.");
        }
    }

    private static PetVisibilityRequest ParseOwnerDefaultVisibility(OwnerProfile ownerProfile)
    {
        var defaults = PetDtoMapper.ParseVisibility(ownerProfile.PrivacyDefaultsJson);
        return new PetVisibilityRequest(
            defaults.ShowOwnerName,
            defaults.ShowGeneralArea,
            defaults.ShowPhone,
            defaults.ShowWhatsapp,
            defaults.ShowEmergencyNote,
            defaults.ShowCareBadges,
            defaults.ShowMoments,
            defaults.ShowTimeline,
            defaults.ShowBirthdayOnTimeline,
            defaults.ShowAdoptionDayOnTimeline,
            defaults.ShowHealthSummary);
    }

    private static PetContact BuildPetContact(PetContactRequest? request, User user)
    {
        if (request is null)
        {
            return new PetContact
            {
                UseOwnerDefaults = true,
                OwnerDisplayName = user.OwnerProfile?.OwnerDisplayName ?? user.DisplayName,
                PhoneE164 = user.PhoneE164,
                WhatsappE164 = user.WhatsappE164,
                GeneralAreaOverride = user.OwnerProfile?.DefaultGeneralArea
            };
        }

        return new PetContact
        {
            UseOwnerDefaults = request.UseOwnerDefaults,
            OwnerDisplayName = request.UseOwnerDefaults
                ? user.OwnerProfile?.OwnerDisplayName ?? user.DisplayName
                : PetDtoMapper.NormalizeOptional(request.OwnerDisplayName),
            PhoneE164 = request.UseOwnerDefaults ? user.PhoneE164 : PetDtoMapper.NormalizeOptional(request.PhoneE164),
            WhatsappE164 = request.UseOwnerDefaults ? user.WhatsappE164 : PetDtoMapper.NormalizeOptional(request.WhatsappE164),
            EmergencyContactE164 = PetDtoMapper.NormalizeOptional(request.EmergencyContactE164),
            GeneralAreaOverride = request.UseOwnerDefaults
                ? user.OwnerProfile?.DefaultGeneralArea
                : PetDtoMapper.NormalizeOptional(request.GeneralAreaOverride)
        };
    }

    private static void ApplyPetContact(Pet pet, PetContactRequest request, User user)
    {
        pet.Contact ??= new PetContact { PetId = pet.Id };
        pet.Contact.UseOwnerDefaults = request.UseOwnerDefaults;
        pet.Contact.OwnerDisplayName = request.UseOwnerDefaults
            ? user.OwnerProfile?.OwnerDisplayName ?? user.DisplayName
            : PetDtoMapper.NormalizeOptional(request.OwnerDisplayName);
        pet.Contact.PhoneE164 = request.UseOwnerDefaults ? user.PhoneE164 : PetDtoMapper.NormalizeOptional(request.PhoneE164);
        pet.Contact.WhatsappE164 = request.UseOwnerDefaults ? user.WhatsappE164 : PetDtoMapper.NormalizeOptional(request.WhatsappE164);
        pet.Contact.EmergencyContactE164 = PetDtoMapper.NormalizeOptional(request.EmergencyContactE164);
        pet.Contact.GeneralAreaOverride = request.UseOwnerDefaults
            ? user.OwnerProfile?.DefaultGeneralArea
            : PetDtoMapper.NormalizeOptional(request.GeneralAreaOverride);
    }

    private static void ApplyVisibility(Pet pet, PetVisibilityRequest visibility)
    {
        var publicProfile = EnsurePublicProfile(pet);
        publicProfile.ShowOwnerName = visibility.ShowOwnerName;
        publicProfile.ShowGeneralArea = visibility.ShowGeneralArea;
        publicProfile.ShowCareBadges = visibility.ShowCareBadges;
        publicProfile.ShowMoments = visibility.ShowMoments;
        publicProfile.ShowTimeline = visibility.ShowTimeline;
        publicProfile.ShowBirthdayOnTimeline = visibility.ShowBirthdayOnTimeline;
        publicProfile.ShowAdoptionDayOnTimeline = visibility.ShowAdoptionDayOnTimeline;
        publicProfile.ShowHealthSummary = visibility.ShowHealthSummary;

        if (pet.SafetySetting is null)
        {
            throw ServerConfig("pet_safety_settings_missing", "Pet safety settings are not configured.");
        }

        pet.SafetySetting.ShowPhone = visibility.ShowPhone;
        pet.SafetySetting.ShowWhatsapp = visibility.ShowWhatsapp;
        pet.SafetySetting.ShowEmergencyNote = visibility.ShowEmergencyNote;
    }

    private async Task EnsurePetPublicArtifactsAsync(Pet pet, CancellationToken cancellationToken)
    {
        if (pet.PublicProfile is null)
        {
            pet.PublicProfile = new PetPublicProfile
            {
                PetId = pet.Id,
                IsPublicProfileEnabled = true
            };
        }

        if (string.IsNullOrWhiteSpace(pet.PublicProfile.PublicCode))
        {
            pet.PublicProfile.PublicCode = await GenerateUniquePublicCodeAsync(cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(pet.Slug)
            || !pet.Slug.EndsWith($"-{pet.PublicProfile.PublicCode}", StringComparison.OrdinalIgnoreCase))
        {
            pet.Slug = PetDtoMapper.BuildPublicSlug(pet.Name, pet.PublicProfile.PublicCode);
        }

        pet.PublicProfile.SlugSnapshot = pet.Slug;

        if (pet.SafetySetting is null)
        {
            pet.SafetySetting = new PetSafetySetting
            {
                PetId = pet.Id,
                QrSafetyEnabled = true
            };
        }

        if (string.IsNullOrWhiteSpace(pet.SafetySetting.SafetyCode))
        {
            pet.SafetySetting.SafetyCode = await GenerateUniqueSafetyCodeAsync(cancellationToken);
        }
    }

    private static PetPublicProfile EnsurePublicProfile(Pet pet)
    {
        pet.PublicProfile ??= new PetPublicProfile
        {
            PetId = pet.Id,
            PublicCode = "",
            SlugSnapshot = pet.Slug,
            IsPublicProfileEnabled = true
        };

        return pet.PublicProfile;
    }

    private static NormalizedPetAge ValidateCreateRequest(CreatePetRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        ValidateRequired(request.Name, "name", "Pet name is required.", errors);
        ValidateRequired(request.Species, "species", "Species is required.", errors);
        ValidateAgeRanges(request.Birthday, request.EstimatedBirthYear, errors);
        ValidateDates(null, request.AdoptionDay, errors);
        var age = NormalizeAgeInput(
            request.AgeInformationMode,
            request.Birthday,
            request.EstimatedBirthYear,
            errors);

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }

        return age;
    }

    private static NormalizedPetAge? ValidateUpdateRequest(UpdatePetRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.Name is not null)
        {
            ValidateRequired(request.Name, "name", "Pet name cannot be empty.", errors);
        }

        if (request.Species is not null)
        {
            ValidateRequired(request.Species, "species", "Species cannot be empty.", errors);
        }

        ValidateAgeRanges(request.Birthday, request.EstimatedBirthYear, errors);
        ValidateDates(null, request.AdoptionDay, errors);
        var hasAgeUpdate = request.AgeInformationMode.HasValue
            || request.Birthday.HasValue
            || request.EstimatedBirthYear.HasValue;
        var age = hasAgeUpdate
            ? NormalizeAgeInput(
                request.AgeInformationMode,
                request.Birthday,
                request.EstimatedBirthYear,
                errors)
            : null;

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }

        return age;
    }

    private static NormalizedPetAge NormalizeAgeInput(
        PetAgeMode? requestedMode,
        DateOnly? birthday,
        short? estimatedBirthYear,
        IDictionary<string, string[]> errors)
    {
        var mode = requestedMode
            ?? (birthday.HasValue
                ? PetAgeMode.ExactBirthday
                : estimatedBirthYear.HasValue
                    ? PetAgeMode.EstimatedBirthYear
                    : PetAgeMode.Unknown);

        switch (mode)
        {
            case PetAgeMode.ExactBirthday:
                if (!birthday.HasValue)
                {
                    errors["birthday"] = ["Birthday is required when Exact birthday is selected."];
                }

                return new NormalizedPetAge(birthday, null);

            case PetAgeMode.EstimatedBirthYear:
                if (!estimatedBirthYear.HasValue)
                {
                    errors["estimatedBirthYear"] =
                        ["Estimated birth year is required when Estimated birth year is selected."];
                }

                return new NormalizedPetAge(null, estimatedBirthYear);

            default:
                return new NormalizedPetAge(null, null);
        }
    }

    private static void ValidateAgeRanges(
        DateOnly? birthday,
        short? estimatedBirthYear,
        IDictionary<string, string[]> errors)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (birthday.HasValue)
        {
            if (birthday.Value > today)
            {
                errors["birthday"] = ["Birthday cannot be in the future."];
            }
            else if (birthday.Value.Year < PetAgeCalculator.MinimumSupportedYear)
            {
                errors["birthday"] =
                    [$"Birthday must be in {PetAgeCalculator.MinimumSupportedYear} or later."];
            }
        }

        if (estimatedBirthYear.HasValue)
        {
            if (estimatedBirthYear.Value > today.Year)
            {
                errors["estimatedBirthYear"] = ["Estimated birth year cannot be in the future."];
            }
            else if (estimatedBirthYear.Value < PetAgeCalculator.MinimumSupportedYear)
            {
                errors["estimatedBirthYear"] =
                    [$"Estimated birth year must be {PetAgeCalculator.MinimumSupportedYear} or later."];
            }
        }
    }

    private static void ValidateDates(DateOnly? birthday, DateOnly? adoptionDay, IDictionary<string, string[]> errors)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (birthday.HasValue && birthday.Value > today)
        {
            errors["birthday"] = ["Birthday cannot be in the future."];
        }

        if (adoptionDay.HasValue && adoptionDay.Value > today)
        {
            errors["adoptionDay"] = ["Adoption day cannot be in the future."];
        }
    }

    private sealed record NormalizedPetAge(DateOnly? Birthday, short? EstimatedBirthYear);

    private static void ValidateContact(PetContactRequest? request)
    {
        if (request is null)
        {
            return;
        }

        var errors = new Dictionary<string, string[]>();
        ValidatePhone(request.PhoneE164, "contact.phoneE164", errors);
        ValidatePhone(request.WhatsappE164, "contact.whatsappE164", errors);
        ValidatePhone(request.EmergencyContactE164, "contact.emergencyContactE164", errors);

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateCoverPosition(byte? positionX, byte? positionY)
    {
        var errors = new Dictionary<string, string[]>();

        if (positionX > 100)
        {
            errors["coverPositionX"] = ["Cover horizontal position must be between 0 and 100."];
        }

        if (positionY > 100)
        {
            errors["coverPositionY"] = ["Cover vertical position must be between 0 and 100."];
        }

        if (errors.Count > 0)
        {
            throw ValidationFailed(errors);
        }
    }

    private static void ValidateRequired(
        string? value,
        string fieldName,
        string message,
        IDictionary<string, string[]> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            errors[fieldName] = [message];
        }
    }

    private static void ValidatePhone(string? value, string fieldName, IDictionary<string, string[]> errors)
    {
        var normalized = PetDtoMapper.NormalizeOptional(value);
        if (!string.IsNullOrWhiteSpace(normalized) && !E164Pattern.IsMatch(normalized))
        {
            errors[fieldName] = ["Use E.164 format, for example +60123456789."];
        }
    }

    private async Task<string> GenerateUniquePublicCodeAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var code = PetDtoMapper.GenerateCode("p");
            var exists = await _dbContext.PetPublicProfiles.AnyAsync(
                profile => profile.PublicCode == code,
                cancellationToken);

            if (!exists)
            {
                return code;
            }
        }

        throw ServerConfig("public_code_generation_failed", "Could not generate a unique public profile code.");
    }

    private async Task<string> GenerateUniqueSafetyCodeAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var code = PetDtoMapper.GenerateCode("s", randomByteCount: 12);
            var exists = await _dbContext.PetSafetySettings.AnyAsync(
                setting => setting.SafetyCode == code,
                cancellationToken);

            if (!exists)
            {
                return code;
            }
        }

        throw ServerConfig("safety_code_generation_failed", "Could not generate a unique QR Safety code.");
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

    private static ApiException ValidationFailed(string field, string message)
    {
        return ValidationFailed(new Dictionary<string, string[]> { [field] = [message] });
    }

    private static ApiException InvalidState(string message)
    {
        return new ApiException(StatusCodes.Status400BadRequest, "invalid_pet_state", message);
    }

    private static ApiException NotFound(string message)
    {
        return new ApiException(StatusCodes.Status404NotFound, "not_found", message);
    }

    private static ApiException Unauthorized()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }

    private static ApiException ServerConfig(string code, string message)
    {
        return new ApiException(StatusCodes.Status500InternalServerError, code, message);
    }
}
