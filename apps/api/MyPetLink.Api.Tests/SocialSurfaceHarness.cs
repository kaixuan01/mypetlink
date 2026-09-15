using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// One seeded social world, shared by the feed and discovery tests.
///
/// They exercise the same households, pets and Moments from two directions —
/// the feed asks "who do I follow", Explore asks "who may a stranger meet" —
/// so seeding it twice would let the two drift apart and quietly stop testing
/// the same thing.
///
/// The cast:
///   Alice  @tanfamily   social, discoverable    pets: Mochi, Coco
///   Bob    @limfamily   social, discoverable    pet:  Buddy
///   Carol  @carolpets   social, NOT discoverable pet: Shy
///   Dave   @davepets    social OFF              pet:  Hidden
/// </summary>
internal sealed class SocialSurfaceHarness : IDisposable
{
    public static readonly Guid AliceId = Guid.Parse("c1111111-1111-1111-1111-111111111111");
    public static readonly Guid BobId = Guid.Parse("c2222222-2222-2222-2222-222222222222");
    public static readonly Guid CarolId = Guid.Parse("c3333333-3333-3333-3333-333333333333");
    public static readonly Guid DaveId = Guid.Parse("c4444444-4444-4444-4444-444444444444");

    public static readonly Guid MochiId = Guid.Parse("c5111111-1111-1111-1111-111111111111");
    public static readonly Guid CocoId = Guid.Parse("c5222222-2222-2222-2222-222222222222");
    public static readonly Guid BuddyId = Guid.Parse("c5333333-3333-3333-3333-333333333333");
    public static readonly Guid ShyId = Guid.Parse("c5444444-4444-4444-4444-444444444444");
    public static readonly Guid HiddenId = Guid.Parse("c5555555-5555-5555-5555-555555555555");

    private static readonly DateTimeOffset Origin =
        new(2026, 9, 1, 8, 0, 0, TimeSpan.Zero);

    private SocialSurfaceHarness(MyPetLinkDbContext db)
    {
        Db = db;
        var r2 = Options.Create(new CloudflareR2Options());
        var cards = new SocialMomentProjection(db, r2);

        Feed = new SocialFeedService(db, cards);
        Discovery = new SocialDiscoveryService(db, r2, cards);
        Graph = new SocialGraphService(db, r2);
        Likes = new MomentLikeService(db);
    }

    public MyPetLinkDbContext Db { get; }

    public SocialFeedService Feed { get; }

    public SocialDiscoveryService Discovery { get; }

    public SocialGraphService Graph { get; }

    public MomentLikeService Likes { get; }

    public static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        var db = new MyPetLinkDbContext(options);

        AddOwner(db, AliceId, "alice@example.com", "Alice Tan", "TanFamily", "The Tan Family",
            social: true, discoverable: true);
        AddOwner(db, BobId, "bob@example.com", "Bob Lim", "LimFamily", "The Lim Family",
            social: true, discoverable: true);
        AddOwner(db, CarolId, "carol@example.com", "Carol Ng", "CarolPets", "Carol's Pets",
            social: true, discoverable: false);
        AddOwner(db, DaveId, "dave@example.com", "Dave Rao", "DavePets", "Dave's Pets",
            social: false, discoverable: false);
        await db.SaveChangesAsync();

        AddPet(db, MochiId, AliceId, "Mochi", "Cat", social: true, discoverable: true);
        AddPet(db, CocoId, AliceId, "Coco", "Cat", social: true, discoverable: true);
        AddPet(db, BuddyId, BobId, "Buddy", "Dog", social: true, discoverable: true);
        AddPet(db, ShyId, CarolId, "Shy", "Rabbit", social: true, discoverable: false);
        AddPet(db, HiddenId, DaveId, "Hidden", "Dog", social: true, discoverable: true);
        await db.SaveChangesAsync();

