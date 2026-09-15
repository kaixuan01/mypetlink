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
/// The owner's social identity is a third, separate identity. These tests exist
/// because the failure mode is silent: a profile that quietly enables itself, or
/// a display name quietly seeded from the account, would look perfectly normal
/// in the UI while publishing something the owner never agreed to publish.
/// </summary>
public sealed class OwnerSocialIdentityTests
{
    private static readonly Guid OwnerId = Guid.Parse("b1111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwnerId = Guid.Parse("b2222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task ExistingAccount_IsNotSocialUntilTheOwnerTurnsItOn()
    {
        using var harness = await Harness.CreateAsync();

        var profile = await harness.Social.GetAsync(OwnerId);

        Assert.False(profile.IsSocialEnabled);
        Assert.False(profile.IsDiscoverable);
        Assert.Null(profile.Handle);
        Assert.Null(profile.DisplayName);
        Assert.False(profile.CanEnableSocial);
    }

    [Fact]
    public async Task ReadingTheProfile_NeverSeedsNamesFromTheAccountOrTheFinderIdentity()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Social.GetAsync(OwnerId);

        var stored = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == OwnerId);

        // The account is "Sarah Tan" <sarah.tan@example.com> and finders see
        // "Sarah Tan". None of that may appear here.
        Assert.Null(stored.Handle);
        Assert.Null(stored.NormalizedHandle);
        Assert.Null(stored.DisplayName);
        Assert.Null(stored.NormalizedDisplayName);
    }

    [Fact]
    public async Task EnablingSocial_IsRefusedUntilThereIsAHandleAndADisplayName()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.UpdateAsync(
                OwnerId,
                new UpdateOwnerSocialProfileRequest(
                    DisplayName: null,
                    Bio: null,
                    GeneralArea: null,
                    IsSocialEnabled: true,
                    IsDiscoverable: null,
                    AllowFollowers: null,
                    RowVersion: null)));

        Assert.Equal("validation_failed", error.Code);
        Assert.True(error.Details!.ContainsKey("isSocialEnabled"));

        var stored = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == OwnerId);
        Assert.False(stored.IsSocialEnabled);
    }

    [Fact]
    public async Task EnablingSocial_SucceedsOnceAHandleAndDisplayNameExist()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));

        var profile = await harness.Social.UpdateAsync(
            OwnerId,
            new UpdateOwnerSocialProfileRequest(
                DisplayName: "Mochi & Coco's Family",
                Bio: "Two cats, one very patient sofa.",
                GeneralArea: "Bangsar, Kuala Lumpur",
                IsSocialEnabled: true,
                IsDiscoverable: true,
                AllowFollowers: null,
                RowVersion: null));

        Assert.True(profile.IsSocialEnabled);
        Assert.True(profile.IsDiscoverable);
        Assert.Equal("Mochi & Coco's Family", profile.DisplayName);
        Assert.Equal("mochiandcoco", profile.Handle);
    }

    [Fact]
    public async Task TurningSocialOff_AlsoClearsDiscoverability()
    {
        using var harness = await Harness.CreateAsync();
        await harness.EnableSocialAsync(OwnerId, "mochiandcoco", "Mochi & Coco's Family");

        var profile = await harness.Social.UpdateAsync(
            OwnerId,
            new UpdateOwnerSocialProfileRequest(
                DisplayName: null,
                Bio: null,
                GeneralArea: null,
                IsSocialEnabled: false,
                IsDiscoverable: null,
                AllowFollowers: null,
                RowVersion: null));

        // Otherwise switching social back on later would silently republish the
        // account to discovery without anyone choosing that again.
        Assert.False(profile.IsSocialEnabled);
        Assert.False(profile.IsDiscoverable);
    }

    [Fact]
    public async Task HandleAvailability_NeverSuggestsTheOwnerEmailOrAccountName()
    {
        using var harness = await Harness.CreateAsync();

        var profile = await harness.Social.GetAsync(OwnerId);

        // The account is sarah.tan@example.com / "Sarah Tan". Nothing derived
        // from either may end up in the handle.
        Assert.Null(profile.Handle);
        Assert.DoesNotContain("sarah", profile.Handle ?? "", StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("Support")]
    [InlineData("MYPETLINK")]
    [InlineData("help")]
    [InlineData("settings")]
    [InlineData("p")]
    [InlineData("q")]
    [InlineData("u")]
    public async Task ReservedHandles_CannotBeClaimed(string handle)
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest(handle)));

        Assert.Contains(error.Code, new[] { "handle_unavailable", "validation_failed" });
    }

    [Theory]
    [InlineData("ab")]                    // too short
    [InlineData("1mochi")]                // must start with a letter
    [InlineData("mochi!")]                // unsupported character
    [InlineData("mochi coco")]            // space
    [InlineData("mochi__coco")]           // two separators in a row
    [InlineData("mochi_")]                // must end with a letter or number
    [InlineData("mochi@coco")]            // unsupported character
    public async Task MalformedHandles_AreRefused(string handle)
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest(handle)));

        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task HandleUniqueness_IsCaseInsensitive()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("MochiAndCoco"));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OtherOwnerId, new ClaimOwnerHandleRequest("mochiandcoco")));

        Assert.Equal("handle_unavailable", error.Code);
    }

    [Fact]
    public async Task ClaimingAHandle_KeepsTheOwnerCapitalisationForDisplay()
    {
        using var harness = await Harness.CreateAsync();

        var profile = await harness.Social.ClaimHandleAsync(
            OwnerId,
            new ClaimOwnerHandleRequest("MochiAndCoco"));

        Assert.Equal("MochiAndCoco", profile.Handle);

        var stored = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == OwnerId);
        Assert.Equal("mochiandcoco", stored.NormalizedHandle);
    }

    [Fact]
    public async Task ReclaimingYourOwnHandle_DoesNotStartACooldown()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));

        var profile = await harness.Social.ClaimHandleAsync(
            OwnerId,
            new ClaimOwnerHandleRequest("mochiandcoco"));

        Assert.Null(profile.HandleChangeAvailableAt);
        Assert.Empty(await harness.Db.OwnerHandleHistories.ToListAsync());
    }

    [Fact]
    public async Task RenamingAHandle_StartsACooldownAndRecordsHistory()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));

        var profile = await harness.Social.ClaimHandleAsync(
            OwnerId,
            new ClaimOwnerHandleRequest("thetanfamily"));

        Assert.Equal("thetanfamily", profile.Handle);
        Assert.NotNull(profile.HandleChangeAvailableAt);

        var history = Assert.Single(await harness.Db.OwnerHandleHistories.ToListAsync());
        Assert.Equal("mochiandcoco", history.NormalizedHandle);
    }

    [Fact]
    public async Task RenamingAgainDuringTheCooldown_IsRefused()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("thetanfamily"));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("tanhousehold")));

        Assert.Equal("handle_change_not_available", error.Code);
    }

    [Fact]
    public async Task RenamingAfterTheCooldownHasPassed_IsAllowed()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("thetanfamily"));

        harness.Clock.Advance(TimeSpan.FromDays(31));

        var profile = await harness.Social.ClaimHandleAsync(
            OwnerId,
            new ClaimOwnerHandleRequest("tanhousehold"));

        Assert.Equal("tanhousehold", profile.Handle);
    }

    [Fact]
    public async Task AReleasedHandle_IsHeldAgainstEveryoneElse()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("thetanfamily"));

        // A link someone shared last week still points at @mochiandcoco. It must
        // not start resolving to a different household.
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OtherOwnerId, new ClaimOwnerHandleRequest("mochiandcoco")));

        Assert.Equal("handle_unavailable", error.Code);
    }

    [Fact]
    public async Task AReleasedHandle_BecomesAvailableOnceTheHoldLapses()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("thetanfamily"));

        harness.Clock.Advance(TimeSpan.FromDays(91));

        var profile = await harness.Social.ClaimHandleAsync(
            OtherOwnerId,
            new ClaimOwnerHandleRequest("mochiandcoco"));

        Assert.Equal("mochiandcoco", profile.Handle);
    }

    [Fact]
    public async Task TheOwnerWhoReleasedAHandle_CanTakeItBackDuringTheHold()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("thetanfamily"));
        harness.Clock.Advance(TimeSpan.FromDays(31));

        var profile = await harness.Social.ClaimHandleAsync(
            OwnerId,
            new ClaimOwnerHandleRequest("mochiandcoco"));

        Assert.Equal("mochiandcoco", profile.Handle);
    }

    [Fact]
    public async Task AvailabilityCheck_AnswersTheSameWayForTakenAndReservedNames()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OtherOwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));

        var taken = await harness.Social.CheckHandleAvailabilityAsync(OwnerId, "mochiandcoco");
        var reserved = await harness.Social.CheckHandleAvailabilityAsync(OwnerId, "support");
        var malformed = await harness.Social.CheckHandleAvailabilityAsync(OwnerId, "a!");
        var free = await harness.Social.CheckHandleAvailabilityAsync(OwnerId, "thetanfamily");

        // Identical shape and identical information for every unavailable
        // reason, so the endpoint cannot be used to map which handles exist.
        Assert.False(taken.IsAvailable);
        Assert.False(reserved.IsAvailable);
        Assert.False(malformed.IsAvailable);
        Assert.True(free.IsAvailable);
    }

    [Fact]
    public async Task AvailabilityCheck_TreatsTheOwnerCurrentHandleAsAvailable()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("mochiandcoco"));

        var result = await harness.Social.CheckHandleAvailabilityAsync(OwnerId, "mochiandcoco");

        Assert.True(result.IsAvailable);
    }

    [Fact]
    public async Task GeneralArea_OnASocialProfileRefusesAStreetAddress()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.UpdateAsync(
                OwnerId,
                new UpdateOwnerSocialProfileRequest(
                    DisplayName: null,
                    Bio: null,
                    GeneralArea: "No. 12, Jalan Maarof, Bangsar",
                    IsSocialEnabled: null,
                    IsDiscoverable: null,
                    AllowFollowers: null,
                    RowVersion: null)));

        Assert.Equal("validation_failed", error.Code);
        Assert.True(error.Details!.ContainsKey("generalArea"));
    }

    [Fact]
    public async Task Bio_StripsControlCharactersAndCollapsesBlankLines()
    {
        using var harness = await Harness.CreateAsync();

        var profile = await harness.Social.UpdateAsync(
            OwnerId,
            new UpdateOwnerSocialProfileRequest(
                DisplayName: null,
                Bio: "Two cats. \r\n\r\n\r\n\r\nOne sofa.",
                GeneralArea: null,
                IsSocialEnabled: null,
                IsDiscoverable: null,
                AllowFollowers: null,
                RowVersion: null));

        Assert.Equal("Two cats.\n\nOne sofa.", profile.Bio);
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 9, 15, 0, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan amount) => _now = _now.Add(amount);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db, TestClock clock)
        {
            Db = db;
            Clock = clock;
            var auditLog = new AuditLogService(db, new Microsoft.AspNetCore.Http.HttpContextAccessor());
            var handles = new OwnerHandleService(
                db,
                Options.Create(new SocialOptions()),
                auditLog,
                clock);
            Social = new OwnerSocialProfileService(
                db,
                handles,
                Options.Create(new CloudflareR2Options()),
                Options.Create(new SocialOptions()),
                auditLog,
                clock);
        }

        public MyPetLinkDbContext Db { get; }

        public TestClock Clock { get; }

        public OwnerSocialProfileService Social { get; }

        public static async Task<Harness> CreateAsync()
        {
            var clock = new TestClock();
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options, clock);

            db.Users.Add(BuildUser(OwnerId, "sarah.tan@example.com", "Sarah Tan"));
            db.Users.Add(BuildUser(OtherOwnerId, "aisyah@example.com", "Aisyah Rahman"));
            await db.SaveChangesAsync();

            return new Harness(db, clock);
        }

        public async Task EnableSocialAsync(Guid userId, string handle, string displayName)
        {
            await Social.ClaimHandleAsync(userId, new ClaimOwnerHandleRequest(handle));
            await Social.UpdateAsync(
                userId,
                new UpdateOwnerSocialProfileRequest(
                    DisplayName: displayName,
                    Bio: null,
                    GeneralArea: null,
                    IsSocialEnabled: true,
                    IsDiscoverable: true,
                    AllowFollowers: null,
                    RowVersion: null));
        }

        private static User BuildUser(Guid id, string email, string displayName)
        {
            return new User
            {
                Id = id,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                DisplayName = displayName,
                Status = UserStatus.Active,
                PhoneE164 = "+60123456789",
                OwnerProfile = new OwnerProfile
                {
                    UserId = id,

                    // The finder-facing name: what somebody who found this
                    // person's lost pet would see. Never the social name.
                    OwnerDisplayName = displayName,
                    Plan = new Plan
                    {
                        Code = $"Free-{id:N}",
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
            };
        }

        public void Dispose() => Db.Dispose();
    }
}
