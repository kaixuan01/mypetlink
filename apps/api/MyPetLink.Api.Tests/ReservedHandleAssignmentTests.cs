using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Reserved handles, from both directions.
///
/// The reported symptom was that saving <c>MyPetLink</c> on the owner's own
/// settings screen answered "That handle isn't available." The first group here
/// pins that behaviour down as CORRECT and keeps it that way — @mypetlink is a
/// brand identity, and an owner claiming it could pass themselves off as us.
///
/// The second group covers what was actually missing: a way for the official
/// account to hold it at all. That path is an administrator's, behind its own
/// capability, and it is deliberately a different door — the owner's endpoint
/// has no parameter that could ever reach it.
/// </summary>
public sealed class ReservedHandleAssignmentTests
{
    private static readonly Guid OwnerId = Guid.Parse("d1000000-0000-4000-8000-000000000001");
    private static readonly Guid OtherOwnerId = Guid.Parse("d1000000-0000-4000-8000-000000000002");
    private static readonly Guid AdminId = Guid.Parse("d1000000-0000-4000-8000-0000000000ad");

    // ---- the reported failure, kept failing --------------------------------

    [Theory]
    [InlineData("MyPetLink")]
    [InlineData("mypetlink")]
    [InlineData("MYPETLINK")]
    [InlineData("  MyPetLink  ")]
    [InlineData("@MyPetLink")]
    public async Task NormalOwner_CannotClaim_MyPetLink(string attempt)
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest(attempt)));

        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);
        Assert.Equal("handle_unavailable", error.Code);
        Assert.Equal("That handle isn't available. Try another one.", error.Message);

        var profile = await harness.Profile(OwnerId);
        Assert.Null(profile.NormalizedHandle);
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("api")]
    [InlineData("auth")]
    [InlineData("www")] // not reserved by name, but proves the list is the authority
    [InlineData("login")]
    [InlineData("support")]
    [InlineData("official")]
    [InlineData("linko")]
    public async Task NormalOwner_CannotClaimReservedHandles(string attempt)
    {
        using var harness = await Harness.CreateAsync();

        var reserved = OwnerHandleRules.IsSystemReserved(attempt);

        if (!reserved)
        {
            // "www" is not on the list today. The test still asserts the rule
            // rather than the list: whatever IsSystemReserved says, claiming
            // must agree with it.
            await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest(attempt));
            Assert.Equal(attempt, (await harness.Profile(OwnerId)).NormalizedHandle);
            return;
        }

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest(attempt)));
    }

    [Fact]
    public async Task ChangingCase_DoesNotBypassReservation()
    {
        using var harness = await Harness.CreateAsync();

        foreach (var attempt in new[] { "MyPetLink", "mYpEtLiNk", "MyPetLINK" })
        {
            Assert.Equal("mypetlink", OwnerHandleRules.Normalize(attempt));
            await Assert.ThrowsAsync<ApiException>(() =>
                harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest(attempt)));
        }
    }

    [Fact]
    public async Task SeparatorVariants_AreTheirOwnNames_AndTheListDecides()
    {
        using var harness = await Harness.CreateAsync();

        // "my.pet.link" is a different string from "mypetlink"; normalization
        // only lower-cases. This records what the rules actually do rather than
        // implying a folding step that does not exist.
        Assert.Equal("my.pet.link", OwnerHandleRules.Normalize("My.Pet.Link"));
        Assert.False(OwnerHandleRules.IsSystemReserved("my.pet.link"));
        Assert.True(OwnerHandleRules.IsSystemReserved("my-pet-link"));

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("My-Pet-Link")));
    }

    [Fact]
    public async Task ReservedHandle_RemainsUnavailableThroughAvailabilityEndpoint()
    {
        using var harness = await Harness.CreateAsync();

        foreach (var attempt in new[] { "MyPetLink", "mypetlink", "admin", "support" })
        {
            var response = await harness.Social.CheckHandleAvailabilityAsync(OwnerId, attempt);
            Assert.False(response.IsAvailable);
        }
    }

    [Fact]
    public async Task ReservedHandle_StaysUnavailableToOwners_EvenAfterItIsAssigned()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        // A second owner must still be refused, and for the same reason as
        // before: the System reservation is what protects the name, and it
        // outlives the assignment.
        var availability = await harness.Social.CheckHandleAvailabilityAsync(OtherOwnerId, "mypetlink");
        Assert.False(availability.IsAvailable);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OtherOwnerId, new ClaimOwnerHandleRequest("MyPetLink")));
    }

    [Fact]
    public async Task TheOwnerEndpointHasNoWayToReachTheAdminPath()
    {
        // A contract test, not a behaviour one: the self-service request type
        // must carry nothing that could widen what it is allowed to do.
        var fields = typeof(ClaimOwnerHandleRequest)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();

        Assert.Equal(["Handle"], fields);

        foreach (var forbidden in new[] { "Force", "Reserved", "System", "IsOfficial", "AllowReserved" })
        {
            Assert.DoesNotContain(forbidden, fields);
        }
    }

    // ---- the administrator's path ------------------------------------------

    [Fact]
    public async Task Admin_CanAssignReservedHandleToSocialProfile()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        var profile = await harness.Profile(OwnerId);
        Assert.Equal("mypetlink", profile.NormalizedHandle);
        Assert.Equal("MyPetLink", profile.Handle);
    }

    [Fact]
    public async Task Assignment_NormalizesHandle()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "  @MyPetLink  ", confirmReassign: false);

        var profile = await harness.Profile(OwnerId);
        Assert.Equal("mypetlink", profile.NormalizedHandle);

        // Display casing is preserved from what the administrator typed, with
        // the "@" and whitespace stripped.
        Assert.Equal("MyPetLink", profile.Handle);
    }

    [Fact]
    public async Task Assignment_RefusesAHandleThatIsNotReserved()
    {
        using var harness = await Harness.CreateAsync();

        // This route exists only for protected names. Handing out an ordinary
        // handle here would be a way around the rename cooldown and the
        // release hold that every owner is subject to.
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Handles.AssignReservedHandleAsync(
                AdminId, OwnerId, "tanfamily", confirmReassign: false));

        Assert.Equal(StatusCodes.Status400BadRequest, error.StatusCode);
        Assert.Null((await harness.Profile(OwnerId)).NormalizedHandle);
    }

    [Fact]
    public async Task Assignment_PreservesReservedSystemStatus()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        var reservation = await harness.Db.OwnerHandleReservations
            .AsNoTracking()
            .SingleAsync(item => item.NormalizedHandle == "mypetlink");

        // Untouched, permanent, and still a System reservation. If this were
        // cleared or downgraded, the day the official profile gave the handle
        // up the brand name would fall into the public pool.
        Assert.Equal(OwnerHandleReservationReason.System, reservation.Reason);
        Assert.Null(reservation.HeldUntil);
        Assert.True(OwnerHandleRules.IsSystemReserved("mypetlink"));
    }

    [Fact]
    public async Task ReservedHandle_CannotBeAssignedToTwoProfiles()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Handles.AssignReservedHandleAsync(
                AdminId, OtherOwnerId, "MyPetLink", confirmReassign: false));

        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);
        Assert.Equal("reserved_handle_assigned", error.Code);

        Assert.Equal("mypetlink", (await harness.Profile(OwnerId)).NormalizedHandle);
        Assert.Null((await harness.Profile(OtherOwnerId)).NormalizedHandle);
    }

    [Fact]
    public async Task ReservedHandle_CanBeReassignedWhenExplicitlyConfirmed()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OtherOwnerId, "MyPetLink", confirmReassign: true);

        // Exactly one holder, and the previous holder is left with no handle
        // rather than a duplicate.
        Assert.Null((await harness.Profile(OwnerId)).NormalizedHandle);
        Assert.Equal("mypetlink", (await harness.Profile(OtherOwnerId)).NormalizedHandle);

        Assert.Equal(1, await harness.Db.OwnerSocialProfiles
            .CountAsync(item => item.NormalizedHandle == "mypetlink"));
    }

    [Fact]
    public async Task ReassigningTheSameHandleToTheSameProfile_IsANoOp()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);
        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        Assert.Equal("mypetlink", (await harness.Profile(OwnerId)).NormalizedHandle);

        // One assignment, one audit row. A repeat must not manufacture history.
        Assert.Equal(1, await harness.Db.AuditLogs
            .CountAsync(item => item.Action == "OwnerSocialReservedHandleAssigned"));
    }

    [Fact]
    public async Task Assignment_RefusesAnOwnerWithNoSocialProfileRow()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Handles.AssignReservedHandleAsync(
                AdminId, Guid.NewGuid(), "MyPetLink", confirmReassign: false));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
    }

    // ---- history, cooldown and the released name ---------------------------

    [Fact]
    public async Task Assignment_BypassesTheOwnerRenameCooldown()
    {
        using var harness = await Harness.CreateAsync();

        // The cooldown is driven by handle HISTORY, and history is only written
        // when a handle replaces another one. So the first claim is free and it
        // takes a rename to start the clock.
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("linkofamily"));
        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("linkohome"));

        // The owner themselves is now inside the 30-day cooldown.
        var blocked = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("linkohouse")));
        Assert.Equal("handle_change_not_available", blocked.Code);

        // The administrator is not. A stale cooldown must never be what stops
        // the brand identity being put where it belongs.
        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        Assert.Equal("mypetlink", (await harness.Profile(OwnerId)).NormalizedHandle);
    }

    [Fact]
    public async Task Assignment_WritesHandleHistoryForTheNameGivenUp()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("linkofamily"));
        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        var history = await harness.Db.OwnerHandleHistories
            .AsNoTracking()
            .Where(item => item.UserId == OwnerId)
            .ToListAsync();

        Assert.Contains(history, item => item.NormalizedHandle == "linkofamily");
    }

    [Fact]
    public async Task Assignment_HoldsTheReleasedHandleUnderTheNormalPolicy()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("linkofamily"));
        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        var reservation = await harness.Db.OwnerHandleReservations
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.NormalizedHandle == "linkofamily");

        // The ordinary 90-day hold, so a link shared last week does not start
        // resolving to a stranger.
        Assert.NotNull(reservation);
        Assert.Equal(OwnerHandleReservationReason.Released, reservation!.Reason);
        Assert.NotNull(reservation.HeldUntil);
        Assert.Equal(OwnerId, reservation.PreviousUserId);
    }

    [Fact]
    public async Task Assignment_DoesNotEnableSocial()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        // Giving an account a name and publishing it are separate decisions.
        // The admin screen reports this state rather than quietly switching it.
        Assert.False((await harness.Profile(OwnerId)).IsSocialEnabled);

        var view = await harness.Handles.GetOwnerHandleAsync(OwnerId);
        Assert.Equal("MyPetLink", view.Handle);
        Assert.True(view.IsReservedHandle);
        Assert.False(view.IsSocialEnabled);
    }

    // ---- audit --------------------------------------------------------------

    [Fact]
    public async Task AdminAssignment_IsAudited()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Social.ClaimHandleAsync(OwnerId, new ClaimOwnerHandleRequest("linkofamily"));
        await harness.Handles.AssignReservedHandleAsync(
            AdminId, OwnerId, "MyPetLink", confirmReassign: false);

        var entry = await harness.Db.AuditLogs
            .AsNoTracking()
            .SingleAsync(item => item.Action == "OwnerSocialReservedHandleAssigned");

        Assert.Equal(AdminId, entry.ActorId);
        Assert.Equal(ActorType.Admin, entry.ActorType);
        Assert.Contains("linkofamily", entry.OldValue!, StringComparison.Ordinal);
        Assert.Contains("MyPetLink", entry.NewValue!, StringComparison.Ordinal);
        Assert.Contains(OwnerId.ToString(), entry.NewValue!, StringComparison.OrdinalIgnoreCase);

        // The target is named by id. No email, no account name, no pet name.
        Assert.DoesNotContain("@example.com", entry.NewValue!, StringComparison.OrdinalIgnoreCase);
    }

    // ---- the capability ------------------------------------------------------

    [Fact]
    public void TheCapabilityIsInTheCatalogue_AndIsSensitive()
    {
        Assert.Contains(AdminCapabilities.OwnerSocialHandleAssign, AdminCapabilityCatalog.AllKeys);

        var descriptor = AdminCapabilityCatalog.Modules
            .SelectMany(module => module.Capabilities)
            .Single(item => item.Key == AdminCapabilities.OwnerSocialHandleAssign);

        Assert.True(descriptor.IsWriteAccess);
        Assert.True(descriptor.IsSensitive);
    }

    [Fact]
    public void NoBuiltInRoleTemplateGrantsIt_SoItStartsSuperAdminOnly()
    {
        var granting = AdminRoleTemplates.All
            .Where(template => template.Capabilities.Contains(AdminCapabilities.OwnerSocialHandleAssign))
            .Select(template => template.Code)
            .ToArray();

        Assert.Empty(granting);

        // Super Admin holds everything by virtue of GrantsAllCapabilities, which
        // is what makes it the only role that can do this until somebody is
        // granted it deliberately.
        var superAdmin = AdminRoleTemplates.All
            .Single(template => template.Code == AdminRoleTemplates.SuperAdminCode);
        Assert.True(superAdmin.GrantsAllCapabilities);
    }

    // ---- plumbing ------------------------------------------------------------

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            var auditLog = new AuditLogService(db, new HttpContextAccessor());
            Handles = new OwnerHandleService(db, Options.Create(new SocialOptions()), auditLog);
            Social = new OwnerSocialProfileService(
                db,
                Handles,
                Options.Create(new CloudflareR2Options()),
                Options.Create(new SocialOptions()),
                auditLog);
        }

        public MyPetLinkDbContext Db { get; }

        public OwnerHandleService Handles { get; }

        public OwnerSocialProfileService Social { get; }

        public async Task<OwnerSocialProfile> Profile(Guid userId) =>
            await Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == userId);

        public static async Task<Harness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);

            foreach (var (id, name) in new[] { (OwnerId, "owner"), (OtherOwnerId, "other") })
            {
                db.Users.Add(new User
                {
                    Id = id,
                    Email = $"{name}@example.com",
                    NormalizedEmail = $"{name}@example.com".ToUpperInvariant(),
                    DisplayName = name,
                    Status = UserStatus.Active,
                    SocialProfile = OwnerSocialProfileFactory.CreateDisabled(id)
                });
            }

            // The in-memory provider has no seeded data, so the System
            // reservations the migration writes are added here. Without them the
            // database half of the protection would not be under test.
            foreach (var handle in OwnerHandleRules.SystemReservations)
            {
                db.OwnerHandleReservations.Add(new OwnerHandleReservation
                {
                    NormalizedHandle = handle,
                    Reason = OwnerHandleReservationReason.System,
                    HeldUntil = null
                });
            }

            await db.SaveChangesAsync();
            return new Harness(db);
        }

        public void Dispose() => Db.Dispose();
    }
}
