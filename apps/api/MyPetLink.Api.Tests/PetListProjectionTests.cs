using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetListProjectionTests
{
    private static readonly Guid UserId = Guid.Parse("81111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("82222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task ListAsync_ReturnsCompletionAndOccasionFieldsExactlyAsDetailDoes()
    {
        await using var harness = await PetHarness.CreateAsync(
            breed: "Golden Retriever",
            gender: "Male",
            bio: "Gentle, loyal, and always ready for a walk.",
            adoptionDay: new DateOnly(2022, 8, 17));

        var (items, total) = await harness.Service.ListAsync(UserId, 1, 20, null);
        var listItem = Assert.Single(items);
        var detail = await harness.Service.GetAsync(UserId, PetId);

        Assert.Equal(1, total);
        Assert.Equal(detail.Breed, listItem.Breed);
        Assert.Equal(detail.Gender, listItem.Gender);
        Assert.Equal(detail.Bio, listItem.Bio);
        Assert.Equal(detail.AdoptionDay, listItem.AdoptionDay);
    }

    [Fact]
    public async Task ListAsync_PreservesMissingProfileFieldsAsMissing()
    {
        await using var harness = await PetHarness.CreateAsync();

        var (items, _) = await harness.Service.ListAsync(UserId, 1, 20, null);
        var listItem = Assert.Single(items);

        Assert.Null(listItem.Breed);
        Assert.Null(listItem.Gender);
        Assert.Null(listItem.Bio);
        Assert.Null(listItem.AdoptionDay);
    }

    private sealed class PetHarness : IAsyncDisposable
    {
        private PetHarness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new PetService(db, Options.Create(new CloudflareR2Options
            {
                PublicBaseUrl = "https://media.mypetlink.test"
            }));
        }

        public MyPetLinkDbContext Db { get; }
        public PetService Service { get; }

        public static async Task<PetHarness> CreateAsync(
            string? breed = null,
            string? gender = null,
            string? bio = null,
            DateOnly? adoptionDay = null)
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
                Breed = breed,
                Gender = gender,
                Bio = bio,
                AdoptionDay = adoptionDay,
                PersonalityTagsJson = "[\"Friendly\"]",
                PublicProfile = new PetPublicProfile
                {
                    PublicCode = "p123",
                    SlugSnapshot = "milo-p123"
                },
                SafetySetting = new PetSafetySetting { SafetyCode = "safe-milo" }
            };

            db.Users.Add(user);
            db.Pets.Add(pet);
            await db.SaveChangesAsync();
            return new PetHarness(db);
        }

        public async ValueTask DisposeAsync() => await Db.DisposeAsync();
    }
}
