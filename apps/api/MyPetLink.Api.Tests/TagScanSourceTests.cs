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
    public async Task AwaitingActivationRequiresQrFlowAndNeverReturnsSafetyData()
    {
        await using var db = CreateDb();
        var owner = new User
        {
            Email = "pending-owner@example.com",
            NormalizedEmail = "PENDING-OWNER@EXAMPLE.COM",
            DisplayName = "Pending Owner",
            Status = UserStatus.Active,
        };
        var pet = new Pet
        {
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Name = "Pending Pet",
            Slug = "pending-pet",
            Species = "Cat",
            SafetySetting = new PetSafetySetting
            {
                SafetyCode = "safe-pending",
                QrSafetyEnabled = true,
            },
        };
        db.AddRange(owner, pet, new SmartTag
        {
            TagCode = "MPL-PENDING-SOURCE",
            Status = SmartTagStatus.Delivered,
            HasNfc = true,
            Variant = "Standard",
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Pet = pet,
            PetId = pet.Id,
        });
        await db.SaveChangesAsync();
        var service = CreateService(db);

        var qr = await service.ResolveAsync(
            "MPL-PENDING-SOURCE", TagScanSource.Qr, ScanContext);
        var nfc = await service.ResolveAsync(
            "MPL-PENDING-SOURCE", TagScanSource.Nfc, ScanContext);
        var legacy = await service.ResolveAsync(
            "MPL-PENDING-SOURCE", TagScanSource.Legacy, ScanContext);

        Assert.Equal("pending", qr.State);
        Assert.Equal("nfcActivationRequired", nfc.State);
        Assert.Equal("pending", legacy.State);
        Assert.Null(qr.Profile);
        Assert.Null(nfc.Profile);
        Assert.Null(legacy.Profile);
    }

    [Fact]
    public async Task ReplacedAndArchivedTagsNeverExposePreviousSafetyProfile()
    {
        await using var db = CreateDb();
        var owner = new User
        {
            Email = "inactive-owner@example.com",
            NormalizedEmail = "INACTIVE-OWNER@EXAMPLE.COM",
            DisplayName = "Inactive Owner",
            Status = UserStatus.Active,
        };
        var pet = new Pet
        {
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Name = "Private Pet",
            Slug = "private-pet",
            Species = "Dog",
            SafetySetting = new PetSafetySetting
            {
                SafetyCode = "safe-private",
                QrSafetyEnabled = true,
                ShowPhone = true,
            },
            Contact = new PetContact
            {
                PhoneE164 = "+60123456789",
            },
        };
        db.AddRange(
            owner,
            pet,
            BoundTag("MPL-REPLACED-SOURCE", SmartTagStatus.Replaced, owner, pet),
            BoundTag(
                "MPL-ARCHIVED-SOURCE",
                SmartTagStatus.Archived,
                owner,
                pet,
                DateTimeOffset.UtcNow));
        await db.SaveChangesAsync();
        var service = CreateService(db);

        foreach (var code in new[]
                 {
                     "MPL-REPLACED-SOURCE",
                     "MPL-ARCHIVED-SOURCE"
                 })
        {
            foreach (var source in new[]
                     {
                         TagScanSource.Qr,
                         TagScanSource.Nfc,
                         TagScanSource.Legacy
                     })
            {
                var result = await service.ResolveAsync(code, source, ScanContext);
                Assert.Equal("inactive", result.State);
                Assert.Null(result.Profile);
            }
        }
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

    private static SmartTag BoundTag(
        string code,
        SmartTagStatus status,
        User owner,
        Pet pet,
        DateTimeOffset? archivedAt = null) =>
        new()
        {
            TagCode = code,
            Status = status,
            HasNfc = true,
            Variant = "Standard",
            OwnerUser = owner,
            OwnerUserId = owner.Id,
            Pet = pet,
            PetId = pet.Id,
            ActivatedAt = DateTimeOffset.UtcNow.AddDays(-1),
            ArchivedAt = archivedAt,
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

        public Task<PublicFinderSocialResponse> GetSocialByTagCodeAsync(
            string tagCode,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(new PublicFinderSocialResponse("active", "Nori", null, null));

        public Task SubmitLocationConsentAsync(
            string tagCode,
            SubmitScanLocationConsentRequest request,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }
}
