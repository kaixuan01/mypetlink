using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The social foundation's guarantees that only a real database can prove.
///
/// EF InMemory enforces none of this: it ignores unique indexes, filtered
/// indexes and check constraints, so a handle collision or a duplicate follow
/// would pass there and fail in production. Everything here therefore runs
/// against SQL Server, and skips when none is available.
/// </summary>
public sealed class SocialFoundationRelationalTests
{
    private static readonly Guid AliceId = Guid.Parse("e1111111-1111-1111-1111-111111111111");
    private static readonly Guid BobId = Guid.Parse("e2222222-2222-2222-2222-222222222222");
    private static readonly Guid CarolId = Guid.Parse("e3333333-3333-3333-3333-333333333333");
    private static readonly Guid MochiId = Guid.Parse("e4444444-4444-4444-4444-444444444444");

    [RelationalFact]
    public async Task TwoAccountsClaimingTheSameHandleAtOnce_LeaveExactlyOneHolder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            await seed.SaveChangesAsync();
        }

        // Both pass the availability pre-check, then race on SaveChanges. The
        // unique index is what decides, not the order the checks ran in.
        var results = await Task.WhenAll(
            ClaimAsync(scope, AliceId, "mochiandcoco"),
            ClaimAsync(scope, BobId, "mochiandcoco"));

        Assert.Equal(1, results.Count(success => success));

        await using var verify = scope.NewContext();
        var holders = await verify.OwnerSocialProfiles
            .Where(profile => profile.NormalizedHandle == "mochiandcoco")
            .ToListAsync();

        Assert.Single(holders);
    }

    [RelationalFact]
    public async Task AHandleDifferingOnlyInCase_CannotBeInsertedTwice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            seed.OwnerSocialProfiles.Add(new OwnerSocialProfile
            {
                UserId = AliceId,
                Handle = "MochiAndCoco",
                NormalizedHandle = "mochiandcoco"
            });
            await seed.SaveChangesAsync();
        }

        await using var context = scope.NewContext();
        context.OwnerSocialProfiles.Add(new OwnerSocialProfile
        {
            UserId = BobId,
            Handle = "MOCHIANDCOCO",
            NormalizedHandle = "mochiandcoco"
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task ManyAccountsWithoutAHandle_DoNotCollideOnNull()
    {
        // The handle index is filtered for exactly this reason: most accounts
        // will never choose one, and a plain unique index would let only a
        // single account exist without a handle.
        await using var scope = await RelationalDatabase.CreateAsync();

        await using var context = scope.NewContext();
        SeedUsers(context);
        context.OwnerSocialProfiles.Add(OwnerSocialProfileFactory.CreateDisabled(AliceId));
        context.OwnerSocialProfiles.Add(OwnerSocialProfileFactory.CreateDisabled(BobId));
        context.OwnerSocialProfiles.Add(OwnerSocialProfileFactory.CreateDisabled(CarolId));

        await context.SaveChangesAsync();

        Assert.Equal(3, await context.OwnerSocialProfiles.CountAsync());
    }

    [RelationalFact]
    public async Task AnAccountCannotFollowItself()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        await using var context = scope.NewContext();
        SeedUsers(context);
        await context.SaveChangesAsync();

        context.OwnerFollows.Add(new OwnerFollow
        {
            FollowerUserId = AliceId,
            FollowedUserId = AliceId
        });

        // The check constraint holds even if a service ever forgets to.
        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task TheSameFollowCannotBeRecordedTwice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            seed.OwnerFollows.Add(new OwnerFollow
            {
                FollowerUserId = AliceId,
                FollowedUserId = BobId
            });
            await seed.SaveChangesAsync();
        }

        await using var context = scope.NewContext();
        context.OwnerFollows.Add(new OwnerFollow
        {
            FollowerUserId = AliceId,
            FollowedUserId = BobId
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task AnAccountCannotBlockItself()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        await using var context = scope.NewContext();
        SeedUsers(context);
        await context.SaveChangesAsync();

        context.OwnerBlocks.Add(new OwnerBlock
        {
            BlockerUserId = AliceId,
            BlockedUserId = AliceId
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task OneAccountCannotLikeTheSameMomentTwice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid momentId;

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            SeedPet(seed);
            var moment = SeedMoment(seed);
            await seed.SaveChangesAsync();
            momentId = moment.Id;

            seed.MomentLikes.Add(new MomentLike { MomentId = momentId, UserId = BobId });
            await seed.SaveChangesAsync();
        }

        await using var context = scope.NewContext();
        context.MomentLikes.Add(new MomentLike { MomentId = momentId, UserId = BobId });

        // This index is the whole idempotency story for liking: a double tap or
        // a retry resolves here, not in a read-then-write.
        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task APetCannotBeAddedToTheSameMomentTwice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid momentId;

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            SeedPet(seed);
            var moment = SeedMoment(seed);
            await seed.SaveChangesAsync();
            momentId = moment.Id;

            seed.MomentPets.Add(new MomentPet
            {
                MomentId = momentId,
                PetId = MochiId
            });
            await seed.SaveChangesAsync();
        }

        await using var context = scope.NewContext();
        context.MomentPets.Add(new MomentPet
        {
            MomentId = momentId,
            PetId = MochiId
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task ThePrimaryPetIsSimplyTheMembershipRowMatchingTheMoment()
    {
        // MomentPets carries no "primary" marker, so the contradictory state
        // PetMemory.PetId = Mochi alongside MomentPet(Coco, IsPrimary = true)
        // is not merely prevented — it cannot be expressed at all.
        await using var scope = await RelationalDatabase.CreateAsync();
        var secondPetId = Guid.Parse("e5555555-5555-5555-5555-555555555555");

        await using var context = scope.NewContext();
        SeedUsers(context);
        SeedPet(context);
        SeedPet(context, secondPetId, "Coco");
        var moment = SeedMoment(context);
        await context.SaveChangesAsync();

        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = MochiId });
        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = secondPetId });
        await context.SaveChangesAsync();

        var primaryPetId = await context.PetMemories
            .Where(item => item.Id == moment.Id)
            .Select(item => item.PetId)
            .SingleAsync();
        var members = await context.MomentPets
            .Where(item => item.MomentId == moment.Id)
            .Select(item => item.PetId)
            .ToListAsync();

        Assert.Equal(MochiId, primaryPetId);
        Assert.Contains(primaryPetId, members);
        Assert.Equal(2, members.Count);
    }

    [RelationalFact]
    public async Task TwoPetsMayBelongToTheSameMoment()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var secondPetId = Guid.Parse("e6666666-6666-6666-6666-666666666666");

        await using var context = scope.NewContext();
        SeedUsers(context);
        SeedPet(context);
        SeedPet(context, secondPetId, "Coco");
        var moment = SeedMoment(context);
        await context.SaveChangesAsync();

        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = MochiId });
        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = secondPetId });
        await context.SaveChangesAsync();

        Assert.Equal(2, await context.MomentPets.CountAsync(item => item.MomentId == moment.Id));
    }

    [RelationalFact]
    public async Task TheSystemHandleReservations_AreSeededByTheMigrationModel()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var context = scope.NewContext();

        var reserved = await context.OwnerHandleReservations
            .Where(item => item.Reason == OwnerHandleReservationReason.System)
            .Select(item => item.NormalizedHandle)
            .ToListAsync();

        Assert.Contains("admin", reserved);
        Assert.Contains("support", reserved);
        Assert.Contains("mypetlink", reserved);
        Assert.Contains("u", reserved);
        Assert.Equal(OwnerHandleRules.SystemReservations.Count, reserved.Count);
    }

    [RelationalFact]
    public async Task MomentSubjectRows_AreRemovedWithTheirMoment()
    {
        await using var scope = await RelationalDatabase.CreateAsync();

        await using var context = scope.NewContext();
        SeedUsers(context);
        SeedPet(context);
        var moment = SeedMoment(context);
        await context.SaveChangesAsync();

        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = MochiId });
        await context.SaveChangesAsync();

        context.PetMemories.Remove(moment);
        await context.SaveChangesAsync();

        // A subject row has no meaning without its Moment, so this is the one
        // place a cascade is both safe and correct.
        Assert.Empty(await context.MomentPets.ToListAsync());
    }

    [RelationalFact]
    public async Task TheSameAccountCannotLikeOneMomentTwice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid momentId;

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            SeedPet(seed);
            var moment = SeedMoment(seed);
            await seed.SaveChangesAsync();
            momentId = moment.Id;

            seed.MomentLikes.Add(new MomentLike { MomentId = momentId, UserId = BobId });
            await seed.SaveChangesAsync();
        }

        await using var context = scope.NewContext();
        context.MomentLikes.Add(new MomentLike { MomentId = momentId, UserId = BobId });

        // The unique index is the authority on "already liked". Application
        // checks are an optimisation in front of it, never the rule itself.
        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task TwoSimultaneousLikes_LeaveOneRowAndNoError()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid momentId;

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            SeedSocialProfiles(seed);
            SeedPet(seed);
            var moment = SeedMoment(seed);
            await seed.SaveChangesAsync();
            momentId = moment.Id;
        }

        // Both callers pass the "already liked?" check, then race on insert. The
        // loser must see a liked Moment, not a failure: it asked for a state and
        // that state is what it got.
        await Task.WhenAll(
            LikeAsync(scope, BobId, momentId),
            LikeAsync(scope, BobId, momentId));

        await using var verify = scope.NewContext();
        Assert.Single(await verify.MomentLikes.Where(like => like.MomentId == momentId).ToListAsync());
    }

    [RelationalFact]
    public async Task LikeCountsComeFromTheRows_WithNoCounterToDrift()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid momentId;

        await using (var seed = scope.NewContext())
        {
            SeedUsers(seed);
            SeedSocialProfiles(seed);
            SeedPet(seed);
            var moment = SeedMoment(seed);
            await seed.SaveChangesAsync();
            momentId = moment.Id;

            seed.MomentLikes.Add(new MomentLike { MomentId = momentId, UserId = BobId });
            seed.MomentLikes.Add(new MomentLike { MomentId = momentId, UserId = CarolId });
            await seed.SaveChangesAsync();
        }

        await using var context = scope.NewContext();
        var likes = new MomentLikeService(context);

        var afterOneLeaves = await likes.UnlikeAsync(BobId, momentId);

        Assert.Equal(1, afterOneLeaves.LikeCount);
        Assert.Equal(
            1,
            await context.MomentLikes.CountAsync(like => like.MomentId == momentId));
    }

    private static async Task LikeAsync(RelationalScope scope, Guid userId, Guid momentId)
    {
        await using var context = scope.NewContext();
        var likes = new MomentLikeService(context);
        await likes.LikeAsync(userId, momentId);
    }

    /// <summary>Social profiles for the seeded accounts, which social reads require.</summary>
    private static void SeedSocialProfiles(MyPetLinkDbContext context)
    {
        foreach (var (id, handle) in new[]
        {
            (AliceId, "alicefamily"),
            (BobId, "bobfamily"),
            (CarolId, "carolfamily")
        })
        {
            context.OwnerSocialProfiles.Add(new OwnerSocialProfile
            {
                UserId = id,
                Handle = handle,
                NormalizedHandle = handle,
                DisplayName = handle,
                NormalizedDisplayName = handle,
                IsSocialEnabled = true,
                AllowFollowers = true
            });
        }
    }

    private static async Task<bool> ClaimAsync(RelationalScope scope, Guid userId, string handle)
    {
        await using var context = scope.NewContext();
        var auditLog = new AuditLogService(context, new HttpContextAccessor());
        var handles = new OwnerHandleService(context, Options.Create(new SocialOptions()), auditLog);
        var social = new OwnerSocialProfileService(
            context,
            handles,
            Options.Create(new Api.Storage.CloudflareR2Options()),
            Options.Create(new SocialOptions()),
            auditLog);

        try
        {
            await social.ClaimHandleAsync(userId, new ClaimOwnerHandleRequest(handle));
            return true;
        }
        catch (ApiException exception) when (exception.Code == "handle_unavailable")
        {
            return false;
        }
    }

    /// <summary>
    /// Uses the Free plan the model already seeds. Creating another one would
    /// collide on the unique plan code, which is a real constraint worth
    /// respecting in a test rather than working around.
    /// </summary>
    private static void SeedUsers(MyPetLinkDbContext context)
    {
        var planId = context.Plans.Single(item => item.Code == "Free").Id;

        foreach (var (id, email, name) in new[]
        {
            (AliceId, "alice@example.com", "Alice"),
            (BobId, "bob@example.com", "Bob"),
            (CarolId, "carol@example.com", "Carol")
        })
        {
            context.Users.Add(new User
            {
                Id = id,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                DisplayName = name,
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = id,
                    OwnerDisplayName = name,
                    PlanId = planId
                }
            });
        }
    }

    private static void SeedPet(MyPetLinkDbContext context, Guid? petId = null, string name = "Mochi")
    {
        var id = petId ?? MochiId;
        context.Pets.Add(new Pet
        {
            Id = id,
            OwnerUserId = AliceId,
            Slug = $"{name.ToLowerInvariant()}-{id:N}"[..20],
            Name = name,
            Species = "Cat"
        });
    }

    private static PetMemory SeedMoment(MyPetLinkDbContext context)
    {
        var moment = new PetMemory
        {
            PetId = MochiId,
            AuthorUserId = AliceId,
            Title = "Beach day",
            MomentDate = new DateOnly(2026, 8, 21),
            Type = "Memory",
            Visibility = MemoryVisibility.Public,
            PublishedAt = DateTimeOffset.UtcNow
        };
        context.PetMemories.Add(moment);
        return moment;
    }
}
