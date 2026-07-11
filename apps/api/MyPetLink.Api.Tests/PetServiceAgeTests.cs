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

public sealed class PetServiceAgeTests
{
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task GetAsync_WhenBirthdayAndLegacyUnknownExist_ReturnsExactBirthdayAge()
    {
        using var harness = await PetHarness.CreateAsync();
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        pet.Birthday = new DateOnly(2020, 1, 1);
        pet.EstimatedAgeLabel = "Unknown";
        await harness.Db.SaveChangesAsync();

        var response = await harness.Service.GetAsync(UserId, PetId);

        Assert.Equal(PetAgeSource.ExactBirthday, response.Age.Source);
        Assert.DoesNotContain("unknown", response.Age.DisplayLabel, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateAsync_ExactBirthday_ClearsEstimatedBirthYear()
    {
        using var harness = await PetHarness.CreateAsync();

        await harness.Service.UpdateAsync(
            UserId,
            PetId,
            AgeRequest(PetAgeMode.ExactBirthday, birthday: new DateOnly(2021, 5, 4), estimatedBirthYear: 2020));

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        Assert.Equal(new DateOnly(2021, 5, 4), pet.Birthday);
        Assert.Null(pet.EstimatedBirthYear);
        Assert.Null(pet.EstimatedAgeLabel);
    }

    [Fact]
    public async Task UpdateAsync_EstimatedBirthYear_ClearsBirthday()
    {
        using var harness = await PetHarness.CreateAsync();

        await harness.Service.UpdateAsync(
            UserId,
            PetId,
            AgeRequest(PetAgeMode.EstimatedBirthYear, birthday: new DateOnly(2021, 5, 4), estimatedBirthYear: 2022));

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        Assert.Null(pet.Birthday);
        Assert.Equal((short)2022, pet.EstimatedBirthYear);
    }

    [Fact]
    public async Task UpdateAsync_Unknown_ClearsBirthdayAndEstimatedBirthYear()
    {
        using var harness = await PetHarness.CreateAsync();

        await harness.Service.UpdateAsync(
            UserId,
            PetId,
            AgeRequest(PetAgeMode.Unknown, birthday: new DateOnly(2021, 5, 4), estimatedBirthYear: 2022));

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        Assert.Null(pet.Birthday);
        Assert.Null(pet.EstimatedBirthYear);
    }

    [Fact]
    public async Task UpdateAsync_FutureBirthday_IsRejected()
    {
        using var harness = await PetHarness.CreateAsync();
        var futureBirthday = new DateOnly(DateTime.UtcNow.Year + 1, 1, 1);

        var exception = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            UserId,
            PetId,
            AgeRequest(PetAgeMode.ExactBirthday, birthday: futureBirthday)));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Contains("birthday", exception.Details!.Keys);
    }

    [Fact]
    public async Task UpdateAsync_FutureEstimatedBirthYear_IsRejected()
    {
        using var harness = await PetHarness.CreateAsync();
        var futureYear = checked((short)(DateTime.UtcNow.Year + 1));

        var exception = await Assert.ThrowsAsync<ApiException>(() => harness.Service.UpdateAsync(
            UserId,
            PetId,
            AgeRequest(PetAgeMode.EstimatedBirthYear, estimatedBirthYear: futureYear)));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Contains("estimatedBirthYear", exception.Details!.Keys);
    }

    private static UpdatePetRequest AgeRequest(
        PetAgeMode mode,
        DateOnly? birthday = null,
        short? estimatedBirthYear = null)
    {
        return new UpdatePetRequest(
            Name: null,
            Species: null,
            CustomSpecies: null,
            Breed: null,
            Gender: null,
            Color: null,
            AgeInformationMode: mode,
            Birthday: birthday,
            EstimatedBirthYear: estimatedBirthYear,
            AdoptionDay: null,
            GeneralArea: null,
            Bio: null,
            PersonalityTags: null,
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
                Birthday = new DateOnly(2020, 1, 1),
                EstimatedBirthYear = 2019,
                EstimatedAgeLabel = "Unknown",
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
