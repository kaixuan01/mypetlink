using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The Moment create key against a real SQL Server: the filtered unique index
/// is what settles two requests that arrive at once — on two API instances,
/// neither of which has seen the other's row yet.
/// </summary>
public sealed class MomentCreateIdempotencyRelationalTests
{
    [RelationalFact]
    public async Task ConcurrentCreatesWithTheSameKey_WriteOneMoment_AndBothReturnIt()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var seed = scope.NewContext())
        {
            MomentCreateIntegrityTests.Harness.Seed(seed);
            await seed.SaveChangesAsync();
        }

        const int attempts = 6;
        using var start = new SemaphoreSlim(0, attempts);
        var tasks = Enumerable.Range(0, attempts).Select(async _ =>
        {
            await using var context = scope.NewContext();
            var service = new MemoryService(context, Options.Create(new CloudflareR2Options()));
            await start.WaitAsync();
            return await service.CreateAsync(
                MomentCreateIntegrityTests.OwnerId,
                MomentCreateIntegrityTests.PetId,
                MomentCreateIntegrityTests.Request("Beach day", MemoryVisibility.Public, key: "one-attempt"));
        }).ToArray();

        start.Release(attempts);
        var results = await Task.WhenAll(tasks);

        Assert.Single(results.Select(result => result.Id).Distinct());
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.PetMemories.CountAsync());
    }

    [RelationalFact]
    public async Task TheKeyIsUniquePerAuthor_NotGlobally()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var seed = scope.NewContext())
        {
            MomentCreateIntegrityTests.Harness.Seed(seed);
            await seed.SaveChangesAsync();
        }

        await using (var context = scope.NewContext())
        {
            var service = new MemoryService(context, Options.Create(new CloudflareR2Options()));
            await service.CreateAsync(MomentCreateIntegrityTests.OwnerId, MomentCreateIntegrityTests.PetId,
                MomentCreateIntegrityTests.Request("Mine", key: "same"));
            await service.CreateAsync(MomentCreateIntegrityTests.OtherOwnerId, MomentCreateIntegrityTests.OtherPetId,
                MomentCreateIntegrityTests.Request("Theirs", key: "same"));
            // Rows without a key are never constrained by the index.
            await service.CreateAsync(MomentCreateIntegrityTests.OwnerId, MomentCreateIntegrityTests.PetId,
                MomentCreateIntegrityTests.Request("No key"));
            await service.CreateAsync(MomentCreateIntegrityTests.OwnerId, MomentCreateIntegrityTests.PetId,
                MomentCreateIntegrityTests.Request("No key"));
        }

        await using var verify = scope.NewContext();
        Assert.Equal(4, await verify.PetMemories.CountAsync());
    }
}
