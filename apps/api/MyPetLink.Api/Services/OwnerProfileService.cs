using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class OwnerProfileService : SkeletonService, IOwnerProfileService
{
    private const string FreePlanCode = "Free";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Regex E164Pattern = new(@"^\+[1-9]\d{6,14}$", RegexOptions.Compiled);

    private readonly MyPetLinkDbContext _dbContext;

    public OwnerProfileService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<OwnerProfileResponse> GetAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var user = await LoadOwnerUserAsync(currentUserId, trackChanges: false, cancellationToken);
        return BuildResponse(user);
    }

    public async Task<OwnerProfileResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateOwnerProfileRequest request,
        CancellationToken cancellationToken = default)
    {
        var user = await LoadOwnerUserAsync(currentUserId, trackChanges: true, cancellationToken);
        var ownerProfile = user.OwnerProfile!;

        var validationErrors = new Dictionary<string, string[]>();
        ValidatePhone(request.PhoneE164, "phoneE164", validationErrors);
        ValidatePhone(request.WhatsappE164, "whatsappE164", validationErrors);

        if (validationErrors.Count > 0)
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                validationErrors);
        }

        if (request.DisplayName is not null)
        {
            var displayName = NormalizeOptional(request.DisplayName);
            if (string.IsNullOrWhiteSpace(displayName))
            {
                throw new ApiException(
                    StatusCodes.Status400BadRequest,
                    "validation_failed",
                    "Please check the submitted fields.",
                    new Dictionary<string, string[]>
                    {
                        ["displayName"] = ["Display name cannot be empty."]
                    });
            }

            user.DisplayName = displayName;
            ownerProfile.OwnerDisplayName = displayName;
        }

        if (request.PhoneE164 is not null)
        {
            user.PhoneE164 = NormalizeOptional(request.PhoneE164);
        }

        if (request.WhatsappE164 is not null)
        {
            user.WhatsappE164 = NormalizeOptional(request.WhatsappE164);
        }

        if (request.DefaultGeneralArea is not null)
        {
            ownerProfile.DefaultGeneralArea = NormalizeOptional(request.DefaultGeneralArea);
        }

        if (request.PrivacyDefaults is not null)
        {
            ownerProfile.PrivacyDefaultsJson = JsonSerializer.Serialize(request.PrivacyDefaults, JsonOptions);
        }

        if (request.NotificationPreferences is { } notificationPreferences
            && notificationPreferences.ValueKind != JsonValueKind.Undefined)
        {
            ownerProfile.NotificationPreferencesJson = notificationPreferences.GetRawText();
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return BuildResponse(user);
    }

    private async Task<User> LoadOwnerUserAsync(
        Guid? currentUserId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        if (!currentUserId.HasValue)
        {
            throw Unauthorized();
        }

        var query = _dbContext.Users
            .Include(user => user.OwnerProfile)
                .ThenInclude(profile => profile!.Plan)
            .ThenInclude(plan => plan.Limit)
            .Where(user => user.Id == currentUserId.Value && user.DeletedAt == null);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var user = await query.SingleOrDefaultAsync(cancellationToken);
        if (user is null || user.Status != UserStatus.Active)
        {
            throw Unauthorized();
        }

        if (user.OwnerProfile is null)
        {
            if (!trackChanges)
            {
                user = await LoadOwnerUserAsync(currentUserId, trackChanges: true, cancellationToken);
                return user;
            }

            await EnsureOwnerProfileAsync(user, cancellationToken);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return user;
    }

    private async Task EnsureOwnerProfileAsync(User user, CancellationToken cancellationToken)
    {
        var freePlan = await _dbContext.Plans
            .Include(plan => plan.Limit)
            .SingleOrDefaultAsync(plan => plan.Code == FreePlanCode && plan.ArchivedAt == null, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status500InternalServerError,
                "default_plan_not_configured",
                "The default owner plan is not configured.");

        user.OwnerProfile = new OwnerProfile
        {
            UserId = user.Id,
            PlanId = freePlan.Id,
            Plan = freePlan,
            OwnerDisplayName = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName,
            PrivacyDefaultsJson = JsonSerializer.Serialize(PetDtoMapper.DefaultVisibility, JsonOptions),
            NotificationPreferencesJson = "{}"
        };

        _dbContext.OwnerProfiles.Add(user.OwnerProfile);
    }

    private static OwnerProfileResponse BuildResponse(User user)
    {
        var ownerProfile = user.OwnerProfile!;
        var privacyDefaults = PetDtoMapper.ParseVisibility(ownerProfile.PrivacyDefaultsJson);
        var notificationPreferences = ParseJsonElement(ownerProfile.NotificationPreferencesJson);

        return new OwnerProfileResponse(
            user.Id,
            ownerProfile.Id,
            ownerProfile.OwnerDisplayName,
            user.Email,
            user.PhoneE164,
            user.WhatsappE164,
            ownerProfile.DefaultGeneralArea,
            new OwnerContactSettingsResponse(
                ownerProfile.OwnerDisplayName,
                user.PhoneE164,
                user.WhatsappE164,
                ownerProfile.DefaultGeneralArea),
            privacyDefaults,
            notificationPreferences,
            ownerProfile.Plan.Code,
            ownerProfile.CreatedAt,
            ownerProfile.UpdatedAt);
    }

    private static JsonElement ParseJsonElement(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            json = "{}";
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            using var document = JsonDocument.Parse("{}");
            return document.RootElement.Clone();
        }
    }

    private static void ValidatePhone(
        string? value,
        string fieldName,
        IDictionary<string, string[]> errors)
    {
        var normalized = NormalizeOptional(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return;
        }

        if (!E164Pattern.IsMatch(normalized))
        {
            errors[fieldName] = ["Use E.164 format, for example +60123456789."];
        }
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static ApiException Unauthorized()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }
}
