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
        PublicProfiles = new PublicSocialProfileService(db, r2, cards);

        // The two surfaces that must stay independent of Social while sharing
        // its seeded world: a pet's Share Profile and its Safety Profile. They
        // live here rather than in a second harness precisely so a test can
        // assert "Community off, both still work" against the same rows.
        PetShareProfiles = new PublicProfileService(db, r2);
        QrSafety = new QrSafetyService(db, r2);
        Notifications = new OwnerNotificationService(db, r2);
        Graph = new SocialGraphService(db, r2, Notifications);
        Likes = new MomentLikeService(db, Notifications);
        Comments = new MomentCommentService(db, Notifications, r2);
        Collaborations = new MomentCollaborationService(db, Notifications, r2);
        PetSettings = new PetSocialSettingsService(
            db,
            r2,
            new AuditLogService(db, new Microsoft.AspNetCore.Http.HttpContextAccessor()));
    }

    public MyPetLinkDbContext Db { get; }

    public SocialFeedService Feed { get; }

    public SocialDiscoveryService Discovery { get; }

    public PublicSocialProfileService PublicProfiles { get; }

    /// <summary>A pet's Share Profile at <c>/p/{slug}-{publicCode}</c>.</summary>
    public PublicProfileService PetShareProfiles { get; }

    /// <summary>A pet's Safety Profile at <c>/q/{safetyCode}</c>.</summary>
    public QrSafetyService QrSafety { get; }

    public SocialGraphService Graph { get; }

    public MomentLikeService Likes { get; }

    public MomentCommentService Comments { get; }

    public MomentCollaborationService Collaborations { get; }

    public OwnerNotificationService Notifications { get; }

    /// <summary>
    /// The real owner-facing consent path. Tests that need a pet in or out of
    /// Social should go through this rather than writing the switches, so the
    /// route an actual owner uses is the one under test.
    /// </summary>
    public PetSocialSettingsService PetSettings { get; }

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
    /// Adds another social, discoverable-by-default household with one pet,
    /// for tests that need more households than the standing cast.
    /// </summary>
    public async Task AddHouseholdAsync(
        Guid userId,
        string handle,
        string displayName,
        Guid petId,
        string petName,
        bool discoverable = true)
    {
        AddOwner(Db, userId, $"{handle.ToLowerInvariant()}@example.com", displayName, handle, displayName,
            social: true, discoverable: discoverable);
        await Db.SaveChangesAsync();
        AddPet(Db, petId, userId, petName, "Cat", social: true, discoverable: discoverable);
        await Db.SaveChangesAsync();
    }

    /// <summary>Adds another pet to an existing household.</summary>
    public async Task AddPetAsync(Guid ownerId, Guid petId, string petName, bool social = true)
    {
        AddPet(Db, petId, ownerId, petName, "Dog", social: social, discoverable: true);
        await Db.SaveChangesAsync();
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

    /// <summary>
    /// Attaches one media item to a Moment, the way an upload followed by a save
    /// leaves it in the database.
    ///
    /// <paramref name="thumbnailObjectKey"/> exists so a test can seed the state
    /// that must never be served to a video: an image derivative sitting beside
    /// a video row. Nothing writes that combination today, which is exactly why
    /// a projection that merely happened to fall through to the original was
    /// worth pinning down.
    /// </summary>
    public async Task<Guid> AddMomentMediaAsync(
        Guid momentId,
        Guid petId,
        MediaFileType mediaType,
        string objectKey,
        int sortOrder = 0,
        string? thumbnailObjectKey = null,
        string? altText = null,
        string contentType = "image/jpeg")
    {
        var media = new MediaFile
        {
            Id = Guid.NewGuid(),
            PetId = petId,
            OriginalFileName = objectKey.Split('/')[^1],
            StorageFileName = objectKey.Split('/')[^1],
            ContentType = contentType,
            FileSize = 1024,
            ObjectKey = objectKey,
            ThumbnailObjectKey = thumbnailObjectKey,
            DerivativeStatus = thumbnailObjectKey is null
                ? MediaDerivativeStatus.NotApplicable
                : MediaDerivativeStatus.Ready,
            MediaType = mediaType,
            Category = mediaType == MediaFileType.Video
                ? MediaUploadCategory.MomentVideo
                : MediaUploadCategory.MomentImage,
            IsPublic = true,
            UploadStatus = MediaUploadStatus.Ready
        };

        Db.MediaFiles.Add(media);
        Db.MediaFileLinks.Add(new MediaFileLink
        {
            MediaFileId = media.Id,
            OwnerType = MediaOwnerType.PetMemory,
            OwnerId = momentId,
            SortOrder = sortOrder,
            AltText = altText
        });

        await Db.SaveChangesAsync();
        return media.Id;
    }

    public async Task FollowAsync(Guid followerId, string handle)
    {
        await Graph.FollowAsync(followerId, handle);
    }

    /// <summary>
    /// Whether this pet's Share Profile is switched on — the owner's own
    /// "I will share this link" choice, and nothing to do with Community.
    /// </summary>
    public async Task SetShareProfileEnabledAsync(Guid petId, bool enabled)
    {
        var profile = await Db.PetPublicProfiles.SingleAsync(item => item.PetId == petId);
        profile.IsPublicProfileEnabled = enabled;
        await Db.SaveChangesAsync();
    }

    /// <summary>Whether an owner name may appear on this pet's public surfaces.</summary>
    public async Task SetShowOwnerNameAsync(Guid petId, bool show)
    {
        var profile = await Db.PetPublicProfiles.SingleAsync(item => item.PetId == petId);
        profile.ShowOwnerName = show;
        await Db.SaveChangesAsync();
    }

    public async Task SetPetLifecycleAsync(Guid petId, PetLifecycleStatus status)
    {
        var pet = await Db.Pets.SingleAsync(item => item.Id == petId);
        pet.LifecycleStatus = status;
        await Db.SaveChangesAsync();
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

    /// <summary>
    /// Moves a pet's discoverability the way its owner would.
    ///
    /// Routed through the real service rather than writing the column, so that
    /// a test arranging a pet into Social is exercising the path a person uses.
    /// Setting these switches directly is how a missing owner-facing route went
    /// unnoticed through an entire phase.
    /// </summary>
    public async Task SetPetDiscoverableAsync(Guid petId, bool discoverable)
    {
        await UpdatePetSocialAsync(petId, null, discoverable);
    }

    /// <summary>Moves a pet in or out of Social the way its owner would.</summary>
    public async Task SetPetSocialAsync(Guid petId, bool enabled)
    {
        await UpdatePetSocialAsync(petId, enabled, null);
    }

    private async Task UpdatePetSocialAsync(Guid petId, bool? social, bool? discoverable)
    {
        var ownerId = await Db.Pets
            .AsNoTracking()
            .Where(pet => pet.Id == petId)
            .Select(pet => pet.OwnerUserId)
            .SingleAsync();

        await PetSettings.UpdateAsync(
            ownerId,
            petId,
            new DTOs.UpdatePetSocialSettingsRequest(social, discoverable, null));
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
                IsDiscoverable = discoverable,

                // Mirrors what the owner-facing settings route stamps. Without
                // it a seeded pet is socially invisible, because consent is
                // only consent while it still belongs to the current owner.
                ConsentedByUserId = social ? ownerId : null
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
