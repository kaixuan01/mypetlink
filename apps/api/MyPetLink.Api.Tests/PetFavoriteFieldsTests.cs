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
    public void CreateAndUpdateDtos_AcceptFavoriteFieldsWithinTheLimit()
    {
        var createFoodLimit = GetParameterLimit<CreatePetRequest>(nameof(CreatePetRequest.FavoriteFood));
        var updateToyLimit = GetParameterLimit<UpdatePetRequest>(nameof(UpdatePetRequest.FavoriteToy));

        Assert.True(createFoodLimit.IsValid("参巴 ikan 🐟"));
        Assert.True(updateToyLimit.IsValid("Bola kegemaran 🎾"));
    }

    [Fact]
    public void CreateAndUpdateDtos_RejectFavoriteFieldsOverEightyCharacters()
    {
        var tooLong = new string('x', 81);

        Assert.False(GetParameterLimit<CreatePetRequest>(nameof(CreatePetRequest.FavoriteFood)).IsValid(tooLong));
        Assert.False(GetParameterLimit<UpdatePetRequest>(nameof(UpdatePetRequest.FavoriteToy)).IsValid(tooLong));
    }

    [Fact]
    public async Task UpdateAsync_PersistsAndReturnsMultilingualFavoriteFields()
    {
        using var harness = await PetHarness.CreateAsync();

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest("Ayam kukus 🍗", "毛绒小鼠 🐭"));
        var saved = await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId);
        var reloaded = await harness.Service.GetAsync(UserId, PetId);

        Assert.Equal("Ayam kukus 🍗", saved.FavoriteFood);
        Assert.Equal("毛绒小鼠 🐭", saved.FavoriteToy);
        Assert.Equal(saved.FavoriteFood, response.FavoriteFood);
        Assert.Equal(saved.FavoriteToy, response.FavoriteToy);
        Assert.Equal(saved.FavoriteFood, reloaded.FavoriteFood);
        Assert.Equal(saved.FavoriteToy, reloaded.FavoriteToy);
    }

    [Fact]
    public async Task UpdateAsync_NormalizesClearedFavoriteFieldsToNull()
    {
        using var harness = await PetHarness.CreateAsync(
            favoriteFood: "Beef treats",
            favoriteToy: "Blue ball");

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest("  ", ""));
        var saved = await harness.Db.Pets.SingleAsync(pet => pet.Id == PetId);

        Assert.Null(saved.FavoriteFood);
        Assert.Null(saved.FavoriteToy);
        Assert.Null(response.FavoriteFood);
        Assert.Null(response.FavoriteToy);
    }

    [Fact]
    public async Task UpdateAsync_OmittedFavoriteFieldsLeaveExistingValuesUnchanged()
    {
        using var harness = await PetHarness.CreateAsync(
            favoriteFood: "Tuna",
            favoriteToy: "Mouse");

        var response = await harness.Service.UpdateAsync(
            UserId,
            PetId,
            UpdateRequest(null, null));

        Assert.Equal("Tuna", response.FavoriteFood);
        Assert.Equal("Mouse", response.FavoriteToy);
    }

    [Fact]
    public async Task UpdateAsync_UsesPrivacyPreservingNotFoundForAnotherOwner()
    {
        using var harness = await PetHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.UpdateAsync(
                OtherUserId,
                PetId,
                UpdateRequest("Tuna", "Mouse")));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
        Assert.Equal("not_found", exception.Code);
    }

    [Fact]
    public async Task UpdateEndpoint_ReturnsThePersistedFavoriteFields()
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
            UpdateRequest("Ikan bilis", "Bola rotan"),
            CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var envelope = Assert.IsType<ApiResponse<PetDetailResponse>>(ok.Value);
        Assert.Equal("Ikan bilis", envelope.Data.FavoriteFood);
        Assert.Equal("Bola rotan", envelope.Data.FavoriteToy);
    }

    [Fact]
    public async Task PublicProfile_ReturnsFavoriteFieldsWithoutChangingSafetyData()
    {
        using var harness = await PetHarness.CreateAsync(
            favoriteFood: "Salmon",
            favoriteToy: "Feather wand");
        var service = new PublicProfileService(
            harness.Db,
            Options.Create(new CloudflareR2Options()));

        var response = await service.GetByPublicSlugAsync("topu-pub123");

        Assert.Equal("Salmon", response.FavoriteFood);
        Assert.Equal("Feather wand", response.FavoriteToy);
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

    private static CreatePetRequest CreateRequest(string? favoriteFood, string? favoriteToy)
    {
        return new CreatePetRequest(
            Name: "Topu",
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
            FavoriteFood: favoriteFood,
            FavoriteToy: favoriteToy);
    }

    private static UpdatePetRequest UpdateRequest(string? favoriteFood, string? favoriteToy)
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
            FavoriteFood: favoriteFood,
            FavoriteToy: favoriteToy);
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
            string? favoriteFood = null,
            string? favoriteToy = null)
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
                Status = UserStatus.Active
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = UserId,
                OwnerUser = owner,
                Slug = "topu-pub123",
                Name = "Topu",
                Species = "Cat",
                FavoriteFood = favoriteFood,
                FavoriteToy = favoriteToy,
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
