using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class CommissionRuleServiceTests
{
    private static readonly DateTimeOffset Now =
        DateTimeOffset.Parse("2026-09-08T00:00:00Z");

    [Fact]
    public async Task RejectsOverlappingActiveRuleForSameScopeAndQuantity()
    {
        await using var db = Db();
        db.CommissionRules.Add(new CommissionRule
        {
            CommissionType = SalesCommissionType.DirectRetailPercentage,
            Percentage = 15m,
            Currency = "MYR",
            EffectiveFrom = Now.AddMonths(-1),
            EffectiveTo = Now.AddMonths(1),
            MinQuantity = 1,
            MaxQuantity = 5,
            IsActive = true
        });
        await db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => Service(db).CreateAsync(
            null,
            Request(effectiveFrom: Now, minQuantity: 5, maxQuantity: 10),
            default));

        Assert.Equal("commission_rule_overlap", error.Code);
        Assert.Single(await db.CommissionRules.ToListAsync());
    }

    [Fact]
    public async Task AllowsSalespersonOverrideAndNonOverlappingEffectivePeriods()
    {
        await using var db = Db();
        var salesperson = new Salesperson
        {
            SalespersonCode = "SP-RULE",
            Name = "Rule Seller",
            DefaultCommissionPercentage = 0m
        };
        db.Salespersons.Add(salesperson);
        await db.SaveChangesAsync();

        var service = Service(db);
        var global = await service.CreateAsync(null,
            Request(effectiveFrom: Now, effectiveTo: Now.AddMonths(1)), default);
        var seller = await service.CreateAsync(null,
            Request(salespersonId: salesperson.Id, percentage: 20m,
                effectiveFrom: Now, effectiveTo: Now.AddMonths(1)), default);
        var future = await service.CreateAsync(null,
            Request(effectiveFrom: Now.AddMonths(1), percentage: 18m), default);

        Assert.Null(global.SalespersonId);
        Assert.Equal(salesperson.Id, seller.SalespersonId);
        Assert.Equal(3, (await service.ListAsync(1, 20, null, null, default)).Total);
        Assert.Equal(18m, future.Percentage);
    }

    [Fact]
    public async Task UpdateRequiresCurrentRowVersionAndWritesAuditHistory()
    {
        await using var db = Db();
        var service = Service(db);
        var created = await service.CreateAsync(null, Request(), default);
        var row = await db.CommissionRules.SingleAsync(item => item.Id == created.Id);
        row.RowVersion = [9];
        await db.SaveChangesAsync();

        var stale = await Assert.ThrowsAsync<ApiException>(() => service.UpdateAsync(
            null,
            created.Id,
            Request(percentage: 16m, concurrencyToken: Convert.ToBase64String([8])),
            default));
        Assert.Equal("concurrency_conflict", stale.Code);

        var updated = await service.UpdateAsync(
            null,
            created.Id,
            Request(percentage: 16m, concurrencyToken: Convert.ToBase64String([9])),
            default);
        Assert.Equal(16m, updated.Percentage);
        Assert.Contains(await db.AuditLogs.ToListAsync(), item =>
            item.Action == "commission-rule.update" && item.EntityId == created.Id);
    }

    [Fact]
    public async Task RejectsFuturePhaseAndFixedAmountRules()
    {
        await using var db = Db();
        var service = Service(db);

        var futureType = await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(
            null,
            Request() with { CommissionType = "ResellerRepeatPercentage" },
            default));
        var fixedAmount = await Assert.ThrowsAsync<ApiException>(() => service.CreateAsync(
            null,
            Request() with { FixedAmount = 10m },
            default));

        Assert.Equal("validation_failed", futureType.Code);
        Assert.Equal("validation_failed", fixedAmount.Code);
    }

    [Fact]
    public async Task RejectsPercentageThatCannotBeSnapshottedExactly()
    {
        await using var db = Db();

        var error = await Assert.ThrowsAsync<ApiException>(() => Service(db).CreateAsync(
            null,
            Request(percentage: 15.555m),
            default));

        Assert.Equal("validation_failed", error.Code);
        Assert.Contains("percentage", error.Details!.Keys);
    }

    private static UpsertCommissionRuleRequest Request(
        Guid? salespersonId = null,
        decimal percentage = 15m,
        DateTimeOffset? effectiveFrom = null,
        DateTimeOffset? effectiveTo = null,
        int? minQuantity = null,
        int? maxQuantity = null,
        string? concurrencyToken = null) => new(
            "DirectRetailPercentage",
            salespersonId,
            percentage,
            null,
            minQuantity,
            maxQuantity,
            null,
            "MYR",
            effectiveFrom ?? Now,
            effectiveTo,
            true,
            null,
            concurrencyToken);

    private static CommissionRuleService Service(MyPetLinkDbContext db) => new(
        db,
        new AuditLogService(db, new HttpContextAccessor()),
        new FixedTimeProvider(Now));

    private static MyPetLinkDbContext Db() => new(
        new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options,
        new FixedTimeProvider(Now));
}