        return new SocialSurfaceHarness(db);
    }

    /// <summary>
    /// Adds a Moment and its subject rows. <paramref name="minutes"/> orders the
    /// timeline: higher is newer.
    /// </summary>
    public async Task<Guid> AddMomentAsync(
        Guid authorId,
        Guid primaryPetId,
        string title,
        int minutes,
        MemoryVisibility visibility = MemoryVisibility.Public,
        Guid[]? alsoAbout = null,
        bool published = true,
        bool archived = false)
    {
        var moment = new PetMemory
        {
            Id = Guid.NewGuid(),
            PetId = primaryPetId,
            AuthorUserId = authorId,
            Title = title,
            Type = "Memory",
            Visibility = visibility,
            PublishedAt = published ? Origin.AddMinutes(minutes) : null,
            ArchivedAt = archived ? Origin.AddMinutes(minutes) : null
        };

        Db.PetMemories.Add(moment);
        Db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = primaryPetId });

        foreach (var petId in alsoAbout ?? Array.Empty<Guid>())
        {
            Db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = petId });
        }

        await Db.SaveChangesAsync();
        return moment.Id;
    }

    public async Task FollowAsync(Guid followerId, string handle)
    {
        await Graph.FollowAsync(followerId, handle);
    }

    public async Task SetOwnerDiscoverableAsync(Guid userId, bool discoverable)
    {
        var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
        profile.IsDiscoverable = discoverable;
        await Db.SaveChangesAsync();
    }

    public async Task SetOwnerSocialAsync(Guid userId, bool enabled)
    {
        var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
        profile.IsSocialEnabled = enabled;
        await Db.SaveChangesAsync();
    }

    public async Task SetPetDiscoverableAsync(Guid petId, bool discoverable)
    {
        var profile = await Db.PetSocialProfiles.SingleAsync(item => item.PetId == petId);
        profile.IsDiscoverable = discoverable;
        await Db.SaveChangesAsync();
    }

    public async Task SetPetSocialAsync(Guid petId, bool enabled)
    {
        var profile = await Db.PetSocialProfiles.SingleAsync(item => item.PetId == petId);
        profile.IsSocialEnabled = enabled;
        await Db.SaveChangesAsync();
    }

    private static void AddOwner(
        MyPetLinkDbContext db,
        Guid id,
        string email,
        string accountName,
        string handle,
        string displayName,
        bool social,
        bool discoverable)
    {
        db.Users.Add(new User
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = accountName,
            PhoneE164 = "+60123456789",
            WhatsappE164 = "+60123456789",
            Status = UserStatus.Active,
            OwnerProfile = new OwnerProfile
            {
                UserId = id,
                OwnerDisplayName = accountName,
                Plan = new Plan
                {
                    Code = $"Free-{id:N}",
                    Name = "Free",
                    PriceLabel = "RM0",
                    Limit = new PlanLimit
                    {
                        MaxPets = 5,
                        MaxPrivateMemoriesPerPet = 10,
                        MaxMediaPerMemory = 5,
                        MaxFamilyMembers = 1,
                        MaxCareRecords = 100,
                        ScanHistoryDays = 0
                    }
                }
            },
            SocialProfile = new OwnerSocialProfile
            {
                UserId = id,
                Handle = handle,
                NormalizedHandle = handle.ToLowerInvariant(),
                DisplayName = displayName,
                NormalizedDisplayName = displayName.ToLowerInvariant(),
                GeneralArea = "Petaling Jaya",
                IsSocialEnabled = social,
                IsDiscoverable = discoverable,
                AllowFollowers = true
            }
        });
    }

    private static void AddPet(
        MyPetLinkDbContext db,
        Guid id,
        Guid ownerId,
        string name,
        string species,
        bool social,
        bool discoverable)
    {
        var code = $"pub{name.ToLowerInvariant()}";

        db.Pets.Add(new Pet
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{code}",
            Name = name,
            Species = species,
            // Explore prefers a pet with a photo; the media row itself is not
            // needed for these tests, only the reference that says one exists.
            ProfileMediaFileId = null,
            PublicProfile = new PetPublicProfile
            {
                PetId = id,
                PublicCode = code,
                SlugSnapshot = $"{name.ToLowerInvariant()}-{code}",
                IsPublicProfileEnabled = true,
                ShowMoments = true
            },
            SocialProfile = new PetSocialProfile
            {
                PetId = id,
                IsSocialEnabled = social,
                IsDiscoverable = discoverable
            },
            SafetySetting = new PetSafetySetting
            {
                PetId = id,
                SafetyCode = $"s-{code}",
                QrSafetyEnabled = true,
                ShowWhatsapp = true
            },
            Contact = new PetContact { PetId = id, UseOwnerDefaults = true }
        });
    }

    public void Dispose()
    {
        Db.Dispose();
    }
}
