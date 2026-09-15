using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IDevelopmentSocialSeeder
{
    Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// A realistic social world for local work, and only for local work.
///
/// Social was built surface by surface against fixtures, which is how it
/// reached soft-launch review without anybody having walked it end to end with
/// content in it. Fixtures do not show you a handle that wraps, a feed of three
/// identical households, or an Explore shelf that is empty because every pet
/// belongs to the same person. This seeds the households, pets, Moments, likes,
/// follows, blocks and activity needed to see those things.
///
/// <b>It cannot run anywhere but a developer's machine.</b> Gated on
/// <c>IsDevelopment()</c> AND the explicit <c>DevAuth</c> opt-in, exactly like
/// the development administrator seeder beside it, and every account it creates
/// is a <c>.local</c> address that can never receive mail. It is idempotent:
/// a second run finds its marker household and does nothing.
/// </summary>
public sealed class DevelopmentSocialSeeder : IDevelopmentSocialSeeder
{
    private const string FreePlanCode = "Free";
    private const string MarkerEmail = "social.a@mypetlink.local";

    // Fixed ids so a re-seeded database keeps the same links, and so a
    // walkthrough script can name a pet without looking it up.
    private static readonly Guid OwnerA = Guid.Parse("50c1a100-0000-4000-8000-00000000000a");
    private static readonly Guid OwnerB = Guid.Parse("50c1a100-0000-4000-8000-00000000000b");
    private static readonly Guid OwnerC = Guid.Parse("50c1a100-0000-4000-8000-00000000000c");
    private static readonly Guid OwnerD = Guid.Parse("50c1a100-0000-4000-8000-00000000000d");
    private static readonly Guid OwnerE = Guid.Parse("50c1a100-0000-4000-8000-00000000000e");

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IHostEnvironment _environment;
    private readonly DevAuthOptions _options;

    public DevelopmentSocialSeeder(
        MyPetLinkDbContext dbContext,
        IHostEnvironment environment,
        IOptions<DevAuthOptions> options)
    {
        _dbContext = dbContext;
        _environment = environment;
        _options = options.Value;
    }

    public async Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default)
    {
        if (!_environment.IsDevelopment() || !_options.Enabled)
        {
            return false;
        }

        var alreadySeeded = await _dbContext.Users
            .AnyAsync(user => user.NormalizedEmail == MarkerEmail.ToUpperInvariant(), cancellationToken);

        if (alreadySeeded)
        {
            return false;
        }

        var plan = await _dbContext.Plans.SingleOrDefaultAsync(
            item => item.Code == FreePlanCode && item.ArchivedAt == null,
            cancellationToken);

        if (plan is null)
        {
            // Same posture as the admin seeder: a missing default plan is a
            // schema problem to fix, not something to invent around.
            return false;
        }

        var now = DateTimeOffset.UtcNow;

        // A: the account a developer signs in as. Three pets, a mixed feed.
        AddOwner(plan.Id, OwnerA, "social.a", "Aisyah Rahman", "rahmanpets",
            "The Rahman Pets", discoverable: true, social: true,
            bio: "Two cats, one dog, and a sofa that has seen things.");

        // B: the multi-pet case, with one pet deliberately hidden from Explore.
        AddOwner(plan.Id, OwnerB, "social.b", "Brandon Teoh", "teohfamily",
            "The Teoh Family", discoverable: true, social: true,
            bio: "Weekend hikes and very muddy paws.");

        // C: social but NOT discoverable — reachable by link and to followers,
        // refused to Explore and search.
        AddOwner(plan.Id, OwnerC, "social.c", "Chandra Menon", "quietpaws",
            "Quiet Paws", discoverable: false, social: true,
            bio: "Sharing quietly.");

        // D: the blocked relationship with A.
        AddOwner(plan.Id, OwnerD, "social.d", "Danish Omar", "omarhousehold",
            "The Omar Household", discoverable: true, social: true, bio: null);

        // E: social switched off entirely.
        AddOwner(plan.Id, OwnerE, "social.e", "Evelyn Ng", "nghome",
            "Ng Home", discoverable: false, social: false, bio: null);

        await _dbContext.SaveChangesAsync(cancellationToken);

        var mochi = AddPet(OwnerA, "Mochi", "Cat", "British Shorthair", social: true, discoverable: true);
        var cocoa = AddPet(OwnerA, "Cocoa", "Dog", "Golden Retriever", social: true, discoverable: true, withSmartTag: true);
        var pepper = AddPet(OwnerA, "Pepper", "Rabbit", "Netherland Dwarf", social: true, discoverable: true);

        var biscuit = AddPet(OwnerB, "Biscuit", "Dog", "Shih Tzu", social: true, discoverable: true, lost: true);
        // Socially enabled but hidden from discovery: the multi-pet privacy case.
        var shadow = AddPet(OwnerB, "Shadow", "Cat", "Domestic Shorthair", social: true, discoverable: false);

        var willow = AddPet(OwnerC, "Willow", "Bird", "Cockatiel", social: true, discoverable: true);
        var rocky = AddPet(OwnerD, "Rocky", "Dog", "Beagle", social: true, discoverable: true);
        var olive = AddPet(OwnerE, "Olive", "Cat", "Persian", social: true, discoverable: true);

        // An archived pet, to prove it stays out of every social surface.
        var archived = AddPet(OwnerA, "Snowy", "Cat", "Ragdoll", social: true, discoverable: true);
        archived.LifecycleStatus = PetLifecycleStatus.Archived;

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Moments: old and new, one pet and several, long caption and none,
        // public and private.
        var beachDay = AddMoment(OwnerA, mochi, "Beach day", now.AddDays(-1),
            caption: "First time on sand. Reviews were mixed.",
            alsoAbout: new[] { cocoa });
        AddMoment(OwnerA, cocoa, "Very long walk", now.AddHours(-5), caption: LongCaption);
        AddMoment(OwnerA, pepper, "Salad for one", now.AddDays(-12), caption: null);
        AddMoment(OwnerA, mochi, "Vet visit", now.AddDays(-3),
            caption: "Private note to self.", visibility: MemoryVisibility.Private);

        var muddy = AddMoment(OwnerB, biscuit, "Muddy again", now.AddHours(-2),
            caption: "Straight into the bath.", alsoAbout: new[] { shadow });
        AddMoment(OwnerB, biscuit, "Sunday nap", now.AddDays(-20), caption: "Zzz.");

        var quiet = AddMoment(OwnerC, willow, "Morning song", now.AddHours(-9),
            caption: "Every single morning at six.");
        AddMoment(OwnerD, rocky, "Park sprint", now.AddHours(-30), caption: null);
        AddMoment(OwnerE, olive, "Not shared socially", now.AddDays(-2), caption: null);

        await _dbContext.SaveChangesAsync(cancellationToken);

        // The graph: A follows B and C; B and D follow A.
        Follow(OwnerA, OwnerB);
        Follow(OwnerA, OwnerC);
        Follow(OwnerB, OwnerA);
        Follow(OwnerD, OwnerA);

        // A and D have blocked each other's way; blocking removes follows, so
        // this is written after the follows above deliberately.
        _dbContext.OwnerBlocks.Add(new OwnerBlock
        {
            BlockerUserId = OwnerA,
            BlockedUserId = OwnerD,
            Reason = "Local walkthrough: blocked relationship."
        });
        _dbContext.OwnerFollows.RemoveRange(
            _dbContext.OwnerFollows.Local.Where(follow =>
                (follow.FollowerUserId == OwnerA && follow.FollowedUserId == OwnerD)
                || (follow.FollowerUserId == OwnerD && follow.FollowedUserId == OwnerA)));

        Like(OwnerB, beachDay);
        Like(OwnerC, beachDay);
        Like(OwnerA, muddy);

        await _dbContext.SaveChangesAsync(cancellationToken);

        // Activity for A: unread and read, follower and like, plus two that
        // must NOT render — a blocked actor and one who has left social.
        Notify(OwnerA, OwnerB, OwnerNotificationType.NewFollower, now.AddMinutes(-20));
        Notify(OwnerA, OwnerB, OwnerNotificationType.MomentLiked, now.AddMinutes(-18),
            momentId: beachDay.Id, subjectPetId: mochi.Id);
        Notify(OwnerA, OwnerC, OwnerNotificationType.MomentLiked, now.AddHours(-26),
            momentId: beachDay.Id, subjectPetId: mochi.Id, readAt: now.AddHours(-25));
        Notify(OwnerA, OwnerD, OwnerNotificationType.NewFollower, now.AddDays(-2));
        Notify(OwnerA, OwnerE, OwnerNotificationType.NewFollower, now.AddDays(-4));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private const string LongCaption =
        "We meant to go around the block and somehow ended up doing the whole "
        + "park loop twice, then the long way home past the shops, where she "
        + "insisted on greeting every single person waiting at the bus stop. "
        + "Four kilometres later she fell asleep in the doorway before I could "
        + "get her paws wiped, and stayed there until dinner.";

    private void AddOwner(
        Guid planId,
        Guid id,
        string localPart,
        string accountName,
        string handle,
        string displayName,
        bool discoverable,
        bool social,
        string? bio)
    {
        var email = $"{localPart}@mypetlink.local";

        _dbContext.Users.Add(new User
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            // The ACCOUNT name, which no social surface may ever show.
            DisplayName = accountName,
            PhoneE164 = "+60123456789",
            WhatsappE164 = "+60123456789",
            Status = UserStatus.Active,
            OwnerProfile = new OwnerProfile
            {
                UserId = id,
                OwnerDisplayName = accountName,
                PlanId = planId
            },
            SocialProfile = new OwnerSocialProfile
            {
                UserId = id,
                Handle = handle,
                NormalizedHandle = handle.ToLowerInvariant(),
                DisplayName = displayName,
                NormalizedDisplayName = displayName.ToLowerInvariant(),
                Bio = bio,
                GeneralArea = "Petaling Jaya",
                IsSocialEnabled = social,
                IsDiscoverable = discoverable,
                AllowFollowers = true
            }
        });
    }

    private Pet AddPet(
        Guid ownerId,
        string name,
        string species,
        string breed,
        bool social,
        bool discoverable,
        bool lost = false,
        bool withSmartTag = false)
    {
        var id = Guid.NewGuid();
        var code = $"dev{name.ToLowerInvariant()}";

        var pet = new Pet
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{code}",
            Name = name,
            Species = species,
            Breed = breed,
            LostModeEnabled = lost,
            LostLastSeenArea = lost ? "Near SS2 market" : null,
            LostMessage = lost ? "Very friendly, answers to his name." : null,
            PublicProfile = new PetPublicProfile
            {
                PetId = id,
                PublicCode = code,
                SlugSnapshot = $"{name.ToLowerInvariant()}-{code}",
                IsPublicProfileEnabled = true,
                ShowMoments = true,
                ShowTimeline = true,
                ShowOwnerName = true
            },
            SocialProfile = new PetSocialProfile
            {
                PetId = id,
                IsSocialEnabled = social,
                IsDiscoverable = discoverable,

                // The same stamp the owner-facing settings route writes. A
                // seeder that set the switches without it would build a world
                // where every pet is silently invisible, which is exactly the
                // kind of divergence between seeded and real state that let the
                // missing owner path go unnoticed in the first place.
                ConsentedByUserId = social ? ownerId : null
            },
            SafetySetting = new PetSafetySetting
            {
                PetId = id,
                SafetyCode = $"s-{code}",
                QrSafetyEnabled = true,
                ShowWhatsapp = true,
                ShowPhone = true
            },
            Contact = new PetContact { PetId = id, UseOwnerDefaults = true }
        };

        _dbContext.Pets.Add(pet);

        if (withSmartTag)
        {
            // A pet that reads as Smart Tag protected on its social card.
            pet.SafetySetting.ShowEmergencyNote = true;
        }

        return pet;
    }

    private PetMemory AddMoment(
        Guid authorId,
        Pet primary,
        string title,
        DateTimeOffset publishedAt,
        string? caption,
        MemoryVisibility visibility = MemoryVisibility.Public,
        Pet[]? alsoAbout = null)
    {
        var moment = new PetMemory
        {
            Id = Guid.NewGuid(),
            PetId = primary.Id,
            AuthorUserId = authorId,
            Title = title,
            Caption = caption,
            Type = "Memory",
            Visibility = visibility,
            MomentDate = DateOnly.FromDateTime(publishedAt.UtcDateTime),
            PublishedAt = visibility == MemoryVisibility.Public ? publishedAt : null,
            ShowInLifeTimeline = true
        };

        _dbContext.PetMemories.Add(moment);
        _dbContext.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = primary.Id });

        foreach (var pet in alsoAbout ?? Array.Empty<Pet>())
        {
            _dbContext.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = pet.Id });
        }

        return moment;
    }

    private void Follow(Guid followerId, Guid followedId)
    {
        _dbContext.OwnerFollows.Add(new OwnerFollow
        {
            FollowerUserId = followerId,
            FollowedUserId = followedId
        });
    }

    private void Like(Guid userId, PetMemory moment)
    {
        _dbContext.MomentLikes.Add(new MomentLike
        {
            MomentId = moment.Id,
            UserId = userId
        });
    }

    private void Notify(
        Guid recipientId,
        Guid actorId,
        OwnerNotificationType type,
        DateTimeOffset createdAt,
        Guid? momentId = null,
        Guid? subjectPetId = null,
        DateTimeOffset? readAt = null)
    {
        _dbContext.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = recipientId,
            ActorUserId = actorId,
            Type = type,
            MomentId = momentId,
            SubjectPetId = subjectPetId,
            CreatedAt = createdAt,
            ReadAt = readAt
        });
    }
}
