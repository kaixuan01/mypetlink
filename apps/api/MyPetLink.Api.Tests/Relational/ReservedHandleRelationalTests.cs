using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Reserved handle assignment against a real database.
///
/// The race matters here in a way the in-memory provider cannot show: two
/// administrators aiming <c>@mypetlink</c> at two different accounts at the same
/// moment both pass the "is anyone holding this" pre-check, and only a unique
/// index can decide between them. InMemory does not enforce unique indexes, so
/// asserting this anywhere else would assert nothing.
/// </summary>
public sealed class ReservedHandleRelationalTests
{
    private static readonly Guid AdminId = Guid.Parse("e1000000-0000-4000-8000-0000000000ad");
    private static readonly Guid FirstOwnerId = Guid.Parse("e1000000-0000-4000-8000-000000000001");
    private static readonly Guid SecondOwnerId = Guid.Parse("e1000000-0000-4000-8000-000000000002");

    [RelationalFact]
    public async Task TwoAdminsAssigningTheSameReservedHandle_LeaveExactlyOneHolder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        // Both contexts read the world before either writes, which is what makes
        // this a race rather than two sequential assignments.
        await using var firstContext = scope.NewContext();
        await using var secondContext = scope.NewContext();

        var first = NewService(firstContext);
        var second = NewService(secondContext);

        var firstTask = first.AssignReservedHandleAsync(
            AdminId, FirstOwnerId, "MyPetLink", confirmReassign: false);
        var secondTask = second.AssignReservedHandleAsync(
            AdminId, SecondOwnerId, "MyPetLink", confirmReassign: false);

        var outcomes = await Task.WhenAll(
            Capture(firstTask),
            Capture(secondTask));

        var succeeded = outcomes.Count(item => item);

        // One winner. The loser may fail on the pre-check or on the unique
        // index depending on interleaving; either way it must not end up
        // holding the handle too.
        Assert.Equal(1, succeeded);

        await using var verify = scope.NewContext();
        var holders = await verify.OwnerSocialProfiles
            .AsNoTracking()
            .Where(item => item.NormalizedHandle == "mypetlink")
            .Select(item => item.UserId)
            .ToListAsync();

        Assert.Single(holders);
    }

    /// <summary>
    /// The database is the final authority, not the pre-check. This drives the
    /// unique index directly to prove it is actually there and enforced.
    /// </summary>
    [RelationalFact]
    public async Task TheHandleUniqueIndexIsEnforcedByTheDatabase()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        await using var context = scope.NewContext();

        var first = await context.OwnerSocialProfiles.SingleAsync(item => item.UserId == FirstOwnerId);
        var second = await context.OwnerSocialProfiles.SingleAsync(item => item.UserId == SecondOwnerId);

        first.Handle = "MyPetLink";
        first.NormalizedHandle = "mypetlink";
        second.Handle = "MyPetLink";
        second.NormalizedHandle = "mypetlink";

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task AssignedReservedHandle_ResolvesThroughThePublicProfileRoute()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        await using (var context = scope.NewContext())
        {
            await NewService(context).AssignReservedHandleAsync(
                AdminId, FirstOwnerId, "MyPetLink", confirmReassign: false);

            // A handle alone does not publish a profile. The official account
            // has to be switched on, exactly like anybody else's.
            var profile = await context.OwnerSocialProfiles
                .SingleAsync(item => item.UserId == FirstOwnerId);
            profile.IsSocialEnabled = true;
            profile.DisplayName = "MyPetLink";
            profile.NormalizedDisplayName = "mypetlink";
            await context.SaveChangesAsync();
        }

        await using var read = scope.NewContext();
        var publicProfiles = new PublicSocialProfileService(
            read,
            Options.Create(new MyPetLink.Api.Storage.CloudflareR2Options()),
            new SocialMomentProjection(
                read,
                Options.Create(new MyPetLink.Api.Storage.CloudflareR2Options())));

        // What /u/mypetlink asks for, case-insensitively.
        foreach (var requested in new[] { "mypetlink", "MyPetLink", "@MYPETLINK" })
        {
            var response = await publicProfiles.GetOwnerProfileAsync(requested);
            Assert.Equal("MyPetLink", response.Handle);
        }
    }

    [RelationalFact]
    public async Task AnUnassignedReservedHandle_DoesNotResolve()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        await using var read = scope.NewContext();
        var publicProfiles = new PublicSocialProfileService(
            read,
            Options.Create(new MyPetLink.Api.Storage.CloudflareR2Options()),
            new SocialMomentProjection(
                read,
                Options.Create(new MyPetLink.Api.Storage.CloudflareR2Options())));

        await Assert.ThrowsAsync<ApiException>(() =>
            publicProfiles.GetOwnerProfileAsync("mypetlink"));
    }

    // ---- plumbing -------------------------------------------------------

    private static async Task<bool> Capture(Task task)
    {
        try
        {
            await task;
            return true;
        }
        catch (ApiException)
        {
            return false;
        }
        catch (DbUpdateException)
        {
            return false;
        }
    }

    private static OwnerHandleService NewService(MyPetLinkDbContext context) =>
        new(context,
            Options.Create(new SocialOptions()),
            new AuditLogService(context, new HttpContextAccessor()));

    private static async Task SeedAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
        var planId = context.Plans.Single(item => item.Code == "Free").Id;

        foreach (var (id, name) in new[] { (FirstOwnerId, "first"), (SecondOwnerId, "second") })
        {
            context.Users.Add(new User
            {
                Id = id,
                Email = $"{name}@example.com",
                NormalizedEmail = $"{name}@example.com".ToUpperInvariant(),
                DisplayName = name,
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = id,
                    OwnerDisplayName = name,
                    PlanId = planId
                },
                SocialProfile = OwnerSocialProfileFactory.CreateDisabled(id)
            });
        }

        await context.SaveChangesAsync();
    }
}
