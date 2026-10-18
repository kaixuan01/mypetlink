using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

public sealed partial class ConsignmentRelationalTests
{
    // Explicit historical-schema fixtures. Current EF entities deliberately cannot
    // insert into a schema that does not yet have the new attribution/receiving fields.
    private static async Task<Guid> LegacyAgreement(MyPetLinkDbContext db)
    {
        var id=Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT ConsignmentAgreements(Id,MerchantId,Reference,Version,PartnerCommissionPercentage,Status,UpdatedByAdminUserId,CreatedAt,UpdatedAt)
            VALUES({id},{MerchantId},'SYN-LEGACY',1,35,'Draft',{AdminRecordId},{Now},{Now});
            """);
        return id;
    }
    private static async Task<Guid> LegacyDispatch(MyPetLinkDbContext db,Guid agreement,string key,string fingerprint,string status)
    {
        var id=Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT ConsignmentDispatches(Id,AgreementId,DispatchNumber,IdempotencyKey,RequestFingerprint,
              MerchantNameSnapshot,AgreementReferenceSnapshot,AgreementVersionSnapshot,CommissionPercentageSnapshot,
              DestinationSnapshot,ExternalTrackerReference,Seller_BrandName,Seller_LegalBusinessName,
              Seller_BusinessRegistrationNumber,Seller_AddressLine1,Seller_Postcode,Seller_City,Seller_State,
              Seller_Country,Seller_SupportEmail,Status,UpdatedByAdminUserId,CreatedAt,UpdatedAt)
            VALUES({id},{agreement},{key},{key},{fingerprint},'Synthetic merchant','SYN-LEGACY',1,35,
              'Synthetic branch','Synthetic tracker','MyPetLink','Synthetic seller','SYN-REG','1 Synthetic Street',
              '50000','Kuala Lumpur','Kuala Lumpur','Malaysia','synthetic@example.invalid',{status},{AdminRecordId},{Now},{Now});
            """);
        return id;
    }
    [Fact]
    public async Task MigrationLegacyDiscrepanciesRequireReviewWithoutRewritingKnownCustodyOrPdf()
    {
        Assert.True(RelationalDatabase.IsAvailable,"SQL Server migration verification must not skip.");
        await using var scope=await RelationalDatabase.CreateAsync(createSchema:false);await using var db=scope.NewContext();
        await db.GetService<IMigrator>().MigrateAsync("20261017103941_HardenConsignmentOperationalControls");
        await SeedAsync(db,qrStock:0,nfcStock:3);var agreement=await LegacyAgreement(db);
        var dispatch=await LegacyDispatch(db,agreement,"SYN-LEGACY-DISPATCH","SYN-LEGACY-FINGERPRINT","Dispatched");
        byte[] pdf=[1,2,3,4];
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ConsignmentDispatches SET HasOpenDiscrepancy=1, IssuedDocumentContent={pdf} WHERE Id={dispatch}");
        var tags=await db.SmartTags.OrderBy(t=>t.Id).Select(t=>new{t.Id,t.TagCode}).ToArrayAsync();
        var states=new[]{"ExternalHandover","Dispatched","ReturnedQuarantine"};
        for(var i=0;i<tags.Length;i++)
        {
            var unit=Guid.NewGuid();DateTimeOffset? returned=i==2?Now:null;
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT ConsignmentUnits(Id,DispatchId,SmartTagId,ProductVariantId,TagCodeSnapshot,SkuSnapshot,
                  ProductNameSnapshot,VariantSnapshot,Status,ReturnedAt,CreatedAt,UpdatedAt)
                VALUES({unit},{dispatch},{tags[i].Id},{NfcVariantId},{tags[i].TagCode},'SYN-SKU','Synthetic tag',
                  'Standard',{states[i]},{returned},{Now},{Now});
                """);
        }
        var movement=Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT ConsignmentMovements(Id,DispatchId,Action,Reference,ActorAdminUserId,OccurredAt)
            VALUES({movement},{dispatch},'record-discrepancy','SYN-LEGACY-EVIDENCE',{AdminRecordId},{Now});
            """);
        await db.Database.MigrateAsync();db.ChangeTracker.Clear();
        var units=await db.ConsignmentUnits.ToListAsync();
        Assert.Equal(ConsignmentReceivingState.Good,units.Single(u=>u.Status==ConsignmentUnitStatus.ExternalHandover).ReceivingState);
        Assert.All(units.Where(u=>u.Status!=ConsignmentUnitStatus.ExternalHandover),u=>{
            Assert.Equal(ConsignmentReceivingState.ReviewRequired,u.ReceivingState);Assert.Equal(AdminRecordId,u.DiscrepancyRecordedByAdminUserId);
        });
        Assert.All(units,u=>Assert.Null(u.ReleasedAt));Assert.False((await db.ConsignmentAgreements.SingleAsync()).DraftContributorHistoryComplete);
        Assert.Empty(db.ConsignmentDraftContributors);Assert.Equal(pdf,(await db.ConsignmentDispatches.SingleAsync()).IssuedDocumentContent);
        var failure=await Assert.ThrowsAnyAsync<Exception>(()=>db.GetService<IMigrator>().MigrateAsync("20261017103941_HardenConsignmentOperationalControls"));
        Assert.Contains("rollback blocked",failure.ToString(),StringComparison.OrdinalIgnoreCase);Assert.Equal(3,await db.ConsignmentUnits.CountAsync());
    }
    [Fact]
    public async Task MigrationDuplicateActiveFingerprintGuardPreservesBothHistoricalRows()
    {
        Assert.True(RelationalDatabase.IsAvailable,"SQL Server duplicate preflight must not skip.");
        await using var scope=await RelationalDatabase.CreateAsync(createSchema:false);await using var db=scope.NewContext();
        await db.GetService<IMigrator>().MigrateAsync("20261017082802_AddConsignmentAgreementAndCustody");
        await SeedAsync(db,qrStock:0,nfcStock:0);var agreement=await LegacyAgreement(db);
        await LegacyDispatch(db,agreement,"SYN-DUP-A","SYN-DUP-FINGERPRINT","Reserved");
        await LegacyDispatch(db,agreement,"SYN-DUP-B","SYN-DUP-FINGERPRINT","Reserved");
        var failure=await Assert.ThrowsAnyAsync<Exception>(()=>db.Database.MigrateAsync());
        Assert.Contains("Duplicate active consignment reservations",failure.ToString());Assert.Equal(2,await db.ConsignmentDispatches.CountAsync());
        Assert.Equal("20261017082802_AddConsignmentAgreementAndCustody",(await db.Database.GetAppliedMigrationsAsync()).Last());
    }
}
