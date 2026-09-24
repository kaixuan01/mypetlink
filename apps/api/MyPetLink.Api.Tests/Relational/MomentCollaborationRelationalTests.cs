using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Collaboration on SQL Server: the live-household cap and live index under
/// concurrency, the state constraint, and every race between two changes to
/// one collaboration. Each race is forced both ways by holding one side in
/// SaveChanges until the other has committed (or two seconds pass, which is
/// what happens when the two correctly serialize); the end state must follow
/// the first commit and never leave an association without an Accepted row.
/// </summary>
public sealed class MomentCollaborationRelationalTests
{
    private static readonly Guid Author = Guid.Parse("f1111111-1111-1111-1111-111111111111");
    private static readonly Guid AuthorPet = Guid.Parse("f1222222-2222-2222-2222-222222222222");
    private static readonly Guid[] Households =
    [
        Guid.Parse("f2111111-1111-1111-1111-111111111111"),
        Guid.Parse("f3111111-1111-1111-1111-111111111111"),
        Guid.Parse("f4111111-1111-1111-1111-111111111111"),
        Guid.Parse("f5111111-1111-1111-1111-111111111111")
    ];
    private static readonly Guid[] HouseholdPets =
    [
        Guid.Parse("f2222222-2222-2222-2222-222222222222"),
        Guid.Parse("f3222222-2222-2222-2222-222222222222"),
        Guid.Parse("f4222222-2222-2222-2222-222222222222"),
        Guid.Parse("f5222222-2222-2222-2222-222222222222")
    ];
    private static readonly string[] Handles = ["houseone", "housetwo", "housethree", "housefour"];

