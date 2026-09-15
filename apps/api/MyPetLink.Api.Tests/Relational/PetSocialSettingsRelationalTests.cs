using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Per-pet Social consent against a real database.
///
/// The concurrency behaviour cannot be proved anywhere else: the in-memory
/// provider does not enforce a rowversion token, so a conflict test there would
/// pass whether or not the guard exists. What is being protected is specific —
/// a stale browser tab must not be able to put a pet back into Social after the
/// owner has taken it out somewhere else.
/// </summary>
public sealed class PetSocialSettingsRelationalTests
{
    private static readonly Guid AliceId = Guid.Parse("a1000000-0000-4000-8000-000000000001");
    private static readonly Guid BobId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private static readonly Guid MochiId = Guid.Parse("a1000000-0000-4000-8000-00000000000a");

    [RelationalFact]
    public async Task AStaleTabCannotReinstateAConsentTheOwnerJustWithdrew()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        // Tab one reads the pet.
        await using var readContext = scope.NewContext();
        var list = await NewService(readContext).ListAsync(AliceId);
        var stale = list.Pets.Single(item => item.PetId == MochiId).RowVersion;

        Assert.NotEqual("", stale);

        // Tab two withdraws it.
        await using (var withdrawContext = scope.NewContext())
        {
            await NewService(withdrawContext).UpdateAsync(
                AliceId, MochiId, new UpdatePetSocialSettingsRequest(false, null, null));
        }

        // Tab one, still holding the old token, tries to switch it back on.
        await using var conflictContext = scope.NewContext();
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            NewService(conflictContext).UpdateAsync(
                AliceId, MochiId, new UpdatePetSocialSettingsRequest(true, null, stale)));

        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);

        await using var verifyContext = scope.NewContext();
        var stored = await verifyContext.PetSocialProfiles
            .AsNoTracking()
            .SingleAsync(item => item.PetId == MochiId);

        Assert.False(stored.IsSocialEnabled);
        Assert.Null(stored.ConsentedByUserId);
    }

    [RelationalFact]
    public async Task AFreshTokenSucceeds_SoTheGuardIsNotSimplyRefusingEverything()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        await using var context = scope.NewContext();
        var service = NewService(context);

        var list = await service.ListAsync(AliceId);
        var current = list.Pets.Single(item => item.PetId == MochiId).RowVersion;

        var response = await service.UpdateAsync(
            AliceId, MochiId, new UpdatePetSocialSettingsRequest(false, null, current));

        Assert.False(response.IsSocialEnabled);
    }

    [RelationalFact]
    public async Task OwnerACannotChangeOwnerBsPet_AgainstARealDatabase()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        await using var context = scope.NewContext();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            NewService(context).UpdateAsync(
                BobId, MochiId, new UpdatePetSocialSettingsRequest(false, null, null)));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);

        await using var verifyContext = scope.NewContext();
        Assert.True(await verifyContext.PetSocialProfiles
            .AsNoTracking()
            .Where(item => item.PetId == MochiId)
            .Select(item => item.IsSocialEnabled)
            .SingleAsync());
    }

    /// <summary>
    /// The consent stamp is what a change of ownership invalidates, so it has
    /// to survive a round trip through the database as itself — not as a
    /// default, and not as the owner it happens to match today.
    /// </summary>
    [RelationalFact]
    public async Task TheConsentStampPersistsAndIsClearedOnWithdrawal()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        await using (var context = scope.NewContext())
        {
            await NewService(context).UpdateAsync(
                AliceId, MochiId, new UpdatePetSocialSettingsRequest(false, null, null));
        }

        await using (var context = scope.NewContext())
        {
            Assert.Null(await context.PetSocialProfiles
                .AsNoTracking()
                .Where(item => item.PetId == MochiId)
                .Select(item => item.ConsentedByUserId)
                .SingleAsync());

            await NewService(context).UpdateAsync(
                AliceId, MochiId, new UpdatePetSocialSettingsRequest(true, true, null));
        }

        await using (var context = scope.NewContext())
        {
            var stored = await context.PetSocialProfiles
                .AsNoTracking()
                .SingleAsync(item => item.PetId == MochiId);

            Assert.Equal(AliceId, stored.ConsentedByUserId);
            Assert.True(stored.IsDiscoverable);

            Assert.True(await context.Pets
                .SociallyVisible()
                .AnyAsync(pet => pet.Id == MochiId));
        }
    }

    // ---- plumbing -------------------------------------------------------

    private static PetSocialSettingsService NewService(MyPetLinkDbContext context)
    {
        return new PetSocialSettingsService(
            context,
            Options.Create(new CloudflareR2Options()),
            new AuditLogService(context, new HttpContextAccessor()));
    }

    private static async Task SeedAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
        var planId = context.Plans.Single(item => item.Code == "Free").Id;

        AddOwner(context, AliceId, "alice", planId);
        AddOwner(context, BobId, "bob", planId);
        await context.SaveChangesAsync();

        context.Pets.Add(new Pet
        {
            Id = MochiId,
            OwnerUserId = AliceId,
            Slug = "mochi-pubmochi",
            Name = "Mochi",
            Species = "Cat",
            PublicProfile = new PetPublicProfile
            {
                PetId = MochiId,
                PublicCode = "pubmochi",
                SlugSnapshot = "mochi-pubmochi",
                IsPublicProfileEnabled = true,
                ShowMoments = true
            },
            SocialProfile = new PetSocialProfile
            {
                PetId = MochiId,
                IsSocialEnabled = true,
                IsDiscoverable = true,
                ConsentedByUserId = AliceId
            }
        });

        await context.SaveChangesAsync();
    }

    private static void AddOwner(
        MyPetLinkDbContext context,
        Guid id,
        string handle,
        Guid planId)
    {
        context.Users.Add(new User
        {
            Id = id,
            Email = $"{handle}@example.com",
            NormalizedEmail = $"{handle}@example.com".ToUpperInvariant(),
            DisplayName = handle,
            Status = UserStatus.Active,
            OwnerProfile = new OwnerProfile
            {
                UserId = id,
                OwnerDisplayName = handle,
                PlanId = planId
            },
            SocialProfile = new OwnerSocialProfile
            {
                UserId = id,
                Handle = handle,
                NormalizedHandle = handle,
                DisplayName = $"The {handle} Family",
                NormalizedDisplayName = $"the {handle} family",
                IsSocialEnabled = true,
                IsDiscoverable = true,
                AllowFollowers = true
            }
        });
    }
}
