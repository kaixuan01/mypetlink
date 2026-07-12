using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetServiceCoverPositionTests
{
    private static readonly Guid UserId = Guid.Parse("31111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("32222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task UpdateAsync_PersistsCoverFocalPosition()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            PositionRequest(24, 78));
        var saved = await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId);

        Assert.Equal((byte)24, response.CoverPositionX);
        Assert.Equal((byte)78, response.CoverPositionY);
        Assert.Equal((byte)24, saved.CoverPositionX);
        Assert.Equal((byte)78, saved.CoverPositionY);
    }

    [Fact]
    public async Task UpdateAsync_RejectsCoverFocalPositionOutsidePercentageRange()
    {
        using var harness = await PetHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(UserId, PetId, PositionRequest(101, 50)));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Contains("coverPositionX", exception.Details!.Keys);
    }

    private static UpdatePetRequest PositionRequest(byte positionX, byte positionY)
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
            PersonalityTags: null,
            ProfileTheme: null,
            Contact: null,
            Visibility: null,
            SafetyNote: null,
            EmergencyNote: null,
            CoverPositionX: positionX,
            CoverPositionY: positionY);
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
