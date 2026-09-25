using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The boundary between the three owner identities, and between a pet's
/// shareable link and its place in a social network.
///
/// These assertions are structural on purpose. A privacy rule kept as a habit
/// gets broken by the next person who adds "just one more useful field" to a
/// response; a rule kept as a failing test does not.
/// </summary>
public sealed class SocialIdentityIsolationTests
{
    private static readonly Guid OwnerId = Guid.Parse("d1111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("d2222222-2222-2222-2222-222222222222");

    /// <summary>
    /// Field names that belong to the account identity or the finder identity.
    /// None of them may appear on a social response.
    /// </summary>
    private static readonly string[] ForbiddenFieldFragments =
    [
        "Email",
        "Phone",
        "Whatsapp",
        "WhatsApp",
        "OwnerDisplayName",
        "SafetyCode",
        "TagCode",
        "EmergencyContact",
        "EmergencyNote",
        "SafetyNote",
        "PlanId",
        "PlanCode"
    ];

    [Fact]
    public void SocialResponses_CarryNoAccountOrFinderField()
    {
        var socialResponseTypes = new[]
        {
            typeof(OwnerSocialProfileResponse),
            typeof(OwnerHandleAvailabilityResponse),
            typeof(MomentCommentResponse),
            typeof(MomentCommentViewerResponse),
            typeof(MomentCommentPageResponse),
            typeof(CreateMomentCommentResponse),
            typeof(DeleteMomentCommentResponse),
            typeof(MomentCollaborationPetResponse),
            typeof(MomentCollaborationResponse),
            typeof(MomentCollaborationListResponse),
            typeof(CollaborationCandidatePetResponse),
            typeof(CollaborationCandidateResponse),
            typeof(CollaborationCandidatesResponse),
            typeof(IncomingMomentCollaborationResponse),
            typeof(PublicMomentCollaborationResponse),
            typeof(MomentCommentMentionResponse),
            typeof(CommentMentionSuggestionsResponse),
            typeof(CommentMentionSuggestionResponse)
        };

        var offenders = new List<string>();

        foreach (var type in socialResponseTypes)
        {
            foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                foreach (var fragment in ForbiddenFieldFragments)
                {
                    if (property.Name.Contains(fragment, StringComparison.Ordinal))
                    {
                        offenders.Add($"{type.Name}.{property.Name}");
                    }
                }
            }
        }

        Assert.True(
            offenders.Count == 0,
            "These social response fields name an account or finder value: "
            + string.Join(", ", offenders));
    }

    [Fact]
    public void SocialResponses_ExposeNoInternalUserOrPetIdentifier()
    {
        // A handle is the public address of a household. Exposing the row id
        // would give a stable internal identifier to correlate against, for no
        // benefit the handle does not already provide.
        var identifierFields = new[]
            {
                typeof(OwnerSocialProfileResponse),
                typeof(MomentCommentResponse),
                typeof(MomentCommentViewerResponse),
                typeof(MomentCommentPageResponse),
                typeof(CreateMomentCommentResponse),
                typeof(MomentCollaborationPetResponse),
                typeof(MomentCollaborationResponse),
                typeof(MomentCollaborationListResponse),
                typeof(CollaborationCandidatePetResponse),
                typeof(CollaborationCandidateResponse),
                typeof(IncomingMomentCollaborationResponse),
                typeof(PublicMomentCollaborationResponse),
                typeof(MomentCommentMentionResponse),
                typeof(CommentMentionSuggestionsResponse),
                typeof(CommentMentionSuggestionResponse)
            }
            .SelectMany(type => type
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(property => property.Name is
                    "UserId" or "AuthorUserId" or "OwnerProfileId"
                    or "PetId" or "InviterUserId" or "InviteeUserId" or "OwnerUserId"
                    or "MentionedUserId" or "CommentAuthorUserId")
                .Select(property => $"{type.Name}.{property.Name}"))
            .ToArray();

        Assert.Empty(identifierFields);
    }

