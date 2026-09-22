using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// The owner's per-pet Social consent.
///
/// This is the only production write path to <see cref="PetSocialProfile"/>.
/// Until it existed, the switches could be read by every social surface and set
/// by nobody, which meant no real owner could put a pet into Social at all.
///
/// Four separate consents meet here and none of them implies another:
///
/// <list type="bullet">
/// <item>the household participates — <c>OwnerSocialProfiles.IsSocialEnabled</c></item>
/// <item>this pet participates — <c>PetSocialProfiles.IsSocialEnabled</c></item>
/// <item>strangers may discover this pet — <c>PetSocialProfiles.IsDiscoverable</c></item>
/// <item>this pet has a shareable link — <c>PetPublicProfiles.IsPublicProfileEnabled</c></item>
/// </list>
///
/// Nothing here switches on anything the owner did not ask for. In particular a
/// pet's Public Share Profile is never enabled as a side effect of joining
/// Social: it is reported as a missing requirement so the owner can turn it on
/// themselves, on the screen that owns it.
///
/// The authenticated user is always the subject. A pet id in a route is an
/// address, not a grant — every read and write goes through
/// <see cref="LoadOwnedPetAsync"/>, which scopes to the caller's own pets.
/// </summary>
public sealed class PetSocialSettingsService : SkeletonService, IPetSocialSettingsService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;
    private readonly IAuditLogService _auditLog;

    public PetSocialSettingsService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options,
        IAuditLogService auditLog)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
        _auditLog = auditLog;
    }

    public async Task<PetSocialSettingsListResponse> ListAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);

        // Every pet the owner manages, including the ones that cannot join yet.
        // Hiding an ineligible pet would leave an owner looking for a pet that
        // is simply not listed; showing it with a reason is what lets them fix
        // the reason.
        var pets = await _dbContext.Pets
            .AsNoTracking()
            .Include(pet => pet.PublicProfile)
            .Include(pet => pet.SocialProfile)
            .Include(pet => pet.ProfileMediaFile)
            .Where(pet => pet.OwnerUserId == userId && pet.DeletedAt == null)
            .OrderBy(pet => pet.Name)
            .ThenBy(pet => pet.Id)
            .ToListAsync(cancellationToken);

        var ownerSocialEnabled = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile => profile.UserId == userId)
            .Select(profile => profile.IsSocialEnabled)
            .SingleOrDefaultAsync(cancellationToken);

        return new PetSocialSettingsListResponse(
            ownerSocialEnabled,
            pets.Select(ToResponse).ToArray());
    }

    public async Task<PetSocialSettingsResponse> UpdateAsync(
        Guid? currentUserId,
        Guid petId,
        UpdatePetSocialSettingsRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var pet = await LoadOwnedPetAsync(userId, petId, cancellationToken);
        var social = await LoadOrCreateSocialProfileAsync(pet, cancellationToken);

        ApplyConcurrencyToken(social, request.RowVersion);

        var before = Snapshot(social);
        var missing = MissingRequirements(pet);

        if (request.IsSocialEnabled == true && missing.Count > 0)
        {
            throw ValidationFailed(new Dictionary<string, string[]>
            {
                ["isSocialEnabled"] = [EnableRefusal(missing)]
            });
        }

        if (request.IsSocialEnabled.HasValue)
        {
            social.IsSocialEnabled = request.IsSocialEnabled.Value;

            // Stamp who agreed, at the moment they agreed. Read back by
            // SocialVisibility, which requires it to still match the pet's
            // owner — so a pet that later changes hands leaves Social on its
            // own rather than waiting for a transfer feature to remember.
            social.ConsentedByUserId = request.IsSocialEnabled.Value ? userId : null;
        }

        if (request.IsDiscoverable.HasValue)
        {
            social.IsDiscoverable = request.IsDiscoverable.Value;
        }

        // Discoverability is meaningless while the pet is not in Social, and
        // leaving it set would mean switching participation back on silently
        // republishes the pet to Explore and Search. Cleared with the parent
        // switch, exactly as the owner's own profile does it.
        if (!social.IsSocialEnabled)
        {
            social.IsDiscoverable = false;
        }

        _auditLog.Append(
            userId,
            ActorType.Owner,
            "PetSocialSettingsUpdated",
            nameof(PetSocialProfile),
            social.Id,
            before,
            Snapshot(social));

        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(pet, social);
    }

    // ---- loading --------------------------------------------------------

    /// <summary>
    /// The caller's own pet, or 404.
    ///
    /// A pet that does not exist and a pet belonging to somebody else return
    /// exactly the same answer, so the route cannot be used to discover which
    /// ids are real.
    /// </summary>
    private async Task<Pet> LoadOwnedPetAsync(
        Guid userId,
        Guid petId,
        CancellationToken cancellationToken)
    {
        var pet = await _dbContext.Pets
            .Include(item => item.PublicProfile)
            .Include(item => item.SocialProfile)
            .Include(item => item.ProfileMediaFile)
            .Where(item =>
                item.Id == petId
                && item.OwnerUserId == userId
                && item.DeletedAt == null)
            .SingleOrDefaultAsync(cancellationToken);

        return pet ?? throw NotFound();
    }

    /// <summary>
    /// Every pet is supposed to have a row — the migration backfilled the
    /// existing ones and <c>PetService</c> creates one with each new pet — but a
    /// pet restored from a state the backfill skipped would not. Creating the
    /// disabled row here rather than failing keeps that pet settable, and the
    /// row it creates consents to nothing.
    /// </summary>
    private async Task<PetSocialProfile> LoadOrCreateSocialProfileAsync(
        Pet pet,
        CancellationToken cancellationToken)
    {
        if (pet.SocialProfile is not null)
        {
            return pet.SocialProfile;
        }

        var social = new PetSocialProfile
        {
            PetId = pet.Id,
            IsSocialEnabled = false,
            IsDiscoverable = false,
            ConsentedByUserId = null
        };

        _dbContext.PetSocialProfiles.Add(social);
        await _dbContext.SaveChangesAsync(cancellationToken);

        pet.SocialProfile = social;
        return social;
    }

    // ---- eligibility ----------------------------------------------------

    /// <summary>
    /// What stands between this pet and Social participation.
    ///
    /// These mirror the clauses in <see cref="SocialVisibility"/> that this
    /// service cannot satisfy on the owner's behalf. Storing a switch whose
    /// effect is cancelled by one of them would be a setting that silently does
    /// nothing, so the API refuses and names the reason instead.
    /// </summary>
    private static IReadOnlyCollection<string> MissingRequirements(Pet pet)
    {
        var missing = new List<string>(2);

        if (pet.PublicProfile is null || !pet.PublicProfile.IsPublicProfileEnabled)
        {
            // Never switched on from here. A shareable link and a place in a
            // browsable network are different decisions with different
            // audiences, and this one belongs to the pet's own sharing screen.
            missing.Add("publicProfile");
        }

        if (pet.LifecycleStatus != PetLifecycleStatus.Active)
        {
            // Archived and memorial pets are already outside every social
            // surface. This is the existing product rule, not a new one.
            missing.Add("lifecycle");
        }

        return missing;
    }

    private static string EnableRefusal(IReadOnlyCollection<string> missing)
    {
        return missing.Contains("lifecycle")
            ? "Only an active pet can join Community."
            : "Turn on this pet's Share Profile before adding them to Community.";
    }

    // ---- mapping --------------------------------------------------------

    private PetSocialSettingsResponse ToResponse(Pet pet)
    {
        return ToResponse(pet, pet.SocialProfile);
    }

    private PetSocialSettingsResponse ToResponse(Pet pet, PetSocialProfile? social)
    {
        var missing = MissingRequirements(pet);

        return new PetSocialSettingsResponse(
            pet.Id,
            pet.Name,
            MediaDerivatives.ResolveOriginalUrl(pet.ProfileMediaFile, _r2Options.PublicBaseUrl),
            PetDtoMapper.ResolvePublicThumbnailUrl(pet.ProfileMediaFile, _r2Options.PublicBaseUrl),
            social?.IsSocialEnabled ?? false,
            social?.IsDiscoverable ?? false,
            missing.Count == 0,
            missing,
            social is null ? "" : Convert.ToBase64String(social.RowVersion));
    }

    /// <summary>
    /// What an audit entry records: the consent, and nothing else. No pet name,
    /// no contact detail, no safety code — an audit trail of who agreed to what
    /// does not need to restate the pet's identity to be useful.
    /// </summary>
    private static object Snapshot(PetSocialProfile social)
    {
        return new
        {
            social.PetId,
            social.IsSocialEnabled,
            social.IsDiscoverable,
            social.ConsentedByUserId
        };
    }

    // ---- plumbing -------------------------------------------------------

    private void ApplyConcurrencyToken(PetSocialProfile social, string? rowVersion)
    {
        if (string.IsNullOrWhiteSpace(rowVersion))
        {
            return;
        }

        try
        {
            _dbContext.Entry(social).Property(item => item.RowVersion).OriginalValue =
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
                "This pet's sharing settings were changed somewhere else. Reload and try again.");
        }
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }

    private static ApiException NotFound()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "not_found",
            "Pet was not found.");
    }

    private static ApiException ValidationFailed(IReadOnlyDictionary<string, string[]> errors)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            errors);
    }
}
