using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IMarketingDemoSeeder
{
    Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// The official-looking MyPetLink account used to film launch material.
///
/// Screen recordings are the one place where a fixture is seen by the public.
/// A household called "Test Owner 3" with a grey placeholder cat is unusable in
/// a Reel, so this builds the brand's own profile — the MyPetLink mark as the
/// avatar, both official mascots as its pets, and five Moments written in the
/// voice of the IP board — and does it as ordinary data, so every page on camera
/// is the product behaving normally rather than a mock.
///
/// The two mascots come from the official IP board and are never merged or
/// swapped: <b>Linko</b> is the orange tabby cat, The Curious Connector, and
/// <b>Linky</b> is the black-and-white kampung dog, The Loyal Guardian. Their
/// personalities here are the board's own words.
///
/// Distinct from <see cref="DevelopmentSocialSeeder"/> on purpose. That one
/// builds a messy, realistic world for walking the product: blocked accounts,
/// private Moments, an archived pet. This one builds a single polished identity
/// and nothing else, because anything extra would eventually appear in a frame.
///
/// <b>It cannot run anywhere but a developer's machine.</b> Three switches must
/// agree — <c>IsDevelopment()</c>, the <c>DevAuth</c> opt-in and
/// <c>MarketingDemo:Enabled</c> — and <see cref="MarketingDemoOptions"/> refuses
/// to start a non-Development host that asks for it. The account is a
/// <c>.local</c> address that can never receive mail, and the one phone number
/// on it is a synthetic all-zero value that belongs to nobody.
///
/// It is idempotent: a second run finds its marker account and does nothing.
/// </summary>
public sealed class MarketingDemoSeeder : IMarketingDemoSeeder
{
    private const string FreePlanCode = "Free";
    private const string MarkerEmail = "marketing.demo@mypetlink.local";

    /// <summary>
    /// The reserved brand handle. Not claimable through the owner's own screen —
    /// <c>OwnerHandleRules</c> reserves it precisely so nobody can present
    /// themselves as us — so it is assigned through
    /// <see cref="IOwnerHandleService.AssignReservedHandleAsync"/>, the audited
    /// administrator door that exists for exactly this account. Nothing here
    /// weakens or side-steps the reservation: the System reservation row stays
    /// in place, and the self-service path still refuses the name.
    /// </summary>
    private const string BrandHandle = "mypetlink";

    /// <summary>
    /// Synthetic, and deliberately unmistakable as such.
    ///
    /// The Safety Profile is the page a finder sees, so it has to show a Contact
    /// Owner action or the recording demonstrates nothing. A realistic-looking
    /// Malaysian mobile number would be somebody's real line, so this is an
    /// all-zero subscriber number that cannot be allocated. The capture script
    /// allowlists this exact value and still fails on any other phone-like text.
    /// </summary>
    private const string DemoWhatsapp = "+601110000000";

    // Fixed ids so a re-seeded database keeps the same links, and so the capture
    // script can address the profile without looking anything up.
    private static readonly Guid DemoOwnerId = Guid.Parse("b4a4de70-0000-4000-8000-000000000001");
    private static readonly Guid LinkoPetId = Guid.Parse("b4a4de70-0000-4000-8000-000000000002");
    private static readonly Guid LinkyPetId = Guid.Parse("b4a4de70-0000-4000-8000-000000000003");
    private static readonly Guid AvatarMediaId = Guid.Parse("b4a4de70-0000-4000-8000-000000000010");
    private static readonly Guid LinkoProfileMediaId = Guid.Parse("b4a4de70-0000-4000-8000-000000000011");
    private static readonly Guid LinkoCoverMediaId = Guid.Parse("b4a4de70-0000-4000-8000-000000000012");
    private static readonly Guid LinkyProfileMediaId = Guid.Parse("b4a4de70-0000-4000-8000-000000000013");
    private static readonly Guid LinkyCoverMediaId = Guid.Parse("b4a4de70-0000-4000-8000-000000000014");

    /// <summary>
    /// The mascots' public codes.
    ///
    /// Stable so the routes stay the same between re-seeds — a capture config, a
    /// QR code printed for a shoot and a link pasted into an edit all keep
    /// working. They are demo codes on a local host and address nothing real.
    /// </summary>
    public const string LinkoPublicCode = "linkodemo";
    public const string LinkoSafetyCode = "linkodemo";
    public const string LinkoSlug = "linko-linkodemo";
    public const string LinkyPublicCode = "linkydemo";
    public const string LinkySafetyCode = "linkydemo";
    public const string LinkySlug = "linky-linkydemo";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IHostEnvironment _environment;
    private readonly IOwnerHandleService _ownerHandleService;
    private readonly DevAuthOptions _devAuthOptions;
    private readonly MarketingDemoOptions _options;
    private readonly ILogger<MarketingDemoSeeder> _logger;

    public MarketingDemoSeeder(
        MyPetLinkDbContext dbContext,
        IHostEnvironment environment,
        IOwnerHandleService ownerHandleService,
        IOptions<DevAuthOptions> devAuthOptions,
        IOptions<MarketingDemoOptions> options,
        ILogger<MarketingDemoSeeder> logger)
    {
        _dbContext = dbContext;
        _environment = environment;
        _ownerHandleService = ownerHandleService;
        _devAuthOptions = devAuthOptions.Value;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default)
    {
        if (!_environment.IsDevelopment() || !_devAuthOptions.Enabled || !_options.Enabled)
        {
            return false;
        }

        MarketingDemoOptions.ValidateForStartup(_environment, _options);

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
            // Same posture as the seeders beside it: a missing default plan is a
            // schema problem to fix, not something to invent around.
            _logger.LogWarning(
                "Marketing demo profile was not seeded: no active '{PlanCode}' plan exists.",
                FreePlanCode);
            return false;
        }

        // The reserved handle is assigned on an administrator's authority, so
        // there has to be an administrator to attribute it to. The Development
        // administrator seeder runs first; if it produced nothing, stop rather
        // than reaching around the audited path.
        var adminIdentity = _devAuthOptions.GetIdentity();
        var adminUserId = await _dbContext.Users
            .Where(user => user.NormalizedEmail == adminIdentity.NormalizedEmail)
            .Select(user => (Guid?)user.Id)
            .SingleOrDefaultAsync(cancellationToken);

        if (adminUserId is null)
        {
            _logger.LogWarning(
                "Marketing demo profile was not seeded: the Development administrator account does not exist yet.");
            return false;
        }

        var now = DateTimeOffset.UtcNow;

        // Written in phases because the pictures and the things they illustrate
        // point at each other: a pet names its profile photo and that photo names
        // its pet, and the same is true of the account and its avatar. Inserted
        // in one batch, EF has no order that satisfies both foreign keys and
        // fails with a circular dependency. So the rows go in first with the
        // picture columns empty, and the pictures are attached afterwards.
        var socialProfile = AddOwner(plan.Id);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var linko = AddLinko();
        var linky = AddLinky();
        await _dbContext.SaveChangesAsync(cancellationToken);

        socialProfile.AvatarMediaFileId = AvatarMediaId;
        linko.ProfileMediaFileId = LinkoProfileMediaId;
        linko.CoverMediaFileId = LinkoCoverMediaId;
        linky.ProfileMediaFileId = LinkyProfileMediaId;
        linky.CoverMediaFileId = LinkyCoverMediaId;
        await _dbContext.SaveChangesAsync(cancellationToken);

        // The handle goes on through the administrator door, once the social
        // profile row it attaches to exists.
        await _ownerHandleService.AssignReservedHandleAsync(
            adminUserId.Value,
            DemoOwnerId,
            BrandHandle,
            confirmReassign: false,
            cancellationToken);

        AddMoments(now);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Seeded the marketing demo profile: @{Handle} with mascots {Pets}.",
            BrandHandle,
            "Linko and Linky");

        return true;
    }

    private OwnerSocialProfile AddOwner(Guid planId)
    {
        var user = new User
        {
            Id = DemoOwnerId,
            Email = MarkerEmail,
            NormalizedEmail = MarkerEmail.ToUpperInvariant(),

            // The ACCOUNT name, which no social surface may ever show. Kept
            // plainly internal so that if it ever did leak into a frame, the
            // mistake would be obvious on the tape rather than invisible.
            DisplayName = "MyPetLink Marketing Demo",
            WhatsappE164 = DemoWhatsapp,
            Status = UserStatus.Active,
            OwnerProfile = new OwnerProfile
            {
                UserId = DemoOwnerId,
                PlanId = planId,

                // The FINDER-facing name, shown on the Safety Profile when the
                // owner allows it. "MyPetLink" is the right answer here: a
                // finder who scans the mascot's tag is genuinely reaching us.
                OwnerDisplayName = "MyPetLink",
                DefaultGeneralArea = "Kuala Lumpur"
            },
            SocialProfile = new OwnerSocialProfile
            {
                UserId = DemoOwnerId,

                // Handle deliberately left null here. It is a reserved name, and
                // the only thing allowed to write it is the audited assignment
                // path called after this row is saved.
                DisplayName = "MyPetLink",
                NormalizedDisplayName = "mypetlink",
                Bio = "Helping pets stay identifiable, safer and connected. 🐾",
                GeneralArea = "Kuala Lumpur",
                IsSocialEnabled = true,
                IsDiscoverable = true,
                AllowFollowers = true
            }
        };

        _dbContext.Users.Add(user);

        _dbContext.MediaFiles.Add(BuildMedia(
            AvatarMediaId,
            petId: null,
            "mypetlink-logo.png",
            "image/png",
            MediaUploadCategory.OwnerAvatar,
            width: 512,
            height: 512));

        return user.SocialProfile!;
    }

    private Pet AddLinko()
    {
        _dbContext.MediaFiles.Add(BuildMedia(
            LinkoProfileMediaId, LinkoPetId, "linko-profile.jpg",
            "image/jpeg", MediaUploadCategory.PetProfilePhoto, width: 900, height: 1029));

        _dbContext.MediaFiles.Add(BuildMedia(
            LinkoCoverMediaId, LinkoPetId, "linko-cover.jpg",
            "image/jpeg", MediaUploadCategory.PetCoverPhoto, width: 1122, height: 1402));

        return AddMascot(
            LinkoPetId,
            name: "Linko",
            species: "Cat",
            breed: "Domestic Shorthair",
            gender: "Female",
            colour: "Orange tabby",
            publicCode: LinkoPublicCode,
            safetyCode: LinkoSafetyCode,
            slug: LinkoSlug,

            // Straight from the IP board: "Playful, clever and always curious.
            // Linko loves exploring and making new friends."
            personality: """["Playful","Clever","Curious"]""",
            bio: "Linko is the curious connector and one of the official mascots of MyPetLink.",
            safetyNote: "Linko is friendly and loves meeting new people. She answers to her name "
                + "and is happiest when someone says hello.",

            // Linko's approved story: adopted as a three-month-old on
            // 16 September 2022, so her birthday falls in the June before. The
            // chapter where she turns one on 16 June 2023 agrees. Without a
            // birthday the Safety Profile reads "Age unknown", which looks like
            // an unfinished profile on camera.
            birthday: new DateOnly(2022, 6, 16),
            adoptionDay: new DateOnly(2022, 9, 16));
    }

    private Pet AddLinky()
    {
        _dbContext.MediaFiles.Add(BuildMedia(
            LinkyProfileMediaId, LinkyPetId, "linky-profile.jpg",
            "image/jpeg", MediaUploadCategory.PetProfilePhoto, width: 900, height: 922));

        _dbContext.MediaFiles.Add(BuildMedia(
            LinkyCoverMediaId, LinkyPetId, "linky-cover.jpg",
            "image/jpeg", MediaUploadCategory.PetCoverPhoto, width: 1402, height: 1122));

        return AddMascot(
            LinkyPetId,
            name: "Linky",
            species: "Dog",

            // The IP board credits "Malaysian Local Dog (Kampung Dog)". The
            // local name is the one people here actually use, so it leads.
            breed: "Kampung Dog (Malaysian Local Dog)",
            gender: "Male",
            colour: "Black and white",
            publicCode: LinkyPublicCode,
            safetyCode: LinkySafetyCode,
            slug: LinkySlug,

            // From the IP board: "Loyal, protective and full of love. Linky is
            // always by your side, looking out for you."
            personality: """["Loyal","Protective","Affectionate"]""",
            bio: "Linky is the loyal guardian and one of the official mascots of MyPetLink.",
            safetyNote: "Linky is gentle and sticks close to people he trusts. Speak to him "
                + "calmly and he will happily stay with you.",

            // Linky's own story document: born 28 February 2025, found under a
            // banana leaf on 15 March and adopted the next day.
            birthday: new DateOnly(2025, 2, 28),
            adoptionDay: new DateOnly(2025, 3, 16));
    }

    /// <summary>
    /// One mascot, set up the way an owner's own screens would have set it up.
    ///
    /// Both mascots are built here rather than separately so they cannot drift
    /// apart in the ways that matter on camera and in the visibility rules:
    /// public profile on, social consented by the current owner, Safety Profile
    /// active, and contact inherited from the brand account. A difference
    /// between the two should be a fact about the character, not an oversight.
    /// </summary>
    private Pet AddMascot(
        Guid petId,
        string name,
        string species,
        string breed,
        string gender,
        string colour,
        string publicCode,
        string safetyCode,
        string slug,
        string personality,
        string bio,
        string safetyNote,
        DateOnly birthday,
        DateOnly adoptionDay)
    {
        var pet = new Pet
        {
            Id = petId,
            OwnerUserId = DemoOwnerId,
            Slug = slug,
            Name = name,
            Species = species,
            Breed = breed,
            Gender = gender,
            Color = colour,
            GeneralArea = "Kuala Lumpur",
            Birthday = birthday,
            AdoptionDay = adoptionDay,
            Bio = bio,
            PersonalityTagsJson = personality,

            // Deliberately no medical conditions, medication or allergies. A
            // fabricated health record on a page that people will read as ours
            // is a lie about a real product, not a harmless prop.
            SafetyNote = safetyNote,

            // Profile and cover photos are attached after this row exists; see
            // the phased save in EnsureSeededAsync.
            PublicProfile = new PetPublicProfile
            {
                PetId = petId,
                PublicCode = publicCode,
                SlugSnapshot = slug,
                IsPublicProfileEnabled = true,
                ShowOwnerName = true,
                ShowGeneralArea = true,
                ShowMoments = true,
                ShowTimeline = true,
                ShowBirthdayOnTimeline = true,
                ShowAdoptionDayOnTimeline = true
            },
            SocialProfile = new PetSocialProfile
            {
                PetId = petId,
                IsSocialEnabled = true,
                IsDiscoverable = true,

                // The same stamp the owner-facing settings route writes, so the
                // consent check that compares it against the current owner
                // passes the way it does for a real pet.
                ConsentedByUserId = DemoOwnerId
            },
            SafetySetting = new PetSafetySetting
            {
                PetId = petId,
                SafetyCode = safetyCode,
                QrSafetyEnabled = true,

                // WhatsApp only. There is one synthetic number on this account
                // and no reason to show it twice.
                ShowWhatsapp = true,
                ShowPhone = false,
                ShowEmergencyNote = false,
                ShowFoundLocationAction = true
            },
            Contact = new PetContact { PetId = petId, UseOwnerDefaults = true }
        };

        _dbContext.Pets.Add(pet);
        return pet;
    }


    /// <summary>
    /// The brand's Moments: the two mascots introduced, shown together, and the
    /// promise the product makes.
    ///
    /// Written in the voice of the official IP board rather than as a household's
    /// diary, because that is what this account is. The character lines are the
    /// board's own — "The Curious Connector", "The Loyal Guardian", and its
    /// closing sentence quoted in full — so the profile and the board cannot
    /// drift apart.
    ///
    /// <c>MomentDate</c> is when the thing happened in the mascot's story and
    /// <c>PublishedAt</c> is when the brand shared it. Keeping them apart is the
    /// whole reason both columns exist, and it is what makes the Community feed
    /// look like an account posting over a fortnight rather than five rows
    /// written in the same second.
    /// </summary>
    private void AddMoments(DateTimeOffset now)
    {
        AddMoment(
            Guid.Parse("b4a4de70-0000-4000-8000-000000000021"),
            Guid.Parse("b4a4de70-0000-4000-8000-000000000031"),
            "moment-01-meet-linko.jpg",
            primaryPetId: LinkoPetId,
            title: "Meet Linko 🐾",
            category: "Memory",
            caption: "The Curious Connector. Playful, clever and always curious — "
                + "Linko loves exploring and making new friends.",
            momentDate: new DateOnly(2022, 9, 17),
            publishedAt: now.AddDays(-12).AddHours(-4));

        AddMoment(
            Guid.Parse("b4a4de70-0000-4000-8000-000000000022"),
            Guid.Parse("b4a4de70-0000-4000-8000-000000000032"),
            "moment-02-meet-linky.jpg",
            primaryPetId: LinkyPetId,
            title: "Meet Linky 🐾",
            category: "Memory",
            caption: "The Loyal Guardian. Loyal, protective and full of love — "
                + "Linky is always by your side, looking out for you.",

            // The day he was found under a banana leaf, from his own story.
            momentDate: new DateOnly(2025, 3, 15),
            publishedAt: now.AddDays(-9).AddHours(-6));

        AddMoment(
            Guid.Parse("b4a4de70-0000-4000-8000-000000000023"),
            Guid.Parse("b4a4de70-0000-4000-8000-000000000033"),
            "moment-03-together.jpg",
            primaryPetId: LinkoPetId,

            // The one Moment about both mascots. It exercises the many-to-many
            // subject table properly: two MomentPets rows, one allowance, and
            // both pets' Moments tabs showing it.
            alsoAboutPetId: LinkyPetId,
            title: "Connect • Protect • Reunite",
            category: "Memory",
            caption: "Together, Linko and Linky represent the heart of MyPetLink — "
                + "making every pet's journey safer, and every connection stronger. 💙",
            momentDate: new DateOnly(2025, 3, 16),
            publishedAt: now.AddDays(-5).AddHours(-2));

        AddMoment(
            Guid.Parse("b4a4de70-0000-4000-8000-000000000024"),
            Guid.Parse("b4a4de70-0000-4000-8000-000000000034"),
            "moment-04-safe-at-home.jpg",
            primaryPetId: LinkyPetId,
            title: "Every pet deserves a safe way home",
            category: "Memory",
            caption: "Identity, safety and connection — for every pet, every family. 🏡",

            // Linky's first day home, 22 March 2025.
            momentDate: new DateOnly(2025, 3, 22),
            publishedAt: now.AddDays(-2).AddHours(-8));

        AddMoment(
            Guid.Parse("b4a4de70-0000-4000-8000-000000000025"),
            Guid.Parse("b4a4de70-0000-4000-8000-000000000035"),
            "moment-05-smart-tag.jpg",
            primaryPetId: LinkoPetId,
            title: "Small tag, big connection 🏷️",
            category: "Achievement",
            caption: "Smart, modern tools for every pet family. Scan or tap the tag and "
                + "a finder reaches you straight away.",
            momentDate: new DateOnly(2022, 9, 18),
            publishedAt: now.AddHours(-19));
    }

    private void AddMoment(
        Guid momentId,
        Guid mediaId,
        string fileName,
        Guid primaryPetId,
        string title,
        string category,
        string caption,
        DateOnly momentDate,
        DateTimeOffset publishedAt,
        Guid? alsoAboutPetId = null)
    {
        _dbContext.MediaFiles.Add(BuildMedia(
            mediaId,
            primaryPetId,
            fileName,
            "image/jpeg",
            MediaUploadCategory.MomentImage,

            // Dimensions are not read for layout by any surface that shows these;
            // they exist so the row looks like one the upload path wrote.
            width: 1402,
            height: 1122,
            linkOwnerType: MediaOwnerType.PetMemory,
            linkOwnerId: momentId));

        _dbContext.PetMemories.Add(new PetMemory
        {
            Id = momentId,

            // The PRIMARY subject, which owns the Moment and the plan allowance.
            PetId = primaryPetId,

            // The author is the MyPetLink account, and stays the author whatever
            // later happens to the pet.
            AuthorUserId = DemoOwnerId,
            Title = title,
            Type = category,
            Caption = caption,
            Visibility = MemoryVisibility.Public,
            MomentDate = momentDate,
            PublishedAt = publishedAt,
            CoverMediaFileId = mediaId,
            ShowInLifeTimeline = true,
            CreatedAt = publishedAt
        });

        // The many-to-many subject row, which the Moment's primary pet gets too.
        _dbContext.MomentPets.Add(new MomentPet
        {
            MomentId = momentId,
            PetId = primaryPetId,
            CreatedAt = publishedAt
        });

        if (alsoAboutPetId is { } additionalPetId)
        {
            // A second subject consumes no extra allowance: only the primary
            // PetId counts against a plan.
            _dbContext.MomentPets.Add(new MomentPet
            {
                MomentId = momentId,
                PetId = additionalPetId,
                CreatedAt = publishedAt
            });
        }
    }


    /// <summary>
    /// A ready, public image whose object key is an absolute URL on the local
    /// host.
    ///
    /// <c>MediaUrlBuilder</c> returns an already-absolute key unchanged, so these
    /// resolve to the Development static route and never to the configured
    /// Cloudflare base. That matters more than it looks: a developer's machine is
    /// usually pointed at the real R2 bucket and the live media domain, and
    /// seeding fixtures through the ordinary upload path would put marketing
    /// props into production storage.
    /// </summary>
    private MediaFile BuildMedia(
        Guid id,
        Guid? petId,
        string fileName,
        string contentType,
        MediaUploadCategory category,
        int width,
        int height,
        MediaOwnerType? linkOwnerType = null,
        Guid? linkOwnerId = null)
    {
        var url = $"{_options.MediaBaseUrl.TrimEnd('/')}"
            + $"{'/' + _options.MediaRequestPath.Trim('/')}/{fileName}";

        var media = new MediaFile
        {
            Id = id,
            OwnerUserId = DemoOwnerId,
            PetId = petId,
            OriginalFileName = fileName,
            StorageFileName = fileName,
            ContentType = contentType,
            FileSize = 0,
            StorageProvider = "Local",
            StoragePath = url,
            BucketName = "",
            ObjectKey = url,
            MediaType = MediaFileType.Image,
            Category = category,
            IsPublic = true,
            UploadStatus = MediaUploadStatus.Ready,

            // No derivative is generated for a seeded file, and readers fall back
            // to the original when none is expected.
            DerivativeStatus = MediaDerivativeStatus.NotApplicable,
            Width = width,
            Height = height
        };

        if (linkOwnerType.HasValue && linkOwnerId.HasValue)
        {
            media.Links.Add(new MediaFileLink
            {
                OwnerType = linkOwnerType.Value,
                OwnerId = linkOwnerId.Value,
                SortOrder = 0,

                // Left null, as the upload path does: alt text is written by a
                // person or it is absent, and a file name is not a description
                // of a picture.
                AltText = null
            });
        }

        return media;
    }
}