    [Fact]
    public async Task TheOwnerSelfView_ContainsNoneOfTheAccountValues()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));

        var profile = await harness.Social.UpdateAsync(
            OwnerId,
            new UpdateOwnerSocialProfileRequest(
                DisplayName: "Mochi & Coco's Family",
                Bio: null,
                GeneralArea: null,
                IsSocialEnabled: true,
                IsDiscoverable: null,
                AllowFollowers: null,
                RowVersion: null));

        // Round-trip the whole response through text and check the account and
        // finder values are simply not in it, whatever the field names are.
        var serialized = System.Text.Json.JsonSerializer.Serialize(profile);

        Assert.DoesNotContain("sarah.tan@example.com", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Sarah Tan", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("+60123456789", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("safety-code-abc", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ANewPet_IsNotInTheSocialNetwork()
    {
        using var harness = await Harness.CreateAsync();

        var pet = await harness.Pets.CreateAsync(
            OwnerId,
            new CreatePetRequest(
                Name: "Mochi",
                Species: "Cat",
                CustomSpecies: null,
                Breed: "British Shorthair",
                Gender: "Female",
                Color: "Cream",
                AgeInformationMode: null,
                Birthday: null,
                EstimatedBirthYear: null,
                AdoptionDay: null,
                GeneralArea: "Bangsar, Kuala Lumpur",
                Bio: null,
                PersonalityTags: null,
                ProfileTheme: null,
                Contact: null,
                Visibility: null,
                SafetyNote: null,
                EmergencyNote: null));

        var social = await harness.Db.PetSocialProfiles.SingleAsync(item => item.PetId == pet.Id);

        Assert.False(social.IsSocialEnabled);
        Assert.False(social.IsDiscoverable);
    }

    [Fact]
    public async Task APublicShareProfile_DoesNotImplySocialParticipation()
    {
        using var harness = await Harness.CreateAsync();
        harness.Db.Pets.Add(new Pet
        {
            Id = PetId,
            OwnerUserId = OwnerId,
            Slug = "mochi-pub123",
            Name = "Mochi",
            Species = "Cat",

            // The owner is happy to hand this link to friends...
            PublicProfile = new PetPublicProfile
            {
                PublicCode = "pub123",
                SlugSnapshot = "mochi-pub123",
                IsPublicProfileEnabled = true
            },

            // ...which says nothing about being browsable by strangers.
            SocialProfile = new PetSocialProfile()
        });
        await harness.Db.SaveChangesAsync();

        var social = await harness.Db.PetSocialProfiles.SingleAsync(item => item.PetId == PetId);
        var publicProfile = await harness.Db.PetPublicProfiles.SingleAsync(item => item.PetId == PetId);

        Assert.True(publicProfile.IsPublicProfileEnabled);
        Assert.False(social.IsSocialEnabled);
        Assert.False(social.IsDiscoverable);
    }

    [Fact]
    public async Task APetWithSocialOff_IsNotReturnedByADiscoveryStyleQuery()
    {
        using var harness = await Harness.CreateAsync();
        harness.Db.Pets.Add(new Pet
        {
            Id = PetId,
            OwnerUserId = OwnerId,
            Slug = "mochi-pub123",
            Name = "Mochi",
            Species = "Cat",
            PublicProfile = new PetPublicProfile
            {
                PublicCode = "pub123",
                SlugSnapshot = "mochi-pub123",
                IsPublicProfileEnabled = true
            },
            SocialProfile = new PetSocialProfile
            {
                IsSocialEnabled = false,
                IsDiscoverable = false
            }
        });
        await harness.Db.SaveChangesAsync();

        // The shape every later discovery query must take: both switches
        // filtered in SQL, never in memory after the fact.
        var discoverable = await harness.Db.PetSocialProfiles
            .Where(item => item.IsSocialEnabled && item.IsDiscoverable)
            .Select(item => item.PetId)
            .ToListAsync();

        Assert.Empty(discoverable);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            var auditLog = new AuditLogService(db, new Microsoft.AspNetCore.Http.HttpContextAccessor());
            var handles = new OwnerHandleService(db, Options.Create(new SocialOptions()), auditLog);
            Social = new OwnerSocialProfileService(
                db,
                handles,
                Options.Create(new CloudflareR2Options()),
                Options.Create(new SocialOptions()),
                auditLog);
            Pets = new PetService(db, Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }

        public OwnerSocialProfileService Social { get; }

        public PetService Pets { get; }

        public static async Task<Harness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);

            db.Users.Add(new User
            {
                Id = OwnerId,
                Email = "sarah.tan@example.com",
                NormalizedEmail = "SARAH.TAN@EXAMPLE.COM",
                DisplayName = "Sarah Tan",
                PhoneE164 = "+60123456789",
                WhatsappE164 = "+60123456789",
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = OwnerId,
                    OwnerDisplayName = "Sarah Tan",
                    Plan = new Plan
                    {
                        Code = "Free",
                        Name = "Free",
                        PriceLabel = "RM0",
                        Limit = new PlanLimit
                        {
                            MaxPets = 3,
                            MaxPrivateMemoriesPerPet = 10,
                            MaxMediaPerMemory = 5,
                            MaxFamilyMembers = 1,
                            MaxCareRecords = 100,
                            ScanHistoryDays = 0
                        }
                    }
                }
            });
            await db.SaveChangesAsync();

            return new Harness(db);
        }

        public void Dispose() => Db.Dispose();
    }
}
