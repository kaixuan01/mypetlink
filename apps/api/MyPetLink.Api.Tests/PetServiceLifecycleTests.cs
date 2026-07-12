using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetServiceLifecycleTests
{
    private static readonly Guid UserId = Guid.Parse("41111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("42222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task RestoreActiveAsync_PreservesMemorialDetails()
    {
        using var harness = await PetHarness.CreateAsync();
        var date = new DateOnly(2025, 4, 12);

        await harness.Service.MarkMemorialAsync(
            UserId,
            PetId,
            new MarkPetMemorialRequest(date, "Forever in our hearts.", true));

        var response = await harness.Service.RestoreActiveAsync(UserId, PetId);
        var saved = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);

        Assert.Equal(PetLifecycleStatus.Active, response.LifecycleStatus);
        Assert.Equal(date, saved.MemorialPassedAwayDate);
        Assert.Equal("Forever in our hearts.", saved.MemorialMessage);
        Assert.True(saved.ShowMemorialOnPublicProfile);
    }

    [Fact]
    public async Task MarkMemorialAsync_RejectsArchivedPet()
    {
        using var harness = await PetHarness.CreateAsync();
        await harness.Service.ArchiveAsync(UserId, PetId);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.MarkMemorialAsync(
                UserId,
                PetId,
                new MarkPetMemorialRequest(null, "Remembered.", true)));

        Assert.Equal("invalid_pet_state", error.Code);
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
            var planId = Guid.Parse("43333333-3333-3333-3333-333333333333");
            var plan = new Plan
            {
                Id = planId,
                Code = "Free",
                Name = "Free Plan",
                PriceLabel = "RM0",
                Limit = new PlanLimit { PlanId = planId, MaxPets = 3 }
            };
            var user = new User
            {
                Id = UserId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active
            };
            user.OwnerProfile = new OwnerProfile
            {
                UserId = UserId,
                PlanId = planId,
                OwnerDisplayName = "Owner",
                User = user,
                Plan = plan
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
                SafetySetting = new PetSafetySetting { SafetyCode = "safe-milo" }
            };

            db.Plans.Add(plan);
            db.Users.Add(user);
            db.Pets.Add(pet);
            await db.SaveChangesAsync();
            return new PetHarness(db);
        }

        public void Dispose() => Db.Dispose();
    }
}
