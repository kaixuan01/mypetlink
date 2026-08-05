using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Concurrency behaviour that only a real database can demonstrate: the
/// in-memory provider has no locking, so number allocation and the
/// one-order-per-quotation rule are proved here against SQL Server.
/// </summary>
public sealed class MerchantSalesRelationalTests
{
    [RelationalFact]
    public async Task ParallelNumberAllocationNeverRepeatsAValue()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        const int workers = 12;
        var codes = new string[workers];

        await Task.WhenAll(Enumerable.Range(0, workers).Select(async index =>
        {
            await using var db = scope.NewContext();
            var numbers = new DocumentNumberService(db);
            codes[index] = await numbers.NextMerchantCodeAsync(default);
        }));

        Assert.Equal(workers, codes.Distinct().Count());
        Assert.All(codes, code => Assert.StartsWith("MPL-MER-", code));
    }

    [RelationalFact]
    public async Task ParallelQuotationNumbersShareADailySeriesWithoutColliding()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var issuedAt = new DateTimeOffset(2026, 8, 5, 2, 0, 0, TimeSpan.Zero);

        const int workers = 10;
        var numbers = new string[workers];

        await Task.WhenAll(Enumerable.Range(0, workers).Select(async index =>
        {
            await using var db = scope.NewContext();
            numbers[index] = await new DocumentNumberService(db)
                .NextQuotationNumberAsync(issuedAt, default);
        }));

        Assert.Equal(workers, numbers.Distinct().Count());
        Assert.All(numbers, number => Assert.StartsWith("MPL-QT-260805-", number));
    }

    [RelationalFact]
    public async Task TwoSimultaneousConversionsProduceExactlyOneOrder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        Guid quotationId;
        await using (var setup = scope.NewContext())
        {
            var service = CreateService(setup);
            var seeded = await SeedCatalogAsync(setup);

            var merchant = await service.CreateMerchantAsync(null, MerchantRequest(), default);
            var quotation = await service.CreateQuotationAsync(null, new UpsertQuotationRequest(
                merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(seeded, 100, 12.50m)]), default);

            await service.TransitionQuotationAsync(
                null, quotation.Id, MerchantQuotationStatus.Sent, null, default);
            await service.TransitionQuotationAsync(
                null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);

            quotationId = quotation.Id;
        }

        // Both requests see an Accepted quotation and race to convert it.
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ =>
        {
            await using var db = scope.NewContext();
            try
            {
                return await CreateService(db).ConvertQuotationAsync(null, quotationId, null, default);
            }
            catch (ApiException)
            {
                return null;
            }
        }));

        await using var verify = scope.NewContext();
        var orders = await verify.MerchantOrders
            .Where(order => order.SourceQuotationId == quotationId)
            .ToListAsync();

        Assert.Single(orders);

        var succeeded = results.Where(result => result is not null).ToArray();
        Assert.NotEmpty(succeeded);
        Assert.All(succeeded, result => Assert.Equal(orders[0].Id, result!.Order.Id));
    }

    private static MerchantSalesService CreateService(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new MerchantSalesService(
            db,
            new DocumentNumberService(db),
            new BusinessIdentityService(db, audit, TimeProvider.System),
            audit,
            TimeProvider.System);
    }

    private static async Task<Guid> SeedCatalogAsync(MyPetLinkDbContext db)
    {
        var product = new TagProduct { Name = "Wholesale Tag", Slug = $"ws-{Guid.NewGuid():N}", IsPublished = true };
        var variant = new TagProductVariant
        {
            TagProduct = product,
            PublicKey = Guid.NewGuid().ToString("N")[..16].ToUpperInvariant(),
            Sku = $"WS-{Guid.NewGuid():N}"[..16],
            DisplayName = "Lightweight",
            SupportsQr = true,
            TagVariant = "Lightweight",
            BasePrice = 19.90m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true,
        };

        db.AddRange(product, variant);
        // Sending a quotation freezes the seller identity, so the seed needs
        // the same configured business a real deployment has.
        var identity = await db.BusinessIdentitySettings.SingleOrDefaultAsync();
        if (identity is null)
        {
            identity = new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId,
                BrandName = "MyPetLink",
                LegalBusinessName = "GBB Software Solutions",
                BusinessRegistrationNumber = "202603141718 (AS0515813-P)",
                RegisteredCountry = "Malaysia",
                SupportEmail = "support@mypetlink.com.my",
            };
            db.BusinessIdentitySettings.Add(identity);
        }

        // The migration seeds the identity with the address deliberately empty
        // for an administrator to complete; these tests need it completed.
        identity.RegisteredAddressLine1 = "12 Jalan Teknologi 3/1";
        identity.RegisteredPostcode = "57000";
        identity.RegisteredCity = "Kuala Lumpur";
        identity.RegisteredState = "Kuala Lumpur";
        await db.SaveChangesAsync();
        return variant.Id;
    }

    private static UpsertMerchantRequest MerchantRequest() =>
        new($"Race Test {Guid.NewGuid():N}"[..40], null, null, null, null,
            "Aina Rahman", "orders@example.com", "+60123456789",
            new MerchantAddressDto("12 Jalan Perdana", null, "68000", "Ampang", "Selangor", "Malaysia"),
            true, null, null, null);
}
