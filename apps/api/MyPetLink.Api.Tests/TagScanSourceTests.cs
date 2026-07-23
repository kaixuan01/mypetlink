using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class TagScanSourceTests
{
    private static readonly TagScanContext ScanContext =
        new("127.0.0.1", "test-agent", "https://example.test/");

    [Fact]
    public async Task TrustedSources_AreRecordedAndNfcCannotEnterActivation()
    {
        await using var db = CreateDb();
        db.SmartTags.Add(new SmartTag
        {
            TagCode = "MPL-SOURCE-01",
            Status = SmartTagStatus.Unclaimed,
            HasNfc = true,
            Variant = "Standard",
        });
        await db.SaveChangesAsync();
        var service = CreateService(db);

        var qr = await service.ResolveAsync(
            "MPL-SOURCE-01", TagScanSource.Qr, ScanContext);
        var nfc = await service.ResolveAsync(
            "MPL-SOURCE-01", TagScanSource.Nfc, ScanContext);
        var legacy = await service.ResolveAsync(
            "MPL-SOURCE-01", TagScanSource.Legacy, ScanContext);

        Assert.Equal("unclaimed", qr.State);
        Assert.Equal("nfcActivationRequired", nfc.State);
        Assert.Equal("unclaimed", legacy.State);
        Assert.Equal(TagScanSource.Qr, qr.ScanSource);
        Assert.Equal(TagScanSource.Nfc, nfc.ScanSource);
        Assert.Equal(TagScanSource.Legacy, legacy.ScanSource);
        Assert.Equal(
            [TagScanSource.Qr, TagScanSource.Nfc, TagScanSource.Legacy],
            await db.TagScans
                .OrderBy(scan => scan.ScanTime)
                .Select(scan => scan.Source)
                .ToListAsync());
    }

    [Fact]
    public async Task ActiveQrAndNfc_ResolveTheSamePrivacySafeProfile()
    {
        await using var db = CreateDb();
        var owner = new User
        {
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner",
            Status = UserStatus.Active,
        };
        var pet = new Pet
        {
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Name = "Topu",
            Slug = "topu",
            Species = "Cat",
            SafetySetting = new PetSafetySetting
            {
                SafetyCode = "safe-topu",
                QrSafetyEnabled = true,
                ShowPhone = false,
                ShowWhatsapp = false,
            },
        };
        db.AddRange(owner, pet, new SmartTag
        {
            TagCode = "MPL-ACTIVE-SOURCE",
            Status = SmartTagStatus.Active,
            HasNfc = true,
            Variant = "Standard",
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Pet = pet,
            PetId = pet.Id,
            ActivatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
        var service = CreateService(db);

        var qr = await service.ResolveAsync(
            "MPL-ACTIVE-SOURCE", TagScanSource.Qr, ScanContext);
        var nfc = await service.ResolveAsync(
            "MPL-ACTIVE-SOURCE", TagScanSource.Nfc, ScanContext);

        Assert.Equal("active", qr.State);
        Assert.Equal("active", nfc.State);
        Assert.Equal(qr.Profile!.SafetyCode, nfc.Profile!.SafetyCode);
        Assert.Equal(qr.Profile.Name, nfc.Profile.Name);
        Assert.Equal("Topu", qr.Profile.Name);
        Assert.Null(qr.Profile.Contact);
    }

    [Fact]
    public async Task ControllerRouteSource_CannotBeOverriddenByClientInput()
    {
        var service = new CapturingTagScanService();
        var context = new DefaultHttpContext();
        context.Request.QueryString = new QueryString("?source=Nfc");
        context.Request.Headers["X-Scan-Source"] = "Nfc";
        var controller = new TagScanController(service)
        {
            ControllerContext = new ControllerContext { HttpContext = context },
        };

        await controller.ResolveQr("MPL-TRUSTED", CancellationToken.None);
        Assert.Equal(TagScanSource.Qr, service.LastSource);

        await controller.ResolveNfc("MPL-TRUSTED", CancellationToken.None);
        Assert.Equal(TagScanSource.Nfc, service.LastSource);

        await controller.ResolveLegacy("MPL-TRUSTED", CancellationToken.None);
        Assert.Equal(TagScanSource.Legacy, service.LastSource);
    }

    [Fact]
    public async Task OwnerHistory_FiltersByAllowListedSourceAndKeepsServerCounts()
    {
        await using var db = CreateDb();
        var owner = new User
        {
            Email = "history-owner@example.com",
            NormalizedEmail = "HISTORY-OWNER@EXAMPLE.COM",
            DisplayName = "History Owner",
            Status = UserStatus.Active,
        };
        var tag = new SmartTag
        {
            TagCode = "MPL-HISTORY-01",
            Status = SmartTagStatus.Active,
            HasNfc = true,
            Variant = "Standard",
            OwnerUser = owner,
            OwnerUserId = owner.Id,
        };
        db.AddRange(owner, tag);
        db.TagScans.AddRange(
            Scan(tag, TagScanSource.Qr),
            Scan(tag, TagScanSource.Nfc),
            Scan(tag, TagScanSource.Legacy),
            Scan(tag, TagScanSource.Unknown));
        await db.SaveChangesAsync();
        var service = new SmartTagService(
            db,
            new AuditLogService(db, new HttpContextAccessor()));

        var nfc = await service.ListScansAsync(owner.Id, tag.Id, "nfc");

        Assert.Single(nfc.Items);
        Assert.Equal(TagScanSource.Nfc, nfc.Items.Single().ScanSource);
        Assert.Equal(4, nfc.Total);
        Assert.Equal(1, nfc.QrScans);
        Assert.Equal(1, nfc.NfcTaps);
        Assert.Equal(2, nfc.LegacyOrUnknown);

        var invalid = await Assert.ThrowsAsync<ApiException>(
            () => service.ListScansAsync(owner.Id, tag.Id, "spoofed"));
        Assert.Equal(StatusCodes.Status400BadRequest, invalid.StatusCode);
    }

    private static MyPetLinkDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options);

    private static TagScanService CreateService(MyPetLinkDbContext db) =>
        new(db, Options.Create(new CloudflareR2Options()));

    private static TagScan Scan(SmartTag tag, TagScanSource source) =>
        new()
        {
            SmartTag = tag,
            SmartTagId = tag.Id,
            TagCode = tag.TagCode,
            Source = source,
            ResolvedState = TagScanResolvedState.Active,
            ScanTime = DateTimeOffset.UtcNow,
        };

    private sealed class CapturingTagScanService : SkeletonService, ITagScanService
    {
        public TagScanSource LastSource { get; private set; }

        public Task<TagScanPageResponse> ResolveAsync(
            string tagCode,
            TagScanSource source,
            TagScanContext context,
            CancellationToken cancellationToken = default)
        {
            LastSource = source;
            return Task.FromResult(
                new TagScanPageResponse(
                    "notFound", tagCode, null, source, null));
        }

        public Task SubmitLocationConsentAsync(
            string tagCode,
            SubmitScanLocationConsentRequest request,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }
}
