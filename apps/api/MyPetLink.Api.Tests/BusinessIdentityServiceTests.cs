using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class BusinessIdentityServiceTests
{
    private static readonly Guid AdminUserId = Guid.Parse("52000000-0000-0000-0000-000000000001");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-05T09:00:00Z");

    [Fact]
    public async Task Get_ReportsRetailReadyButNotInvoiceReadyWithoutAnAddress()
    {
        await using var harness = await Harness.CreateAsync();

        var response = await harness.Service.GetAsync();

        Assert.True(response.Completeness.ReadyForRetailDocuments);
        Assert.False(response.Completeness.ReadyForMerchantInvoice);
        Assert.Equal(["Registered address"], response.Completeness.MissingForMerchantInvoice);
    }

    [Fact]
    public async Task Update_PersistsTheValuesDocumentsWillPrint()
    {
        await using var harness = await Harness.CreateAsync();

        var updated = await harness.Service.UpdateAsync(AdminUserId, Request());

        Assert.Equal("MyPetLink", updated.BrandName);
        Assert.Equal("Admin", updated.UpdatedBy);
        Assert.Equal("12 Jalan Satu", updated.RegisteredAddressLine1);
        Assert.Equal("Kuala Lumpur", updated.RegisteredState);
        Assert.True(updated.Completeness.ReadyForMerchantInvoice);
        Assert.Empty(updated.Completeness.MissingForMerchantInvoice);
    }

    [Fact]
    public async Task Update_TreatsWhitespaceOnlyOptionalValuesAsUnset()
    {
        await using var harness = await Harness.CreateAsync();

        var updated = await harness.Service.UpdateAsync(
            AdminUserId,
            Request() with { BankAccountNumber = "   ", TaxIdentificationNumber = "  " });

        Assert.Null(updated.BankAccountNumber);
        Assert.Null(updated.TaxIdentificationNumber);
    }

    [Fact]
    public async Task Update_RejectsAHalfFilledRegisteredAddress()
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            AdminUserId,
            Request() with { RegisteredPostcode = "", RegisteredCity = "" }));

        Assert.Equal(400, error.StatusCode);
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Update_AcceptsAnEmptyAddressWhileTheBusinessIsStillBeingSetUp()
    {
        await using var harness = await Harness.CreateAsync();

        var updated = await harness.Service.UpdateAsync(
            AdminUserId,
            Request() with
            {
                RegisteredAddressLine1 = "",
                RegisteredPostcode = "",
                RegisteredCity = "",
                RegisteredState = "",
            });

        Assert.True(updated.Completeness.ReadyForRetailDocuments);
        Assert.False(updated.Completeness.ReadyForMerchantInvoice);
    }

    [Fact]
    public async Task Update_RefusesAStaleEdit()
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            AdminUserId,
            Request() with { ConcurrencyToken = Convert.ToBase64String([9, 9, 9]) }));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("concurrency_conflict", error.Code);
    }

    [Fact]
    public async Task Update_AuditsWhichDetailsChangedWithoutRecordingTheBankAccount()
    {
        await using var harness = await Harness.CreateAsync();

        await harness.Service.UpdateAsync(AdminUserId, Request());

        var entry = await harness.Db.AuditLogs
            .SingleAsync(item => item.Action == "business-identity.update");

        Assert.DoesNotContain("1234567890", entry.NewValue ?? "", StringComparison.Ordinal);
        Assert.Contains("hasBankAccount", entry.NewValue ?? "", StringComparison.Ordinal);
    }

    [Fact]
    public async Task RequireForDocument_BlocksAnInvoiceUntilTheAddressIsFilledIn()
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.RequireForDocumentAsync(BusinessDocumentKind.MerchantInvoice));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("business_identity_incomplete", error.Code);
        Assert.Contains("Registered address", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RequireForDocument_LeavesRetailReceiptsWorkingOnTheSeededValues()
    {
        await using var harness = await Harness.CreateAsync();

        var settings = await harness.Service.RequireForDocumentAsync(
            BusinessDocumentKind.RetailDocument);

        Assert.Equal("MyPetLink", settings.BrandName);
    }

    [Fact]
    public async Task Snapshot_CopiesEveryValueADocumentPrints()
    {
        await using var harness = await Harness.CreateAsync();
        await harness.Service.UpdateAsync(AdminUserId, Request());

        var settings = await harness.Service.RequireForDocumentAsync(
            BusinessDocumentKind.MerchantInvoice);
        var snapshot = SellerIdentitySnapshot.From(settings);

        Assert.Equal("GBB Software Solutions", snapshot.LegalBusinessName);
        Assert.Equal("12 Jalan Satu", snapshot.AddressLine1);
        Assert.Equal("50000", snapshot.Postcode);
        Assert.Equal("1234567890", snapshot.BankAccountNumber);
    }


    [Fact]
    public async Task Update_RecordsTheAdminRecordRatherThanTheSignedInUserId()
    {
        await using var harness = await Harness.CreateAsync();

        await harness.Service.UpdateAsync(AdminUserId, Request());

        var adminId = await harness.Db.AdminUsers
            .Where(item => item.UserId == AdminUserId)
            .Select(item => item.Id)
            .SingleAsync();
        var stored = await harness.Db.BusinessIdentitySettings
            .AsNoTracking()
            .SingleAsync(item => item.Id == BusinessIdentityService.SettingsId);

        Assert.Equal(adminId, stored.UpdatedByAdminUserId);
        Assert.NotEqual(AdminUserId, adminId);
    }

    [Fact]
    public async Task Update_RefusesAnActorWhoIsNotAnActiveAdmin()
    {
        await using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(Guid.NewGuid(), Request()));

        Assert.Equal(403, error.StatusCode);
    }

    private static UpdateBusinessIdentityRequest Request() => new(
        BrandName: "MyPetLink",
        LegalBusinessName: "GBB Software Solutions",
        BusinessRegistrationNumber: "202603141718 (AS0515813-P)",
        TaxIdentificationNumber: null,
        SstRegistrationNumber: null,
        RegisteredAddressLine1: "12 Jalan Satu",
        RegisteredAddressLine2: null,
        RegisteredPostcode: "50000",
        RegisteredCity: "Kuala Lumpur",
        RegisteredState: "Kuala Lumpur",
        RegisteredCountry: "Malaysia",
        SupportEmail: "support@mypetlink.com.my",
        BusinessPhone: null,
        BusinessWebsite: "mypetlink.com.my",
        PaymentInstructions: "Pay within 30 days.",
        BankAccountName: "GBB Software Solutions",
        BankName: "Example Bank",
        BankAccountNumber: "1234567890",
        DuitNowDisplayName: null,
        ConcurrencyToken: Convert.ToBase64String([1, 2, 3]));

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(MyPetLinkDbContext db, BusinessIdentityService service)
        {
            Db = db;
            Service = service;
        }

        public MyPetLinkDbContext Db { get; }
        public BusinessIdentityService Service { get; }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
                new FixedTimeProvider(Now));

            db.Users.Add(new User
            {
                Id = AdminUserId,
                Email = "admin@example.test",
                NormalizedEmail = "ADMIN@EXAMPLE.TEST",
                DisplayName = "Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser
                {
                    UserId = AdminUserId,
                    Role = AdminRole.Admin,
                    IsActive = true,
                },
            });

            // The same values the migration seeds: named and registered, but not
            // yet carrying an address or bank details.
            db.BusinessIdentitySettings.Add(new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId,
                BrandName = "MyPetLink",
                LegalBusinessName = "GBB Software Solutions",
                BusinessRegistrationNumber = "202603141718 (AS0515813-P)",
                RegisteredCountry = "Malaysia",
                SupportEmail = "support@mypetlink.com.my",
                BusinessWebsite = "mypetlink.com.my",
                RowVersion = [1, 2, 3],
                UpdatedAt = Now,
            });

            await db.SaveChangesAsync();

            return new Harness(
                db,
                new BusinessIdentityService(
                    db,
                    new AuditLogService(db, new HttpContextAccessor()),
                    new FixedTimeProvider(Now)));
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
