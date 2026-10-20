using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The marketing demo account is the one fixture in the product that is filmed
/// and published, so the things worth testing about it are not the shape of its
/// rows but the promises around it: that it cannot exist outside a developer's
/// machine, that it carries nobody's real contact details, that its pictures
/// never point at production media, that it takes the reserved brand handle
/// through the audited door rather than around it, and that running the seeder
/// twice does not quietly produce two of everything.
/// </summary>
public sealed class MarketingDemoSeederTests
{
    private const string DemoEmail = "marketing.demo@mypetlink.local";
    private static readonly Guid DemoOwnerId = Guid.Parse("b4a4de70-0000-4000-8000-000000000001");

    // ---- the gates -----------------------------------------------------------

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void TheOptionsRefuseToStartOutsideDevelopment(string environmentName)
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            MarketingDemoOptions.ValidateForStartup(
                new FakeEnvironment(environmentName),
                new MarketingDemoOptions { Enabled = true }));

        Assert.Contains("Development", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ADisabledSeederIsAcceptedAnywhere()
    {
        // Every deployed host carries the setting and leaves it off. Validating
        // a disabled value would make the section itself undeployable.
        MarketingDemoOptions.ValidateForStartup(
            new FakeEnvironment("Production"),
            new MarketingDemoOptions { Enabled = false });
    }

    [Theory]
    [InlineData("https://media.mypetlink.com.my")]
    [InlineData("https://staging.mypetlink.com.my")]
    public void TheMediaBaseMustBeLoopback_SoFixturesCannotBePublished(string mediaBaseUrl)
    {
        // The entire reason demo media has its own base is to stay off the real
        // CDN. A value pointing anywhere reachable defeats that, so it is a
        // startup failure rather than something noticed later in a frame.
        var exception = Assert.Throws<InvalidOperationException>(() =>
            MarketingDemoOptions.ValidateForStartup(
                new FakeEnvironment("Development"),
                new MarketingDemoOptions { Enabled = true, MediaBaseUrl = mediaBaseUrl }));

        Assert.Contains("loopback", exception.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(false, true, "Development")]
    [InlineData(true, false, "Development")]
    [InlineData(true, true, "Production")]
    public async Task NothingIsSeededUnlessAllThreeSwitchesAgree(
        bool devAuthEnabled, bool marketingDemoEnabled, string environmentName)
    {
        await using var db = CreateDb();
        await SeedPlanAndAdminAsync(db);

        var seeded = await CreateSeeder(
            db,
            environmentName: environmentName,
            devAuthEnabled: devAuthEnabled,
            marketingDemoEnabled: marketingDemoEnabled).EnsureSeededAsync();

        Assert.False(seeded);
        Assert.Empty(await db.Users.Where(user => user.Id == DemoOwnerId).ToListAsync());
    }

    [Fact]
    public async Task WithoutADevelopmentAdministrator_NothingIsSeeded()
    {
        // The reserved handle is assigned on an administrator's authority. With
        // no administrator to attribute it to, the correct answer is to do
        // nothing, not to write the brand identity unattributed.
        await using var db = CreateDb();
        await AddFreePlanAsync(db);

        Assert.False(await CreateSeeder(db).EnsureSeededAsync());
        Assert.Empty(await db.Users.ToListAsync());
    }

    // ---- what it produces ----------------------------------------------------

    [Fact]
    public async Task ItSeedsOneBrandAccountAndBothMascots()
    {
        await using var db = await SeededAsync();

        var owner = await db.Users
            .Include(user => user.SocialProfile)
            .Include(user => user.OwnerProfile)
            .SingleAsync(user => user.Id == DemoOwnerId);

        Assert.Equal("MyPetLink", owner.SocialProfile!.DisplayName);
        Assert.True(owner.SocialProfile.IsSocialEnabled);
        Assert.True(owner.SocialProfile.IsDiscoverable);
        Assert.NotNull(owner.SocialProfile.AvatarMediaFileId);

        var pets = await db.Pets.OrderBy(pet => pet.Name).ToListAsync();
        Assert.Equal(2, pets.Count);

        // The two mascots are different animals and must never be collapsed into
        // one another: the IP board makes Linko the cat and Linky the dog, and a
        // seeder that swapped them would put a dog on the Curious Connector's
        // profile without failing anything else.
        var linko = pets.Single(pet => pet.Name == "Linko");
        Assert.Equal("Cat", linko.Species);
        Assert.Equal("Domestic Shorthair", linko.Breed);

        var linky = pets.Single(pet => pet.Name == "Linky");
        Assert.Equal("Dog", linky.Species);
        Assert.Contains("Kampung", linky.Breed!, StringComparison.OrdinalIgnoreCase);

        Assert.All(pets, pet =>
        {
            Assert.Equal(DemoOwnerId, pet.OwnerUserId);
            Assert.NotNull(pet.ProfileMediaFileId);
            Assert.NotNull(pet.CoverMediaFileId);
        });

        // Distinct photographs. One shared image would put the same face on both
        // mascots, which is the failure a "both pets exist" check sails past.
        Assert.NotEqual(linko.ProfileMediaFileId, linky.ProfileMediaFileId);
        Assert.NotEqual(linko.CoverMediaFileId, linky.CoverMediaFileId);
    }

    [Fact]
    public async Task EachMascotIsReachableAtItsOwnPublicAndSafetyCode()
    {
        await using var db = await SeededAsync();

        var profiles = await db.PetPublicProfiles.ToListAsync();
        var safety = await db.PetSafetySettings.ToListAsync();

        // Two pets sharing a code would mean one Safety Profile silently shadowed
        // the other, and only one of the two recordings would be of the pet it
        // claimed to be.
        Assert.Equal(2, profiles.Select(profile => profile.PublicCode).Distinct().Count());
        Assert.Equal(2, safety.Select(setting => setting.SafetyCode).Distinct().Count());
    }

    [Fact]
    public async Task BothMascotsArePubliclyReachableAndSociallyConsented()
    {
        await using var db = await SeededAsync();

        var pets = await db.Pets
            .Include(item => item.PublicProfile)
            .Include(item => item.SocialProfile)
            .Include(item => item.SafetySetting)
            .ToListAsync();

        Assert.All(pets, pet =>
        {
            Assert.True(pet.PublicProfile!.IsPublicProfileEnabled);
            Assert.True(pet.SafetySetting!.QrSafetyEnabled);
            Assert.True(pet.SocialProfile!.IsSocialEnabled);
            Assert.True(pet.SocialProfile.IsDiscoverable);

            // The stamp the owner-facing settings route writes. Without it the
            // visibility check that compares consent against the current owner
            // refuses the pet, and the demo would be invisible on every social
            // surface for reasons nobody would think to look for.
            Assert.Equal(pet.OwnerUserId, pet.SocialProfile.ConsentedByUserId);
        });
    }

    [Fact]
    public async Task TheMomentsArePublic_AuthoredByTheBrand_AndCoverBothMascots()
    {
        await using var db = await SeededAsync();

        var moments = await db.PetMemories.ToListAsync();
        Assert.Equal(5, moments.Count);

        var petIds = await db.Pets.Select(pet => pet.Id).ToListAsync();
        foreach (var moment in moments)
        {
            Assert.Equal(MemoryVisibility.Public, moment.Visibility);
            Assert.NotNull(moment.PublishedAt);
            Assert.Equal(DemoOwnerId, moment.AuthorUserId);
            Assert.Contains(moment.PetId, petIds);
            Assert.False(string.IsNullOrWhiteSpace(moment.Caption));
            Assert.NotNull(moment.CoverMediaFileId);
        }

        // Both mascots are the primary subject of at least one Moment, so
        // neither is present only as a passenger on the other's post.
        Assert.Equal(2, moments.Select(moment => moment.PetId).Distinct().Count());
    }

    [Fact]
    public async Task OneMomentIsAboutBothMascots_AndCostsOneAllowance()
    {
        await using var db = await SeededAsync();

        var subjectsByMoment = (await db.MomentPets.ToListAsync())
            .GroupBy(subject => subject.MomentId)
            .ToDictionary(group => group.Key, group => group.Select(item => item.PetId).ToArray());

        // Every Moment carries its primary subject in the many-to-many table too.
        var moments = await db.PetMemories.ToListAsync();
        foreach (var moment in moments)
        {
            Assert.Contains(moment.PetId, subjectsByMoment[moment.Id]);
        }

        var shared = Assert.Single(subjectsByMoment.Where(entry => entry.Value.Length == 2));
        Assert.Equal(2, shared.Value.Distinct().Count());

        // The extra subject row never counts against a plan: the allowance
        // follows PetMemories.PetId, so five Moments remain five.
        Assert.Equal(5, moments.Count);
        Assert.Equal(6, subjectsByMoment.Values.Sum(subjects => subjects.Length));
    }

    [Fact]
    public async Task ThePublishedDatesAreSpreadOut_SoTheFeedReadsLikeAnAccount()
    {
        await using var db = await SeededAsync();

        var published = await db.PetMemories
            .Select(moment => moment.PublishedAt!.Value)
            .OrderBy(value => value)
            .ToListAsync();

        // Rows written in the same second would stack into one timestamp in the
        // feed and look like an import, which is exactly what this account must
        // not look like.
        Assert.Equal(5, published.Distinct().Count());
        Assert.True(published[^1] - published[0] > TimeSpan.FromDays(7));

        // And the story dates stay historical, independent of when they were
        // shared. Conflating the two is the mistake the two columns exist to
        // prevent. Linko's story is 2022 and Linky's is 2025, so both must
        // survive alongside a publication window that is days old.
        var years = await db.PetMemories
            .Select(moment => moment.MomentDate!.Value.Year)
            .Distinct()
            .ToListAsync();

        Assert.Contains(2022, years);
        Assert.Contains(2025, years);
        Assert.All(published, at => Assert.True(at > DateTimeOffset.UtcNow.AddDays(-30)));
    }

    // ---- the promises about data ---------------------------------------------

    [Fact]
    public async Task NoMediaPointsAtProductionStorage()
    {
        await using var db = await SeededAsync();

        var media = await db.MediaFiles.ToListAsync();
        Assert.NotEmpty(media);

        foreach (var file in media)
        {
            Assert.StartsWith("http://localhost:5281/", file.ObjectKey, StringComparison.Ordinal);
            Assert.DoesNotContain("mypetlink.com.my", file.ObjectKey, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("r2.cloudflarestorage.com", file.ObjectKey, StringComparison.OrdinalIgnoreCase);

            // An absolute key is what keeps the configured Cloudflare base out
            // of the resolved URL; MediaUrlBuilder returns it unchanged.
            Assert.Equal(file.ObjectKey, file.StoragePath);
            Assert.Equal("", file.BucketName);
            Assert.True(file.IsPublic);
            Assert.Equal(MediaUploadStatus.Ready, file.UploadStatus);
        }
    }

    [Fact]
    public async Task TheOnlyContactDetailsAreUnreachableOnes()
    {
        await using var db = await SeededAsync();

        var owner = await db.Users.SingleAsync(user => user.Id == DemoOwnerId);
        Assert.Equal(DemoEmail, owner.Email);
        Assert.EndsWith(".local", owner.Email, StringComparison.OrdinalIgnoreCase);

        // An all-zero subscriber number cannot be allocated, so the Safety
        // Profile can show a Contact Owner action without putting anybody's
        // real line on camera.
        Assert.Equal("+601110000000", owner.WhatsappE164);
        Assert.Null(owner.PhoneE164);
    }

    [Fact]
    public async Task NoHealthInformationIsInvented()
    {
        // A fabricated medical condition on a page people read as ours is a lie
        // about a real product, not a harmless prop.
        await using var db = await SeededAsync();

        Assert.All(await db.Pets.ToListAsync(), pet =>
        {
            Assert.Equal("[]", pet.AllergiesJson);
            Assert.Null(pet.EmergencyNote);

            // A safety note is finder guidance about temperament, which is what
            // the field is for, and says nothing about the animal's health.
            Assert.False(string.IsNullOrWhiteSpace(pet.SafetyNote));
        });

        Assert.Empty(await db.CareRecords.ToListAsync());
    }

    // ---- the reserved handle -------------------------------------------------

    [Fact]
    public async Task TheBrandHandleIsHeld_AndItsReservationSurvives()
    {
        await using var db = await SeededAsync();

        var profile = await db.OwnerSocialProfiles.SingleAsync(item => item.UserId == DemoOwnerId);
        Assert.Equal("mypetlink", profile.NormalizedHandle);

        // Holding the name does not release it. The reservation has to outlive
        // whoever holds the handle — otherwise the day this profile gives it up,
        // the brand name falls into the public pool — so the seeder writes no
        // reservation row of its own and removes none.
        Assert.True(OwnerHandleRules.IsSystemReserved("mypetlink"));
        Assert.Empty(await db.OwnerHandleReservations.ToListAsync());
    }

    [Fact]
    public async Task TheAssignmentIsAudited_WithTheAdministratorAsActor()
    {
        await using var db = await SeededAsync();

        var entry = Assert.Single(await db.AuditLogs
            .Where(log => log.Action == "OwnerSocialReservedHandleAssigned")
            .ToListAsync());

        Assert.Equal(ActorType.Admin, entry.ActorType);
        Assert.NotNull(entry.ActorId);
        Assert.NotEqual(DemoOwnerId, entry.ActorId);
    }

    [Fact]
    public async Task TheSelfServicePathStillRefusesTheBrandHandle()
    {
        // The account holding @mypetlink must not make the name claimable by
        // anyone else. Assignment is a different door, not a loosened lock.
        await using var db = await SeededAsync();

        var handles = new OwnerHandleService(
            db,
            Options.Create(new SocialOptions()),
            new AuditLogService(db, new HttpContextAccessor()));

        Assert.False(await handles.IsClaimableAsync("mypetlink", Guid.NewGuid()));
    }

    // ---- idempotence ---------------------------------------------------------

    [Fact]
    public async Task RunningItTwiceChangesNothing()
    {
        await using var db = await SeededAsync();

        var before = await SnapshotAsync(db);
        Assert.False(await CreateSeeder(db).EnsureSeededAsync());
        var after = await SnapshotAsync(db);

        Assert.Equal(before, after);
    }

    private static async Task<string> SnapshotAsync(MyPetLinkDbContext db) =>
        string.Join(
            "|",
            await db.Users.CountAsync(),
            await db.Pets.CountAsync(),
            await db.PetMemories.CountAsync(),
            await db.MomentPets.CountAsync(),
            await db.MediaFiles.CountAsync(),
            await db.MediaFileLinks.CountAsync(),
            await db.OwnerSocialProfiles.CountAsync(),
            await db.AuditLogs.CountAsync());

    // ---- plumbing ------------------------------------------------------------

    private static MyPetLinkDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase($"marketing-demo-{Guid.NewGuid():N}")
            .Options);

    private static MarketingDemoSeeder CreateSeeder(
        MyPetLinkDbContext db,
        string environmentName = "Development",
        bool devAuthEnabled = true,
        bool marketingDemoEnabled = true) =>
        new(
            db,
            new FakeEnvironment(environmentName),
            new OwnerHandleService(
                db,
                Options.Create(new SocialOptions()),
                new AuditLogService(db, new HttpContextAccessor())),
            Options.Create(new DevAuthOptions
            {
                Enabled = devAuthEnabled,
                AdminEmail = "dev.admin@mypetlink.local",
                DisplayName = "MyPetLink Dev Admin",
            }),
            Options.Create(new MarketingDemoOptions { Enabled = marketingDemoEnabled }),
            NullLogger<MarketingDemoSeeder>.Instance);

    private static async Task<MyPetLinkDbContext> SeededAsync()
    {
        var db = CreateDb();
        await SeedPlanAndAdminAsync(db);
        Assert.True(await CreateSeeder(db).EnsureSeededAsync());
        return db;
    }

    private static async Task AddFreePlanAsync(MyPetLinkDbContext db)
    {
        db.Plans.Add(new Plan { Id = Guid.NewGuid(), Code = "Free", Name = "Free" });
        await db.SaveChangesAsync();
    }

    private static async Task SeedPlanAndAdminAsync(MyPetLinkDbContext db)
    {
        await AddFreePlanAsync(db);
        db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = "dev.admin@mypetlink.local",
            NormalizedEmail = "DEV.ADMIN@MYPETLINK.LOCAL",
            DisplayName = "MyPetLink Dev Admin",
            Status = UserStatus.Active,
        });
        await db.SaveChangesAsync();
    }

    private sealed class FakeEnvironment : IHostEnvironment
    {
        public FakeEnvironment(string environmentName) => EnvironmentName = environmentName;

        public string EnvironmentName { get; set; }

        public string ApplicationName { get; set; } = "MyPetLink.Api.Tests";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class NullFileProvider : IFileProvider
    {
        public IDirectoryContents GetDirectoryContents(string subpath) => NotFoundDirectoryContents.Singleton;

        public IFileInfo GetFileInfo(string subpath) => new NotFoundFileInfo(subpath);

        public IChangeToken Watch(string filter) => NullChangeToken.Singleton;
    }
}
