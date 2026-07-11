using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetServicePersonalityTagsTests
{
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task UpdateAsync_SavesExactlyTheSelectedTags()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            TagsRequest("Friendly", "Playful", "Curious"));

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);

        Assert.Equal(new[] { "Friendly", "Playful", "Curious" }, response.PersonalityTags);
        // Persisted as a JSON array of exactly those tags.
        Assert.Equal("[\"Friendly\",\"Playful\",\"Curious\"]", pet.PersonalityTagsJson);
    }

    [Fact]
    public async Task GetAsync_ReturnsTheSameTagsThatWereSaved()
    {
        using var harness = await PetHarness.CreateAsync();
        await harness.Service.UpdateAsync(UserId, PetId, TagsRequest("Friendly", "Playful", "Curious"));

        var response = await harness.Service.GetAsync(UserId, PetId);

        Assert.Equal(new[] { "Friendly", "Playful", "Curious" }, response.PersonalityTags);
    }

    [Fact]
    public async Task UpdateAsync_WithEmptyList_ClearsAllTags()
    {
        using var harness = await PetHarness.CreateAsync();
        await harness.Service.UpdateAsync(UserId, PetId, TagsRequest("Friendly"));

        var response = await harness.Service.UpdateAsync(UserId, PetId, TagsRequest());

        Assert.Empty(response.PersonalityTags);
    }

    [Fact]
    public async Task UpdateAsync_WithNullTags_LeavesSavedTagsUnchanged()
    {
        using var harness = await PetHarness.CreateAsync();
        await harness.Service.UpdateAsync(UserId, PetId, TagsRequest("Friendly", "Playful"));

        // A partial update (tags omitted) must not wipe the saved tags.
        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            TagsRequest((IReadOnlyList<string>?)null));

        Assert.Equal(new[] { "Friendly", "Playful" }, response.PersonalityTags);
    }

    [Fact]
    public async Task UpdateAsync_DoesNotReplaceTagsWithDefaults()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(UserId, PetId, TagsRequest("Grumpy"));

        Assert.DoesNotContain("Loved", response.PersonalityTags);
        Assert.DoesNotContain("Family pet", response.PersonalityTags);
        Assert.Equal(new[] { "Grumpy" }, response.PersonalityTags);
    }

    [Fact]
    public async Task UpdateAsync_TrimsDropsEmptyAndDeduplicatesCaseInsensitively()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            TagsRequest("  Friendly  ", "", "  ", "friendly", "Playful"));

        Assert.Equal(new[] { "Friendly", "Playful" }, response.PersonalityTags);
    }

    [Fact]
    public async Task UpdateAsync_CapsTheNumberOfTags()
    {
        using var harness = await PetHarness.CreateAsync();
        var many = Enumerable.Range(1, 30).Select(index => $"tag{index}").ToArray();

        var response = await harness.Service.UpdateAsync(UserId, PetId, TagsRequest(many));

        // Capped to a sane maximum; the exact leading tags are preserved in order.
        Assert.True(response.PersonalityTags.Count <= 12);
        Assert.Equal("tag1", response.PersonalityTags[0]);
    }

    [Fact]
    public async Task UpdateAsync_CapsIndividualTagLength()
    {
        using var harness = await PetHarness.CreateAsync();
        var longTag = new string('a', 60);

        var response = await harness.Service.UpdateAsync(UserId, PetId, TagsRequest(longTag));

        Assert.Single(response.PersonalityTags);
        Assert.True(response.PersonalityTags[0].Length <= 40);
    }

    private static UpdatePetRequest TagsRequest(params string[] tags)
    {
        return TagsRequest((IReadOnlyList<string>?)tags);
    }

    private static UpdatePetRequest TagsRequest(IReadOnlyList<string>? tags)
    {
        return new UpdatePetRequest(
            Name: null,
            Species: null,
            CustomSpecies: null,
            Breed: null,
            Gender: null,
            Color: null,
            AgeInformationMode: null,
            Birthday: null,
            EstimatedBirthYear: null,
            AdoptionDay: null,
            GeneralArea: null,
            Bio: null,
            PersonalityTags: tags,
            ProfileTheme: null,
            Contact: null,
            Visibility: null,
            SafetyNote: null,
            EmergencyNote: null);
    }

    private sealed class PetHarness : IDisposable
    {
        private PetHarness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new PetService(
                db,
                Options.Create(new CloudflareR2Options
                {
                    PublicBaseUrl = "https://media.mypetlink.test"
                }));
        }

        public MyPetLinkDbContext Db { get; }

        public PetService Service { get; }

        public static async Task<PetHarness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var user = new User
            {
                Id = UserId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = UserId,
                OwnerUser = user,
                Slug = "milo-p123",
                Name = "Milo",
                Species = "Dog",
                PublicProfile = new PetPublicProfile
                {
                    PublicCode = "p123",
                    SlugSnapshot = "milo-p123"
                },
                SafetySetting = new PetSafetySetting
                {
                    SafetyCode = "safe-milo"
                }
            };

            db.Users.Add(user);
            db.Pets.Add(pet);
            await db.SaveChangesAsync();

            return new PetHarness(db);
        }

        public void Dispose()
        {
            Db.Dispose();
        }
    }
}
