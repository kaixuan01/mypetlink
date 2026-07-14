using System.ComponentModel.DataAnnotations;
using System.Reflection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class PetFavoriteFieldsTests
{
    private static readonly Guid UserId = Guid.Parse("71111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherUserId = Guid.Parse("71111111-1111-1111-1111-111111111112");
    private static readonly Guid PetId = Guid.Parse("72222222-2222-2222-2222-222222222222");

    [Fact]
    public void LegacySingleValueDtoFields_KeepTheEightyCharacterLimit()
    {
        var tooLong = new string('x', 81);

        Assert.True(GetParameterLimit<CreatePetRequest>("FavoriteFood").IsValid("参巴 ikan 🐟"));
        Assert.False(GetParameterLimit<CreatePetRequest>("FavoriteFood").IsValid(tooLong));
        Assert.False(GetParameterLimit<UpdatePetRequest>("FavoriteToy").IsValid(tooLong));
    }

    [Fact]
    public async Task UpdateAsync_TrimsDeduplicatesAndCapsFavoritesAtThree()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(
                foods: [" Tuna ", "tuna", "", "Chicken", "Salmon", "Beef"],
                toys: null));

        Assert.Equal(["Tuna", "Chicken", "Salmon"], response.FavoriteFoods);
    }

    [Fact]
    public async Task UpdateAsync_CapsFavoriteItemLengthAtEighty()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(foods: [new string('x', 100)], toys: null));

        Assert.Equal(80, Assert.Single(response.FavoriteFoods).Length);
    }

    [Fact]
    public async Task UpdateAsync_PersistsAndReturnsMultilingualFavoriteLists()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(
                foods: ["Ayam kukus 🍗", "Ikan bilis"],
                toys: ["毛绒小鼠 🐭"]));
        var saved = await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId);
        var reloaded = await harness.Service.GetAsync(UserId, PetId);

        Assert.Equal(
            ["Ayam kukus 🍗", "Ikan bilis"],
            System.Text.Json.JsonSerializer.Deserialize<List<string>>(saved.FavoriteFoodsJson));
        Assert.Equal(
            ["毛绒小鼠 🐭"],
            System.Text.Json.JsonSerializer.Deserialize<List<string>>(saved.FavoriteToysJson));
        Assert.Equal(["Ayam kukus 🍗", "Ikan bilis"], response.FavoriteFoods);
        Assert.Equal(["毛绒小鼠 🐭"], response.FavoriteToys);
        Assert.Equal(response.FavoriteFoods, reloaded.FavoriteFoods);
        Assert.Equal(response.FavoriteToys, reloaded.FavoriteToys);
    }

    [Fact]
    public async Task UpdateAsync_EmptyListsClearSavedFavorites()
    {
        using var harness = await PetHarness.CreateAsync(
            foodsJson: """["Beef treats"]""",
            toysJson: """["Blue ball"]""");

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(foods: [], toys: []));
        var saved = await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId);

        Assert.Equal("[]", saved.FavoriteFoodsJson);
        Assert.Equal("[]", saved.FavoriteToysJson);
        Assert.Empty(response.FavoriteFoods);
        Assert.Empty(response.FavoriteToys);
    }

    [Fact]
    public async Task UpdateAsync_OmittedFavoriteListsLeaveExistingValuesUnchanged()
    {
        using var harness = await PetHarness.CreateAsync(
            foodsJson: """["Tuna"]""",
            toysJson: """["Mouse"]""");

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(foods: null, toys: null));

        Assert.Equal(["Tuna"], response.FavoriteFoods);
        Assert.Equal(["Mouse"], response.FavoriteToys);
    }

    [Fact]
    public async Task UpdateAsync_LegacySingleValuesStillSaveAsOneItemLists()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(
                foods: null,
                toys: null,
                legacyFood: "Salmon",
                legacyToy: " Feather wand "));

        Assert.Equal(["Salmon"], response.FavoriteFoods);
        Assert.Equal(["Feather wand"], response.FavoriteToys);
    }

    [Fact]
    public async Task CreateAsync_AcceptsFavoriteListsAndNormalizesDuplicates()
    {
        using var harness = await PetHarness.CreateAsync();

        var created = await harness.Service.CreateAsync(
            UserId,
            CreateRequest(foods: ["Tuna", " tuna", "Chicken"], toys: null));

        Assert.Equal(["Tuna", "Chicken"], created.FavoriteFoods);
        Assert.Empty(created.FavoriteToys);
    }

    [Fact]
    public async Task UpdateAsync_UsesPrivacyPreservingNotFoundForAnotherOwner()
    {
        using var harness = await PetHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OtherUserId,
                PetId,
                UpdateRequest(foods: ["Tuna"], toys: ["Mouse"])));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
        Assert.Equal("not_found", exception.Code);
    }

    [Fact]
    public async Task UpdateEndpoint_ReturnsThePersistedFavoriteLists()
    {
        using var harness = await PetHarness.CreateAsync();
        var controller = new PetsController(
            harness.Service,
            new TestCurrentUserService(UserId))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext()
            }
        };

        var result = await controller.Update(
            PetId,
            UpdateRequest(foods: ["Ikan bilis"], toys: ["Bola rotan", "Tali"]),
            CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var envelope = Assert.IsType<ApiResponse<PetDetailResponse>>(ok.Value);
        Assert.Equal(["Ikan bilis"], envelope.Data.FavoriteFoods);
        Assert.Equal(["Bola rotan", "Tali"], envelope.Data.FavoriteToys);
    }

    [Fact]
    public async Task PublicProfile_ReturnsFavoriteListsWithoutChangingSafetyData()
    {
        using var harness = await PetHarness.CreateAsync(
            foodsJson: """["Salmon","Chicken"]""",
            toysJson: """["Feather wand"]""");
        var service = new PublicProfileService(
            harness.Db,
            Options.Create(new CloudflareR2Options()));

        var response = await service.GetByPublicSlugAsync("topu-pub123");

        Assert.Equal(["Salmon", "Chicken"], response.FavoriteFoods);
        Assert.Equal(["Feather wand"], response.FavoriteToys);
    }

    [Fact]
    public async Task PublicProfile_ReturnsEmptyListsForLegacyOrInvalidJson()
    {
        using var harness = await PetHarness.CreateAsync(
            foodsJson: "not json",
            toysJson: "");
        var service = new PublicProfileService(
            harness.Db,
            Options.Create(new CloudflareR2Options()));

        var response = await service.GetByPublicSlugAsync("topu-pub123");

        Assert.Empty(response.FavoriteFoods);
        Assert.Empty(response.FavoriteToys);
    }

    private static MaxLengthAttribute GetParameterLimit<TRequest>(string parameterName)
    {
        var parameter = typeof(TRequest)
            .GetConstructors(BindingFlags.Instance | BindingFlags.Public)
            .Single()
            .GetParameters()
            .Single(item => string.Equals(item.Name, parameterName, StringComparison.OrdinalIgnoreCase));

        return Assert.IsType<MaxLengthAttribute>(
            parameter.GetCustomAttribute(typeof(MaxLengthAttribute)));
    }

    private static CreatePetRequest CreateRequest(
        IReadOnlyList<string>? foods,
        IReadOnlyList<string>? toys)
    {
        return new CreatePetRequest(
            Name: "Topu Junior",
            Species: "Cat",
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
            FavoriteFoods: foods,
            FavoriteToys: toys);
    }

    private static UpdatePetRequest UpdateRequest(
        IReadOnlyList<string>? foods,
        IReadOnlyList<string>? toys,
        string? legacyFood = null,
        string? legacyToy = null)
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
            FavoriteFoods: foods,
            FavoriteToys: toys,
            FavoriteFood: legacyFood,
            FavoriteToy: legacyToy);
    }

    private sealed class TestCurrentUserService : ICurrentUserService
    {
        public TestCurrentUserService(Guid userId)
        {
            Current = new CurrentUser(userId, "owner@example.com", ["Owner"]);
        }

        public CurrentUser Current { get; }
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

        public static async Task<PetHarness> CreateAsync(
            string foodsJson = "[]",
            string toysJson = "[]")
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var owner = new User
            {
                Id = UserId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = UserId,
                    OwnerDisplayName = "Owner",
                    DefaultGeneralArea = "Petaling Jaya",
                    Plan = new Plan
                    {
                        Code = "free",
                        Name = "Free",
                        PriceLabel = "RM0",
                        Limit = new PlanLimit
                        {
                            MaxPets = 3,
                            MaxMemoriesPerPet = 10,
                            MaxMediaPerMemory = 4,
                            MaxFamilyMembers = 1,
                            MaxCareRecords = 100,
                            ScanHistoryDays = 0
                        }
                    }
                }
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = UserId,
                OwnerUser = owner,
                Slug = "topu-pub123",
                Name = "Topu",
                Species = "Cat",
                FavoriteFoodsJson = foodsJson,
                FavoriteToysJson = toysJson,
                PublicProfile = new PetPublicProfile
                {
                    PublicCode = "pub123",
                    SlugSnapshot = "topu-pub123",
                    IsPublicProfileEnabled = true
                },
                SafetySetting = new PetSafetySetting
                {
                    SafetyCode = "safe-topu",
                    QrSafetyEnabled = true
                }
            };

            db.Users.Add(owner);
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