    [RelationalFact]
    public async Task FourSimultaneousInvitationsLeaveAtMostThreeLiveHouseholds()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);

        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(async index =>
        {
            await using var context = scope.NewContext();
            try
            {
                await Service(context).InviteAsync(Author, momentId, Invite(index));
                return "ok";
            }
            catch (ApiException exception)
            {
                return exception.Code;
            }
        }));

        Assert.Equal(3, results.Count(result => result == "ok"));
        Assert.Equal("collaboration_limit_reached", Assert.Single(results, result => result != "ok"));
        await using var verify = scope.NewContext();
        Assert.Equal(3, await verify.MomentCollaborations.CountAsync(item =>
            item.MomentId == momentId && item.Status == MomentCollaborationStatus.Pending));
    }

    [RelationalFact]
    public async Task TheSameHouseholdInvitedTwiceAtOnceGetsOneLiveInvitation()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);

        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ =>
        {
            await using var context = scope.NewContext();
            try
            {
                await Service(context).InviteAsync(Author, momentId, Invite(0));
                return "ok";
            }
            catch (ApiException exception)
            {
                return exception.Code;
            }
        }));

        Assert.Equal(new[] { "collaboration_already_invited", "ok" }, results.Order());
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.MomentCollaborations.CountAsync(item => item.MomentId == momentId));
    }

    [RelationalFact]
    public async Task TheLiveIndexAndStateConstraintHoldInTheDatabase()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);
        var now = DateTimeOffset.UtcNow;

        MomentCollaboration Row(MomentCollaborationStatus status) => new()
        {
            MomentId = momentId,
            InviterUserId = Author,
            InviteeUserId = Households[0],
            Status = status,
            CreatedAt = now,
            ExpiresAt = now.AddDays(14),
            RespondedAt = status is MomentCollaborationStatus.Accepted or MomentCollaborationStatus.Declined ? now : null,
            EndedAt = status is MomentCollaborationStatus.Revoked or MomentCollaborationStatus.Expired ? now : null
        };

        // Ended rows are history and may repeat; live rows may not.
        await using (var context = scope.NewContext())
        {
            context.MomentCollaborations.AddRange(
                Row(MomentCollaborationStatus.Revoked),
                Row(MomentCollaborationStatus.Expired),
                Row(MomentCollaborationStatus.Pending));
            await context.SaveChangesAsync();
        }

        await using (var context = scope.NewContext())
        {
            context.MomentCollaborations.Add(Row(MomentCollaborationStatus.Accepted));
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        }

        // Accepted must record when it was answered; ended rows when they ended.
        await using (var context = scope.NewContext())
        {
            var broken = Row(MomentCollaborationStatus.Accepted);
            broken.InviteeUserId = Households[1];
            broken.RespondedAt = null;
            context.MomentCollaborations.Add(broken);
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        }
    }

    [RelationalTheory]
    [InlineData("accept")]
    [InlineData("revoke")]
    public async Task AcceptRacingRevokeAlwaysEndsRevokedWithNoAssociation(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (momentId, collaborationId) = await SeedInvitationAsync(scope);

        await RaceAsync(gate, held,
            ("accept", context => Service(context).AcceptAsync(Households[0], collaborationId, Accept(0))),
            ("revoke", context => Service(context).RevokeAsync(Author, momentId, collaborationId)),
            scope);

        await using var verify = scope.NewContext();
        Assert.Equal(MomentCollaborationStatus.Revoked, (await verify.MomentCollaborations.FindAsync(collaborationId))!.Status);
        Assert.False(await verify.MomentPets.AnyAsync(item => item.CollaborationId == collaborationId));
    }

    [RelationalTheory]
    [InlineData("accept")]
    [InlineData("block")]
    public async Task AcceptRacingBlockAlwaysEndsDissolvedWithNoAssociation(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (_, collaborationId) = await SeedInvitationAsync(scope);

        await RaceAsync(gate, held,
            ("accept", async context =>
            {
                try
                {
                    await Service(context).AcceptAsync(Households[0], collaborationId, Accept(0));
                }
                catch (ApiException)
                {
                    // The block got there first; the invitee is told nothing more.
                }
            }),
            ("block", context => Graph(context).BlockAsync(Author, Handles[0], null)),
            scope);

        await using var verify = scope.NewContext();
        Assert.Equal(MomentCollaborationStatus.Dissolved, (await verify.MomentCollaborations.FindAsync(collaborationId))!.Status);
        Assert.False(await verify.MomentPets.AnyAsync(item => item.CollaborationId == collaborationId));
        Assert.True(await verify.OwnerBlocks.AnyAsync(item => item.BlockerUserId == Author));
    }

    [RelationalTheory]
    [InlineData("accept")]
    [InlineData("decline")]
    public async Task AcceptRacingDeclineFollowsTheFirstCommit(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (_, collaborationId) = await SeedInvitationAsync(scope);

        await RaceAsync(gate, held,
            ("accept", context => Service(context).AcceptAsync(Households[0], collaborationId, Accept(0))),
            ("decline", async context =>
            {
                try
                {
                    await Service(context).DeclineAsync(Households[0], collaborationId);
                }
                catch (ApiException exception) when (exception.Code == "collaboration_unavailable")
                {
                    // Accept got there first.
                }
            }),
            scope);

        await using var verify = scope.NewContext();
        var state = (await verify.MomentCollaborations.FindAsync(collaborationId))!.Status;
        var associated = await verify.MomentPets.AnyAsync(item => item.CollaborationId == collaborationId);
        // The one that was not held committed first.
        Assert.Equal(held == "accept" ? MomentCollaborationStatus.Declined : MomentCollaborationStatus.Accepted, state);
        Assert.Equal(state == MomentCollaborationStatus.Accepted, associated);
    }

    [RelationalFact]
    public async Task TwoSimultaneousAcceptsAssociateEachPetOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (_, collaborationId) = await SeedInvitationAsync(scope);

        await Task.WhenAll(Enumerable.Range(0, 2).Select(async _ =>
        {
            await using var context = scope.NewContext();
            await Service(context).AcceptAsync(Households[0], collaborationId, Accept(0));
        }));

        await using var verify = scope.NewContext();
        Assert.Equal(MomentCollaborationStatus.Accepted, (await verify.MomentCollaborations.FindAsync(collaborationId))!.Status);
        Assert.Equal(1, await verify.MomentPets.CountAsync(item => item.CollaborationId == collaborationId));
    }

    [RelationalTheory]
    [InlineData("leave")]
    [InlineData("revoke")]
    public async Task LeaveRacingRevokeEndsOnceWithNoAssociation(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (momentId, collaborationId) = await SeedInvitationAsync(scope);
        await using (var context = scope.NewContext())
        {
            await Service(context).AcceptAsync(Households[0], collaborationId, Accept(0));
        }

        await RaceAsync(gate, held,
            ("leave", context => Service(context).LeaveAsync(Households[0], collaborationId)),
            ("revoke", context => Service(context).RevokeAsync(Author, momentId, collaborationId)),
            scope);

        await using var verify = scope.NewContext();
        var state = (await verify.MomentCollaborations.FindAsync(collaborationId))!.Status;
        Assert.Equal(held == "leave" ? MomentCollaborationStatus.Revoked : MomentCollaborationStatus.Left, state);
        Assert.False(await verify.MomentPets.AnyAsync(item => item.CollaborationId == collaborationId));
    }

    [RelationalFact]
    public async Task AMomentArchivedDuringAcceptHidesTheCollaborationUntilItReturns()
    {
        var gate = new SaveGate("accept");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (momentId, collaborationId) = await SeedInvitationAsync(scope);

        await RaceAsync(gate, "accept",
            ("accept", context => Service(context).AcceptAsync(Households[0], collaborationId, Accept(0))),
            ("archive", async context =>
            {
                (await context.PetMemories.FindAsync(momentId))!.ArchivedAt = DateTimeOffset.UtcNow;
                await context.SaveChangesAsync();
            }),
            scope);

        await using (var verify = scope.NewContext())
        {
            Assert.Equal(MomentCollaborationStatus.Accepted, (await verify.MomentCollaborations.FindAsync(collaborationId))!.Status);
            Assert.False(await verify.MomentPets.VisibleCollaboratorSubjects(verify, null)
                .AnyAsync(item => item.CollaborationId == collaborationId));
            (await verify.PetMemories.FindAsync(momentId))!.ArchivedAt = null;
            await verify.SaveChangesAsync();
        }

        await using var after = scope.NewContext();
        Assert.True(await after.MomentPets.VisibleCollaboratorSubjects(after, null)
            .AnyAsync(item => item.CollaborationId == collaborationId));
    }

    [RelationalFact]
    public async Task APetWithdrawnDuringAcceptIsNeverShown()
    {
        var gate = new SaveGate("accept");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (_, collaborationId) = await SeedInvitationAsync(scope);

        await RaceAsync(gate, "accept",
            ("accept", context => Service(context).AcceptAsync(Households[0], collaborationId, Accept(0))),
            ("withdraw-pet", async context =>
            {
                var social = await context.PetSocialProfiles.SingleAsync(item => item.PetId == HouseholdPets[0]);
                social.IsSocialEnabled = false;
                await context.SaveChangesAsync();
            }),
            scope);

        await using var verify = scope.NewContext();
        Assert.False(await verify.MomentPets.VisibleCollaboratorSubjects(verify, null)
            .AnyAsync(item => item.CollaborationId == collaborationId));
    }

    // ---- helpers -----------------------------------------------------------

    private static MomentCollaborationService Service(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCollaborationService(context, new OwnerNotificationService(context, r2), r2);
    }

    private static SocialGraphService Graph(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new SocialGraphService(context, r2, new OwnerNotificationService(context, r2));
    }

    private static CreateMomentCollaborationRequest Invite(int household) =>
        new(Handles[household], [$"pet{household}-pubpet{household}"]);

    private static AcceptMomentCollaborationRequest Accept(int household) =>
        new([$"pet{household}-pubpet{household}"]);

    private static async Task<Guid> SeedAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
        SocialSurfaceHarness.AddOwner(context, Author, "author@example.com", "Author", "AuthorHome", "The Author Home",
            social: true, discoverable: true);
        for (var index = 0; index < Households.Length; index += 1)
        {
            SocialSurfaceHarness.AddOwner(context, Households[index], $"{Handles[index]}@example.com",
                Handles[index], Handles[index], $"House {index}", social: true, discoverable: true);
        }
        await context.SaveChangesAsync();

        SocialSurfaceHarness.AddPet(context, AuthorPet, Author, "Topu", "Cat", social: true, discoverable: true);
        for (var index = 0; index < Households.Length; index += 1)
        {
            SocialSurfaceHarness.AddPet(context, HouseholdPets[index], Households[index], $"Pet{index}", "Dog",
                social: true, discoverable: true);
        }
        await context.SaveChangesAsync();

        var moment = new PetMemory
        {
            PetId = AuthorPet,
            AuthorUserId = Author,
            Title = "Beach day",
            Type = "Memory",
            Visibility = MemoryVisibility.Public,
            PublishedAt = DateTimeOffset.UtcNow
        };
        context.PetMemories.Add(moment);
        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = AuthorPet });
        await context.SaveChangesAsync();
        return moment.Id;
    }

    private static async Task<(Guid MomentId, Guid CollaborationId)> SeedInvitationAsync(RelationalScope scope)
    {
        var momentId = await SeedAsync(scope);
        await using var context = scope.NewContext();
        var list = await Service(context).InviteAsync(Author, momentId, Invite(0));
        return (momentId, Assert.Single(list.Items).Id);
    }

    /// <summary>
    /// Runs two operations with <paramref name="held"/> paused in its first
    /// SaveChanges until the other has finished, then lets it continue.
    /// </summary>
    private static async Task RaceAsync(
        SaveGate gate,
        string held,
        (string Name, Func<MyPetLinkDbContext, Task> Run) first,
        (string Name, Func<MyPetLinkDbContext, Task> Run) second,
        RelationalScope scope)
    {
        async Task Run((string Name, Func<MyPetLinkDbContext, Task> Run) operation)
        {
            SaveGate.Current.Value = operation.Name;
            if (operation.Name != held)
            {
                await gate.WaitUntilHeldAsync();
            }

            await using var context = scope.NewContext();
            await operation.Run(context);
            gate.Finished(operation.Name);
        }

        await Task.WhenAll(Task.Run(() => Run(first)), Task.Run(() => Run(second)));
    }

    private sealed class SaveGate(string held) : SaveChangesInterceptor
    {
        public static readonly AsyncLocal<string?> Current = new();

        private readonly TaskCompletionSource _reached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _otherFinished = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _used;

        public Task WaitUntilHeldAsync() => _reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        public void Finished(string operation)
        {
            if (operation != held)
            {
                _otherFinished.TrySetResult();
            }
        }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (Current.Value == held && Interlocked.Exchange(ref _used, 1) == 0)
            {
                _reached.TrySetResult();
                await Task.WhenAny(_otherFinished.Task, Task.Delay(TimeSpan.FromSeconds(2), cancellationToken));
            }

            return result;
        }
    }
}
