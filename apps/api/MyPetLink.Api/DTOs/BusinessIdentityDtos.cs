using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

// Admin-only. Payment instructions and the bank account number are printed on
// customer documents, but this endpoint itself is never public.

public sealed record UpdateBusinessIdentityRequest(
    [Required, MaxLength(120)] string BrandName,
    [Required, MaxLength(200)] string LegalBusinessName,
    [Required, MaxLength(64)] string BusinessRegistrationNumber,
    [MaxLength(64)] string? TaxIdentificationNumber,
    [MaxLength(64)] string? SstRegistrationNumber,
    [MaxLength(240)] string RegisteredAddressLine1,
    [MaxLength(240)] string? RegisteredAddressLine2,
    [MaxLength(16)] string RegisteredPostcode,
    [MaxLength(120)] string RegisteredCity,
    [MaxLength(120)] string RegisteredState,
    [Required, MaxLength(80)] string RegisteredCountry,
    [Required, MaxLength(254)] string SupportEmail,
    [MaxLength(32)] string? BusinessPhone,
    [MaxLength(200)] string? BusinessWebsite,
    [MaxLength(2000)] string? PaymentInstructions,
    [MaxLength(200)] string? BankAccountName,
    [MaxLength(120)] string? BankName,
    [MaxLength(64)] string? BankAccountNumber,
    [MaxLength(120)] string? DuitNowDisplayName,
    string? ConcurrencyToken = null);

/// <summary>
/// What the current settings are good enough for. Development documents keep
/// working with tax fields empty; a production B2B invoice does not.
/// </summary>
public sealed record BusinessIdentityCompleteness(
    bool ReadyForRetailDocuments,
    bool ReadyForMerchantQuotation,
    bool ReadyForMerchantInvoice,
    IReadOnlyList<string> MissingForMerchantInvoice);

public sealed record BusinessIdentityResponse(
    string BrandName,
    string LegalBusinessName,
    string BusinessRegistrationNumber,
    string? TaxIdentificationNumber,
    string? SstRegistrationNumber,
    string RegisteredAddressLine1,
    string? RegisteredAddressLine2,
    string RegisteredPostcode,
    string RegisteredCity,
    string RegisteredState,
    string RegisteredCountry,
    string SupportEmail,
    string? BusinessPhone,
    string? BusinessWebsite,
    string? PaymentInstructions,
    string? BankAccountName,
    string? BankName,
    string? BankAccountNumber,
    string? DuitNowDisplayName,
    DateTimeOffset UpdatedAt,
    string? UpdatedBy,
    BusinessIdentityCompleteness Completeness,
    string ConcurrencyToken);
