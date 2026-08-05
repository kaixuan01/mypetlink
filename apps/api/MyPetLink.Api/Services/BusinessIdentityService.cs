using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IBusinessIdentityService
{
    Task<BusinessIdentityResponse> GetAsync(CancellationToken cancellationToken = default);

    Task<BusinessIdentityResponse> UpdateAsync(
        Guid? actorId,
        UpdateBusinessIdentityRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>The settings row, for a document that is about to snapshot it.</summary>
    Task<BusinessIdentitySetting> RequireForDocumentAsync(
        BusinessDocumentKind kind,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Which document a completeness check is being made for. A retail receipt has
/// always managed without a registered address; a B2B invoice has not.
/// </summary>
public enum BusinessDocumentKind
{
    RetailDocument,
    MerchantQuotation,
    MerchantInvoice,
}

public sealed class BusinessIdentityService : IBusinessIdentityService
{
    public static readonly Guid SettingsId = Guid.Parse("7c1f9b52-4d63-4a18-9e37-2b8c05f1d6a4");

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public BusinessIdentityService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    public async Task<BusinessIdentityResponse> GetAsync(CancellationToken cancellationToken = default) =>
        ToResponse(await RequireAsync(tracked: false, cancellationToken));

    public async Task<BusinessIdentityResponse> UpdateAsync(
        Guid? actorId,
        UpdateBusinessIdentityRequest request,
        CancellationToken cancellationToken = default)
    {
        Validate(request);

        // `UpdatedByAdminUserId` points at the AdminUsers row, not the user —
        // the same convention as every other settings table.
        var admin = await RequireAdminAsync(actorId, cancellationToken);
        var settings = await RequireAsync(tracked: true, cancellationToken);
        ApplyConcurrency(settings, request.ConcurrencyToken);

        var before = AuditSnapshot(settings);

        settings.BrandName = request.BrandName.Trim();
        settings.LegalBusinessName = request.LegalBusinessName.Trim();
        settings.BusinessRegistrationNumber = request.BusinessRegistrationNumber.Trim();
        settings.TaxIdentificationNumber = Trimmed(request.TaxIdentificationNumber);
        settings.SstRegistrationNumber = Trimmed(request.SstRegistrationNumber);
        settings.RegisteredAddressLine1 = request.RegisteredAddressLine1.Trim();
        settings.RegisteredAddressLine2 = Trimmed(request.RegisteredAddressLine2);
        settings.RegisteredPostcode = request.RegisteredPostcode.Trim();
        settings.RegisteredCity = request.RegisteredCity.Trim();
        settings.RegisteredState = request.RegisteredState.Trim();
        settings.RegisteredCountry = request.RegisteredCountry.Trim();
        settings.SupportEmail = request.SupportEmail.Trim();
        settings.BusinessPhone = Trimmed(request.BusinessPhone);
        settings.BusinessWebsite = Trimmed(request.BusinessWebsite);
        settings.PaymentInstructions = Trimmed(request.PaymentInstructions);
        settings.BankAccountName = Trimmed(request.BankAccountName);
        settings.BankName = Trimmed(request.BankName);
        settings.BankAccountNumber = Trimmed(request.BankAccountNumber);
        settings.DuitNowDisplayName = Trimmed(request.DuitNowDisplayName);
        settings.UpdatedAt = _timeProvider.GetUtcNow();
        settings.UpdatedByAdminUserId = admin.Id;
        settings.UpdatedByAdminUser = admin;

        // Which fields changed, never their values: this row holds a bank
        // account number and a registered address.
        _auditLogService.Append(actorId, ActorType.Admin, "business-identity.update",
            "BusinessIdentitySetting", settings.Id, before, AuditSnapshot(settings));

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(409, "concurrency_conflict",
                "Someone else changed the business identity. Reload and try again.");
        }

        return ToResponse(await RequireAsync(tracked: false, cancellationToken));
    }

    public async Task<BusinessIdentitySetting> RequireForDocumentAsync(
        BusinessDocumentKind kind,
        CancellationToken cancellationToken = default)
    {
        var settings = await RequireAsync(tracked: false, cancellationToken);
        var missing = MissingFor(kind, settings);

        if (missing.Count > 0)
        {
            throw new ApiException(409, "business_identity_incomplete",
                $"Complete the business identity before issuing this document: {string.Join(", ", missing)}.");
        }

        return settings;
    }

    /// <summary>
    /// What still has to be filled in before a document of this kind can be
    /// issued. Tax numbers are never required — plenty of businesses have none.
    /// </summary>
    public static IReadOnlyList<string> MissingFor(
        BusinessDocumentKind kind,
        BusinessIdentitySetting settings)
    {
        var missing = new List<string>();

        if (string.IsNullOrWhiteSpace(settings.BrandName)) missing.Add("Brand name");
        if (string.IsNullOrWhiteSpace(settings.SupportEmail)) missing.Add("Support email");

        if (kind == BusinessDocumentKind.RetailDocument)
        {
            // Retail documents have always shipped with just a name and a
            // registration number; requiring more would break them today.
            if (string.IsNullOrWhiteSpace(settings.LegalBusinessName)) missing.Add("Legal business name");
            if (string.IsNullOrWhiteSpace(settings.BusinessRegistrationNumber)) missing.Add("Business registration number");
            return missing;
        }

        if (string.IsNullOrWhiteSpace(settings.LegalBusinessName)) missing.Add("Legal business name");
        if (string.IsNullOrWhiteSpace(settings.BusinessRegistrationNumber)) missing.Add("Business registration number");

        if (string.IsNullOrWhiteSpace(settings.RegisteredAddressLine1) ||
            string.IsNullOrWhiteSpace(settings.RegisteredPostcode) ||
            string.IsNullOrWhiteSpace(settings.RegisteredCity) ||
            string.IsNullOrWhiteSpace(settings.RegisteredState) ||
            string.IsNullOrWhiteSpace(settings.RegisteredCountry))
        {
            missing.Add("Registered address");
        }

        return missing;
    }

    private async Task<BusinessIdentitySetting> RequireAsync(
        bool tracked, CancellationToken cancellationToken)
    {
        var query = _dbContext.BusinessIdentitySettings
            .Include(item => item.UpdatedByAdminUser)
                .ThenInclude(admin => admin!.User)
            .AsQueryable();
        if (!tracked) query = query.AsNoTracking();

        var settings = await query.SingleOrDefaultAsync(
            item => item.Id == SettingsId, cancellationToken);

        if (settings is null)
        {
            // The row is seeded by migration. A database that predates it must
            // not take documents down.
            throw new ApiException(500, "business_identity_missing",
                "The business identity has not been configured yet.");
        }

        return settings;
    }

    private async Task<AdminUser> RequireAdminAsync(
        Guid? currentUserId, CancellationToken cancellationToken)
    {
        if (!currentUserId.HasValue)
        {
            throw new ApiException(401, "unauthorized", "Authentication is required.");
        }

        return await _dbContext.AdminUsers
            .Include(item => item.User)
            .SingleOrDefaultAsync(
                item => item.UserId == currentUserId.Value && item.IsActive,
                cancellationToken)
            ?? throw new ApiException(403, "forbidden", "Admin access is required.");
    }

    private void ApplyConcurrency(BusinessIdentitySetting settings, string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return;

        byte[] expected;
        try
        {
            expected = Convert.FromBase64String(token);
        }
        catch (FormatException)
        {
            throw Validation("concurrencyToken", "That edit token is not valid. Reload and try again.");
        }

        if (!settings.RowVersion.SequenceEqual(expected))
        {
            throw new ApiException(409, "concurrency_conflict",
                "Someone else changed the business identity. Reload and try again.");
        }

        _dbContext.Entry(settings).Property(item => item.RowVersion).OriginalValue = expected;
    }

    private static void Validate(UpdateBusinessIdentityRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.BrandName))
            throw Validation("brandName", "Enter the brand name shown on documents.");
        if (string.IsNullOrWhiteSpace(request.LegalBusinessName))
            throw Validation("legalBusinessName", "Enter the registered business name.");
        if (string.IsNullOrWhiteSpace(request.BusinessRegistrationNumber))
            throw Validation("businessRegistrationNumber", "Enter the business registration number.");
        if (string.IsNullOrWhiteSpace(request.SupportEmail) ||
            !request.SupportEmail.Contains('@', StringComparison.Ordinal))
        {
            throw Validation("supportEmail", "Enter a valid support email address.");
        }

        if (string.IsNullOrWhiteSpace(request.RegisteredCountry))
            throw Validation("registeredCountry", "Enter the country.");

        // A partly filled address is worse than an empty one: it would print on
        // an invoice looking complete.
        var addressParts = new[]
        {
            request.RegisteredAddressLine1, request.RegisteredPostcode,
            request.RegisteredCity, request.RegisteredState,
        };

        var filled = addressParts.Count(part => !string.IsNullOrWhiteSpace(part));
        if (filled is > 0 and < 4)
        {
            throw Validation("registeredAddressLine1",
                "Complete the whole registered address, or leave all of it empty for now.");
        }
    }

    private static BusinessIdentityResponse ToResponse(BusinessIdentitySetting settings) => new(
        settings.BrandName,
        settings.LegalBusinessName,
        settings.BusinessRegistrationNumber,
        settings.TaxIdentificationNumber,
        settings.SstRegistrationNumber,
        settings.RegisteredAddressLine1,
        settings.RegisteredAddressLine2,
        settings.RegisteredPostcode,
        settings.RegisteredCity,
        settings.RegisteredState,
        settings.RegisteredCountry,
        settings.SupportEmail,
        settings.BusinessPhone,
        settings.BusinessWebsite,
        settings.PaymentInstructions,
        settings.BankAccountName,
        settings.BankName,
        settings.BankAccountNumber,
        settings.DuitNowDisplayName,
        settings.UpdatedAt,
        settings.UpdatedByAdminUser?.User?.DisplayName,
        new BusinessIdentityCompleteness(
            MissingFor(BusinessDocumentKind.RetailDocument, settings).Count == 0,
            MissingFor(BusinessDocumentKind.MerchantQuotation, settings).Count == 0,
            MissingFor(BusinessDocumentKind.MerchantInvoice, settings).Count == 0,
            MissingFor(BusinessDocumentKind.MerchantInvoice, settings)),
        Convert.ToBase64String(settings.RowVersion));

    private static object AuditSnapshot(BusinessIdentitySetting settings) => new
    {
        settings.BrandName,
        settings.LegalBusinessName,
        HasTaxIdentificationNumber = !string.IsNullOrWhiteSpace(settings.TaxIdentificationNumber),
        HasSstRegistrationNumber = !string.IsNullOrWhiteSpace(settings.SstRegistrationNumber),
        HasRegisteredAddress = !string.IsNullOrWhiteSpace(settings.RegisteredAddressLine1),
        HasPaymentInstructions = !string.IsNullOrWhiteSpace(settings.PaymentInstructions),
        HasBankAccount = !string.IsNullOrWhiteSpace(settings.BankAccountNumber),
    };

    private static string? Trimmed(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
}
