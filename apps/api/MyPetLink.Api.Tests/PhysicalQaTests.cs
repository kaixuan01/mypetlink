using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class PhysicalQaTests
{
    internal static readonly Guid UserId = Guid.NewGuid();
    internal static readonly Guid VariantId = Guid.NewGuid();
    internal static readonly Guid TagId = Guid.NewGuid();
    internal const string Code = "MPL-ABCD-2345";
    internal static readonly IDataProtectionProvider Protection = new EphemeralDataProtectionProvider();
    internal static PhysicalQaService Service(MyPetLinkDbContext db, TimeProvider? clock = null) => new(db,
        new AuditLogService(db, new HttpContextAccessor()), Protection,
        Options.Create(new PublicSiteOptions { BaseUrl = "https://mypetlink.example" }), clock ?? TimeProvider.System);
    internal static async Task Seed(MyPetLinkDbContext db)
    {
        var admin = new User { Id = UserId, Email = "qa@example.com", NormalizedEmail = "QA@EXAMPLE.COM", DisplayName = "QA Operator", Status = UserStatus.Active };
        admin.AdminUser = new AdminUser { UserId = UserId, User = admin, IsActive = true };
        var product = new TagProduct { Name = "Smart Tag", Slug = "qa-test", IsPublished = true };
        var variant = new TagProductVariant { Id = VariantId, TagProduct = product, Sku = "QA-NFC", DisplayName = "Standard", SupportsNfc = true, SupportsQr = true, IsActive = true, IsPurchasable = true };
        db.AddRange(admin, variant, new SmartTag { Id = TagId, TagCode = Code, HasNfc = true, ProductVariantId = VariantId,
            QaStatus = PhysicalQaStatus.Pending, QaShipmentReference = "SHIPMENT-900", QaVersion = 1 });
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
    }
    private static async Task<MyPetLinkDbContext> Db()
    {
        var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        await Seed(db); return db;
    }
    internal static async Task<SavePhysicalQaRequest> Pass(PhysicalQaService qa, int version = 1, string serial = "04:A1:B2:C3:D4:E5:F6", QaCaptureSource nfcSource = QaCaptureSource.WebNfc)
    {
        var qr = await qa.CaptureAsync(UserId, new(Code, version, QaCaptureSource.Camera, $"https://mypetlink.example/q/{Code}", null), default);
        var nfc = await qa.CaptureAsync(UserId, new(Code, version, nfcSource, $"https://mypetlink.example/n/{Code}", serial), default);
        return new(Guid.NewGuid(), version, PhysicalQaStatus.Passed, PhysicalTagCondition.Good, qr.Evidence, nfc.Evidence, version > 1 ? "Repeat package inspection" : null);
    }

    [Fact]
    public async Task PassIsAuditedAndRetryIsIdempotentWithoutFinderScansOrLifecycleChanges()
    {
        await using var db = await Db(); var qa = Service(db); var request = await Pass(qa);
        var saved = await qa.SaveAsync(UserId, TagId, request, default);
        await qa.SaveAsync(UserId, TagId, request, default);
        Assert.Equal(PhysicalQaStatus.Passed, saved.QaStatus); Assert.Equal(2, saved.Version);
        Assert.NotNull(saved.QrVerifiedAt); Assert.NotNull(saved.NfcVerifiedAt); Assert.Equal("QA Operator", saved.InspectedBy);
        Assert.Single(await db.AuditLogs.ToListAsync()); Assert.Empty(await db.TagScans.ToListAsync());
        var tag = await db.SmartTags.SingleAsync(); Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
        Assert.Equal(TagFulfilmentStatus.Generated, tag.FulfilmentStatus); Assert.Null(tag.LastScannedAt); Assert.Null(tag.ActivatedAt);
        Assert.Equal(1, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(VariantId));
    }
    [Theory]
    [InlineData("https://wrong.example/q/MPL-ABCD-2345", QaCaptureSource.Camera)]
    [InlineData("https://mypetlink.example/n/MPL-ABCD-2345", QaCaptureSource.Camera)]
    [InlineData("https://mypetlink.example/q/MPL-ABCD-2345?x=1", QaCaptureSource.Camera)]
    [InlineData("https://mypetlink.example/n/MPL-AAAA-AAAA", QaCaptureSource.WebNfc)]
    [InlineData("https://mypetlink.example/q/MPL-ABCD-2345", QaCaptureSource.WebNfc)]
    [InlineData("not a website", QaCaptureSource.WebNfc)]
    public async Task InvalidOriginRouteAndMismatchedCodeCannotPass(string url, QaCaptureSource source)
    {
        await using var db = await Db(); var qa = Service(db); var good = await Pass(qa);
        var invalid = await qa.CaptureAsync(UserId, new(Code, 1, source, url, null), default);
        Assert.False(invalid.Matches);
        var request = source == QaCaptureSource.Camera ? good with { QrEvidence = invalid.Evidence } : good with { NfcEvidence = invalid.Evidence };
        var failure = await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, request, default));
        Assert.Equal(400, failure.StatusCode); Assert.Empty(await db.AuditLogs.ToListAsync());
    }
    [Fact]
    public async Task TypedNfcUrlMissingReadAndWrongCaptureSourceCannotPass()
    {
        await using var db = await Db(); var qa = Service(db); var good = await Pass(qa);
        foreach (var request in new[] { good with { NfcEvidence = null }, good with { NfcEvidence = "https://mypetlink.example/n/" + Code }, good with { NfcEvidence = good.QrEvidence }, good with { PhysicalCondition = PhysicalTagCondition.Unchecked } })
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, request, default))).StatusCode);
        var failed = await qa.SaveAsync(UserId, TagId, good with { Decision = PhysicalQaStatus.Failed, NfcEvidence = null, Remarks = "Chip unreadable" }, default);
        Assert.Equal(PhysicalQaStatus.Failed, failed.QaStatus); Assert.Null(failed.NfcVerifiedAt);
    }
    [Fact]
    public async Task ReinspectionRequiresFreshCapturesAndRemarksAndDetectsDifferentPhysicalChip()
    {
        await using var db = await Db(); var qa = Service(db); var first = await Pass(qa); await qa.SaveAsync(UserId, TagId, first, default);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, first with { InspectionId = Guid.NewGuid() }, default))).StatusCode);
        var second = await Pass(qa, 2, "04:99:88:77:66:55:44");
        await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, second, default));
        await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, second with { Decision = PhysicalQaStatus.NeedsReview, Remarks = null }, default));
        var hold = await qa.SaveAsync(UserId, TagId, second with { Decision = PhysicalQaStatus.NeedsReview, Remarks = "Duplicate physical code on two packages" }, default);
        Assert.Equal(PhysicalQaStatus.NeedsReview, hold.QaStatus);
        Assert.Equal(2, (await qa.HistoryAsync(TagId, default)).Count); Assert.Empty(await db.TagScans.ToListAsync());
    }
    [Fact]
    public async Task ReaderResultsAreBoundToTheSameAdminTagAndVersionAndExpire()
    {
        await using var db = await Db(); var clock = new AdjustableClock(); var qa = Service(db, clock); var pass = await Pass(qa);
        var other = new User { Email = "other@example.com", NormalizedEmail = "OTHER@EXAMPLE.COM" }; other.AdminUser = new AdminUser { User = other, IsActive = true }; db.Add(other); await db.SaveChangesAsync();
        Assert.Contains("belongs to another inspection", (await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(other.Id, TagId, pass, default))).Message);
        clock.Now += TimeSpan.FromMinutes(31);
        Assert.Contains("expired", (await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, pass, default))).Message);
        Assert.Equal(401, (await Assert.ThrowsAsync<ApiException>(() => qa.CaptureAsync(null, new(Code, 1, QaCaptureSource.Camera, "test", null), default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => qa.LookupAsync("MPL-ZZZZ-ZZZZ", default))).StatusCode);
        Assert.Empty(await db.AuditLogs.ToListAsync());
    }

    [Theory]
    [InlineData(-1, true)]   // Saving instance a minute behind the capturing one.
    [InlineData(-3, false)]  // Beyond the allowance: refused, never passed.
    [InlineData(29, true)]
    public async Task ReceiptsTolerateSmallClockDifferencesBetweenInstances(int minutesLater, bool accepted)
    {
        await using var db = await Db(); var clock = new AdjustableClock(); var qa = Service(db, clock); var pass = await Pass(qa);
        clock.Now += TimeSpan.FromMinutes(minutesLater);
        if (accepted) Assert.Equal(PhysicalQaStatus.Passed, (await qa.SaveAsync(UserId, TagId, pass, default)).QaStatus);
        else Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, pass, default))).StatusCode);
    }

    [Fact]
    public async Task OnlyInScreenCameraAndWebNfcReadersAreAccepted()
    {
        await using var db = await Db(); var qa = Service(db);
        // The external USB reader workflow is not part of this release.
        var unsupported = await Assert.ThrowsAsync<ApiException>(() => qa.CaptureAsync(UserId,
            new(Code, 1, (QaCaptureSource)2, $"https://mypetlink.example/n/{Code}", "04AA"), default));
        Assert.Equal(400, unsupported.StatusCode);
        var good = await Pass(qa);
        var swapped = good with { QrEvidence = good.NfcEvidence, NfcEvidence = good.QrEvidence };
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(UserId, TagId, swapped, default))).StatusCode);
    }

    [Theory]
    [InlineData("https://mypetlink.example/t/MPL-ABCD-2345", QaCaptureSource.Camera, "older printed-tag link /t/")]
    [InlineData("https://mypetlink.example/t/MPL-ABCD-2345", QaCaptureSource.WebNfc, "older printed-tag link /t/")]
    [InlineData("https://www.mypetlink.example/q/MPL-ABCD-2345", QaCaptureSource.Camera, "opens https://www.mypetlink.example, not https://mypetlink.example")]
    [InlineData("http://mypetlink.example/n/MPL-ABCD-2345", QaCaptureSource.WebNfc, "opens http://mypetlink.example, not https://mypetlink.example")]
    [InlineData("https://mypetlink.example/n/MPL-ABCD-2345", QaCaptureSource.Camera, "uses the NFC link /n/ instead of /q/")]
    [InlineData("https://mypetlink.example/q/MPL-ABCD-2345", QaCaptureSource.WebNfc, "uses the QR link /q/ instead of /n/")]
    [InlineData("https://mypetlink.example/q/MPL-ABCD-2345?utm=box", QaCaptureSource.Camera, "extra text after the tag code")]
    [InlineData("https://mypetlink.example/q/mpl-abcd-2345", QaCaptureSource.Camera, "does not end in a valid tag code")]
    [InlineData("https://mypetlink.example/q/MPL-ABCD-2345/", QaCaptureSource.Camera, "not in the expected format")]
    [InlineData("MPL-ABCD-2345", QaCaptureSource.Camera, "does not contain a website link")]
    [InlineData("https://mypetlink.example/n/MPL-AAAA-AAAA", QaCaptureSource.WebNfc, "belongs to MPL-AAAA-AAAA, but this package is MPL-ABCD-2345")]
    public async Task RefusalsNameTheProblemAndTheExpectedLink(string url, QaCaptureSource source, string expected)
    {
        await using var db = await Db(); var qa = Service(db);
        var result = await qa.CaptureAsync(UserId, new(Code, 1, source, url, null), default);
        Assert.False(result.Matches);
        Assert.Contains(expected, result.Problem);
        if (!expected.StartsWith("belongs"))
            Assert.Contains(source == QaCaptureSource.Camera ? $"https://mypetlink.example/q/{Code}" : $"https://mypetlink.example/n/{Code}", result.Problem);
    }

    [Theory]
    [InlineData("04:a1:b2:c3:d4:e5:f6", "04A1B2C3D4E5F6")]   // Web NFC formatting
    [InlineData(" 04-A1-B2-C3-D4-E5-F6 ", "04A1B2C3D4E5F6")]
    [InlineData("04 a1 b2 c3", "04A1B2C3")]
    [InlineData("04A1B2C3D4E5F6", "04A1B2C3D4E5F6")]           // PC/SC formatting
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData("chip-A", null)]                                // not hexadecimal
    [InlineData("04:A1:B2", null)]                              // too short
    [InlineData("04A1B2C3D", null)]                             // half a byte
    [InlineData("00:00:00:00", null)]                           // placeholder, not an ID
    public async Task ChipIdsAreNormalizedAndUnusableValuesAreNotIds(string? reported, string? expected)
    {
        await using var db = await Db(); var qa = Service(db);
        var nfc = await qa.CaptureAsync(UserId, new(Code, 1, QaCaptureSource.WebNfc, $"https://mypetlink.example/n/{Code}", reported), default);
        Assert.Equal(expected, nfc.ChipId);
        var camera = await qa.CaptureAsync(UserId, new(Code, 1, QaCaptureSource.Camera, $"https://mypetlink.example/q/{Code}", reported), default);
        Assert.Null(camera.ChipId);
    }

    [Fact]
    public async Task TheConfirmedShipmentFormatMatches()
    {
        await using var db = await Db();
        var qa = new PhysicalQaService(db, new AuditLogService(db, new HttpContextAccessor()), Protection,
            Options.Create(new PublicSiteOptions { BaseUrl = "https://mypetlink.com.my" }), TimeProvider.System);
        var qr = await qa.CaptureAsync(UserId, new(Code, 1, QaCaptureSource.Camera, $"https://mypetlink.com.my/q/{Code}", null), default);
        var nfc = await qa.CaptureAsync(UserId, new(Code, 1, QaCaptureSource.WebNfc, $"https://mypetlink.com.my/n/{Code}", "04:9A:7B:2C:11:22:80"), default);
        Assert.True(qr.Matches, qr.Problem); Assert.True(nfc.Matches, nfc.Problem);
        Assert.Equal(Code, qr.ObservedCode); Assert.Equal(Code, nfc.ObservedCode);
    }
    [Theory]
    [InlineData(PhysicalQaStatus.Pending)] [InlineData(PhysicalQaStatus.Failed)] [InlineData(PhysicalQaStatus.NeedsReview)]
    public async Task UnpassedStockIsExcludedFromBothStockCountersMerchantEligibilityAndShippingGuard(PhysicalQaStatus status)
    {
        await using var db = await Db(); var tag = await db.SmartTags.SingleAsync(); tag.QaStatus = status; await db.SaveChangesAsync();
        var stock = new TagOrderInventoryAvailabilityService(db);
        Assert.Equal(0, await stock.GetAvailableUnitsAsync(VariantId));
        Assert.Equal(0, (await stock.GetAvailableUnitsAsync([VariantId]))[VariantId]);
        Assert.Empty(await db.SmartTags.Where(MerchantInventoryEligibility.For(db, VariantId)).ToListAsync());
        Assert.Throws<ApiException>(() => PhysicalQaReleaseRules.RequireReleased([tag]));
        tag.QaStatus = null; await db.SaveChangesAsync();
        Assert.Equal(1, await stock.GetAvailableUnitsAsync(VariantId));
        PhysicalQaReleaseRules.RequireReleased([tag]);
    }
    [Fact]
    public async Task CohortEnrollmentUsesExactExistingManifestAndPreservesHistoricalTags()
    {
        await using var db = await Db(); var tag = await db.SmartTags.SingleAsync(); tag.QaStatus = null; tag.QaShipmentReference = null;
        var historical = new SmartTag { TagCode = "MPL-AAAA-AAAA", HasNfc = true, ProductVariantId = VariantId, Status = SmartTagStatus.Active };
        db.Add(historical); await db.SaveChangesAsync(); var qa = Service(db);
        var request = new PhysicalQaCohortRequest("FIRST-900", [Code], 1);
        Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => qa.EnrollAsync(UserId, request with { TagCodes = [null!] }, default))).StatusCode);
        Assert.NotEmpty((await qa.PreviewAsync(request with { TagCodes = [Code, Code], ExpectedCount = 2 }, default)).Problems);
        Assert.NotEmpty((await qa.PreviewAsync(request with { TagCodes = [historical.TagCode] }, default)).Problems);
        await qa.EnrollAsync(UserId, request, default); await qa.EnrollAsync(UserId, request, default);
        Assert.Equal(2, await db.SmartTags.CountAsync());
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-enrolled"));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-cohort-enrolled"));
        Assert.Null((await db.SmartTags.SingleAsync(t => t.Id == historical.Id)).QaStatus);
        var summary = await qa.SummaryAsync(new PhysicalQaQuery { Shipment = "FIRST-900" }, default);
        Assert.Equal(1, summary.TotalExpected); Assert.Equal(1, summary.Pending); Assert.Equal(0, summary.Inspected);
    }
    [Fact]
    public async Task NewMerchantCommitmentsCannotCountUnpassedStockAndCsvReconcilesEscapedRemarks()
    {
        await using var db = await Db();
        var lines = new[] { new MerchantQuotationItem { ProductVariantId = VariantId, Quantity = 1 } };
        Assert.Equal("physical_qa_stock_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            PhysicalQaReleaseRules.RequireMerchantQaStockAsync(db, lines, default))).Code);
        var qa = Service(db);
        await qa.SaveAsync(UserId, TagId, new(Guid.NewGuid(), 1, PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, null, null, "=supplier exception"), default);
        var csv = System.Text.Encoding.UTF8.GetString((await qa.ExportAsync(UserId, new PhysicalQaQuery { Shipment = "SHIPMENT-900" }, default)).Content);
        Assert.Contains("SHIPMENT-900", csv); Assert.Contains("Failed", csv); Assert.Contains("'=supplier exception", csv);
        Assert.Equal(1, (await qa.ListAsync(new PhysicalQaQuery { QaStatus = "Failed", Sku = "QA-NFC", TagCode = "ABCD" }, default)).Total);
        Assert.Equal(1, (await qa.SummaryAsync(new PhysicalQaQuery { QaStatus = "Passed" }, default)).Failed);
        var tag = await db.SmartTags.SingleAsync(); tag.QaStatus = null; await db.SaveChangesAsync();
        await PhysicalQaReleaseRules.RequireMerchantQaStockAsync(db, lines, default);
    }

    private sealed class AdjustableClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
