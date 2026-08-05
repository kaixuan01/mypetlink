namespace MyPetLink.Api.Entities;

/// <summary>
/// Who MyPetLink is on a document.
///
/// These details used to be constants inside the retail document service, which
/// was fine while the only reader was a receipt. B2B documents need a registered
/// address, a tax number and payment instructions, and operations need to change
/// them without a deployment — so they live here as typed columns on one row.
///
/// Nothing secret belongs in this table. A bank account number is printed on an
/// invoice; a bank login is not. The DuitNow QR stays a configured asset.
/// </summary>
public sealed class BusinessIdentitySetting
{
    public Guid Id { get; set; }

    public string BrandName { get; set; } = "";
    public string LegalBusinessName { get; set; } = "";
    public string BusinessRegistrationNumber { get; set; } = "";

    /// <summary>Tax Identification Number. Optional until registered.</summary>
    public string? TaxIdentificationNumber { get; set; }

    /// <summary>Optional: only a registered business has one.</summary>
    public string? SstRegistrationNumber { get; set; }

    public string RegisteredAddressLine1 { get; set; } = "";
    public string? RegisteredAddressLine2 { get; set; }
    public string RegisteredPostcode { get; set; } = "";
    public string RegisteredCity { get; set; } = "";
    public string RegisteredState { get; set; } = "";
    public string RegisteredCountry { get; set; } = "Malaysia";

    public string SupportEmail { get; set; } = "";
    public string? BusinessPhone { get; set; }
    public string? BusinessWebsite { get; set; }

    /// <summary>Free text printed on an invoice, e.g. how to pay and by when.</summary>
    public string? PaymentInstructions { get; set; }

    public string? BankAccountName { get; set; }
    public string? BankName { get; set; }

    /// <summary>Printed on invoices so a merchant can pay. Not a credential.</summary>
    public string? BankAccountNumber { get; set; }

    public string? DuitNowDisplayName { get; set; }

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? UpdatedByAdminUserId { get; set; }
    public AdminUser? UpdatedByAdminUser { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

/// <summary>
/// The seller details as they stood when a document was issued.
///
/// Owned by each document rather than read live, so correcting a typo in the
/// settings tomorrow cannot silently rewrite an invoice a merchant already has.
/// Typed columns rather than a JSON blob, so the values stay queryable and the
/// schema stays honest about what a document actually captured.
/// </summary>
public sealed class SellerIdentitySnapshot
{
    public string BrandName { get; set; } = "";
    public string LegalBusinessName { get; set; } = "";
    public string BusinessRegistrationNumber { get; set; } = "";
    public string? TaxIdentificationNumber { get; set; }
    public string? SstRegistrationNumber { get; set; }
    public string AddressLine1 { get; set; } = "";
    public string? AddressLine2 { get; set; }
    public string Postcode { get; set; } = "";
    public string City { get; set; } = "";
    public string State { get; set; } = "";
    public string Country { get; set; } = "";
    public string SupportEmail { get; set; } = "";
    public string? BusinessPhone { get; set; }
    public string? BusinessWebsite { get; set; }
    public string? PaymentInstructions { get; set; }
    public string? BankAccountName { get; set; }
    public string? BankName { get; set; }
    public string? BankAccountNumber { get; set; }
    public string? DuitNowDisplayName { get; set; }

    public static SellerIdentitySnapshot From(BusinessIdentitySetting settings) => new()
    {
        BrandName = settings.BrandName,
        LegalBusinessName = settings.LegalBusinessName,
        BusinessRegistrationNumber = settings.BusinessRegistrationNumber,
        TaxIdentificationNumber = settings.TaxIdentificationNumber,
        SstRegistrationNumber = settings.SstRegistrationNumber,
        AddressLine1 = settings.RegisteredAddressLine1,
        AddressLine2 = settings.RegisteredAddressLine2,
        Postcode = settings.RegisteredPostcode,
        City = settings.RegisteredCity,
        State = settings.RegisteredState,
        Country = settings.RegisteredCountry,
        SupportEmail = settings.SupportEmail,
        BusinessPhone = settings.BusinessPhone,
        BusinessWebsite = settings.BusinessWebsite,
        PaymentInstructions = settings.PaymentInstructions,
        BankAccountName = settings.BankAccountName,
        BankName = settings.BankName,
        BankAccountNumber = settings.BankAccountNumber,
        DuitNowDisplayName = settings.DuitNowDisplayName,
    };
}
