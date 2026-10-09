using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests.Relational;

public sealed class PhysicalQaConcurrencyTests
{
    [RelationalFact]
    public async Task TwoAdminsSavingSameVersionProduceOneResultAndOneAudit()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await PhysicalQaTests.Seed(setup);
        await using var first = scope.NewContext(); await using var second = scope.NewContext();
        var one = PhysicalQaTests.Service(first); var two = PhysicalQaTests.Service(second);
        var request = await PhysicalQaTests.Pass(one);
        async Task<int> Save(MyPetLink.Api.Services.PhysicalQaService qa, SavePhysicalQaRequest r)
        {
            try { await qa.SaveAsync(PhysicalQaTests.UserId, PhysicalQaTests.TagId, r, default); return 200; }
            catch (ApiException e) { return e.StatusCode; }
        }
        var results = await Task.WhenAll(Save(one, request), Save(two, request with { InspectionId = Guid.NewGuid() }));
        Assert.Equal(new[] { 200, 409 }, results.Order().ToArray());
        await using var check = scope.NewContext(); Assert.Equal(1, await check.AuditLogs.CountAsync());
        Assert.Equal(2, (await check.SmartTags.SingleAsync()).QaVersion); Assert.Empty(await check.TagScans.ToListAsync());
    }
    [RelationalFact]
    public async Task AnInspectionOperationCannotBeReusedForADifferentTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext(); await PhysicalQaTests.Seed(db);
        var other = new SmartTag { TagCode = "MPL-AAAA-AAAA", HasNfc = true, ProductVariantId = PhysicalQaTests.VariantId, QaStatus = PhysicalQaStatus.Pending, QaVersion = 1 };
        db.SmartTags.Add(other); await db.SaveChangesAsync();
        var qa = PhysicalQaTests.Service(db); var passed = await PhysicalQaTests.Pass(qa);
        await qa.SaveAsync(PhysicalQaTests.UserId, PhysicalQaTests.TagId, passed, default);
        var error = await Assert.ThrowsAsync<ApiException>(() => qa.SaveAsync(PhysicalQaTests.UserId, other.Id,
            new(passed.InspectionId, 1, PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, null, null, "Damaged package"), default));
        Assert.Equal(409, error.StatusCode);
        db.ChangeTracker.Clear(); Assert.Equal(PhysicalQaStatus.Pending, (await db.SmartTags.SingleAsync(t => t.Id == other.Id)).QaStatus);
        Assert.Equal(1, await db.AuditLogs.CountAsync());
    }

    [RelationalFact]
    public async Task ShippingCannotCommitUsingTagLoadedBeforeQaDowngrade()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) { await PhysicalQaTests.Seed(setup); var qa = PhysicalQaTests.Service(setup); await qa.SaveAsync(PhysicalQaTests.UserId, PhysicalQaTests.TagId, await PhysicalQaTests.Pass(qa), default); }
        await using var shipping = scope.NewContext(); var tag = await shipping.SmartTags.SingleAsync();
        await using (var inspection = scope.NewContext())
        {
            await PhysicalQaTests.Service(inspection).SaveAsync(PhysicalQaTests.UserId, tag.Id,
                new(Guid.NewGuid(), 2, PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, null, null, "Cracked after handling"), default);
        }
        tag.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => shipping.SaveChangesAsync());
        await using var check = scope.NewContext(); var saved = await check.SmartTags.SingleAsync();
        Assert.Equal(PhysicalQaStatus.Failed, saved.QaStatus); Assert.Equal(TagFulfilmentStatus.Generated, saved.FulfilmentStatus);
    }
}
