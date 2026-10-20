using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using Xunit.Abstractions;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Independent QA probes. Each test asserts the CURRENTLY OBSERVED behaviour so a
// pass means "reproduced as described". Synthetic data only; disposable databases.
[Collection("PDF document rendering")]
public sealed class IndependentQaProbes(ITestOutputHelper log)
{
    private static async Task SeedIdentity(MyPetLinkDbContext db)
    {
        var identity = await db.BusinessIdentitySettings.SingleAsync();
        identity.LegalBusinessName = "Test Seller"; identity.BrandName = "MyPetLink"; identity.BusinessRegistrationNumber = "TEST-REG";
        identity.RegisteredAddressLine1 = "Test address"; identity.RegisteredPostcode = "50000"; identity.RegisteredCity = "Kuala Lumpur";
        identity.RegisteredState = "Kuala Lumpur"; identity.RegisteredCountry = "Malaysia"; identity.SupportEmail = "test@example.com";
        await db.SaveChangesAsync();
    }
    private static async Task<RelationalScope> Database(int stock)
    {
        Assert.True(RelationalDatabase.IsAvailable, "SQL Server required");
        var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using var db = scope.NewContext();
        await SeedAsync(db, qrStock: 0, nfcStock: stock);
        await ReceivedStockFixture.ReceiveAllAsync(db, NfcVariantId);
        await SeedIdentity(db);
        return scope;
    }
    private static ConsignmentService Custody(MyPetLinkDbContext db, DateTimeOffset? at = null)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var clock = new FixedClock(at ?? Now);
        return new(db, audit, new BusinessIdentityService(db, audit, clock), new DocumentNumberService(db), clock);
    }
    private static SaveConsignmentAgreementRequest Terms(DateTimeOffset? to = null) => new(MerchantId, "QA-SYNTHETIC", 35m, Now.AddDays(-1), to,
        "SYNTHETIC test duration", "SYNTHETIC settlement", 14, "SYNTHETIC discounts", "SYNTHETIC returns", "SYNTHETIC loss", "SYNTH-SIGNED", "SYNTH-TRACKER");
    private static async Task<ConsignmentAgreementResponse> Agreement(MyPetLinkDbContext db, DateTimeOffset? to = null)
    {
        var s = Custody(db); var a = await s.SaveAgreementAsync(AdminAccountId, null, Terms(to), null, default);
        return await s.AgreementActionAsync(AdminAccountId, a.Id, "approve", new(a.ConcurrencyToken, "QA approval"), default);
    }
    private static ReserveConsignmentRequest Reserve(Guid agreement, int qty, string key) =>
        new(agreement, "SYNTHETIC partner address", "SYNTH-TRACKER", key, [new(NfcVariantId, qty)]);
    private static ConsignmentActionRequest Act(ConsignmentDispatchResponse d, string reference, IReadOnlyList<Guid>? units = null) => new(d.ConcurrencyToken, reference, units);

    [Fact]
    public async Task P01_ConsignmentCanTakeEveryPassedUnitLeavingPaidRetailOrdersOnlyUninspectedStock()
    {
        await using var scope = await Database(6); await using var db = scope.NewContext(); var a = await Agreement(db);
        var pending = await db.SmartTags.Where(t => t.ProductVariantId == NfcVariantId).OrderBy(t => t.TagCode).Take(2).ToListAsync();
        foreach (var t in pending) t.QaStatus = PhysicalQaStatus.Pending;
        await db.SaveChangesAsync();
        var retail = await SeedRetailOrderAsync(db);
        var item = await db.TagOrderItems.SingleAsync(x => x.Id == retail.OrderItemId);
        item.ProductVariantId = NfcVariantId; item.Quantity = 2; await db.SaveChangesAsync();
        var avail = new TagOrderInventoryAvailabilityService(db);
        log.WriteLine($"Before: Passed=4, Pending=2, paid retail reservation=2, retail available={await avail.GetAvailableUnitsAsync(NfcVariantId)}");
        var d = await Custody(db).ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "p01"), default);
        var passedOnShelf = await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db, NfcVariantId)).CountAsync();
        log.WriteLine($"Consignment reserved {d.Reserved} Passed units. Passed units left for the PAID retail order: {passedOnShelf}");
        Assert.Equal(4, d.Reserved); Assert.Equal(0, passedOnShelf);
        db.ChangeTracker.Clear();
        foreach (var t in await db.SmartTags.Where(t => pending.Select(p => p.Id).Contains(t.Id)).ToListAsync()) t.QaStatus = PhysicalQaStatus.Failed;
        await db.SaveChangesAsync();
        var after = await avail.GetAvailableUnitsAsync(NfcVariantId);
        log.WriteLine($"After the 2 uninspected units fail QA: retail available={after}; paid retail order has no assignable unit (oversold by 2 while consignment holds 4 Passed).");
    }

    [Fact]
    public async Task P02_ApprovingAgreementRevisionStrandsReservedStockOfPriorVersion()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "p02"), default);
        var rev = await s.SaveAgreementAsync(AdminAccountId, null, Terms() with { SupersedesAgreementId = a.Id }, null, default);
        await s.AgreementActionAsync(AdminAccountId, rev.Id, "approve", new(rev.ConcurrencyToken, "v2 signed"), default);
        d = await s.GetAsync(d.Id, false, default);
        var ex = await Assert.ThrowsAsync<ApiException>(() => s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P02"), default));
        log.WriteLine($"Dispatch of v1 reservation after v2 approval: {ex.StatusCode} {ex.Code}: {ex.Message}");
        d = await s.ActionAsync(AdminAccountId, d.Id, "cancel", Act(d, "forced re-reserve"), default);
        log.WriteLine($"Only remedy: cancel ({d.Released} released) and re-reserve under v2.");
    }

    [Fact]
    public async Task P03_AgreementCanBeClosedWhilePartnerStillHoldsUnreconciledStock()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "p03"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P03"), default);
        var closed = await s.AgreementActionAsync(AdminAccountId, a.Id, "close", new(a.ConcurrencyToken, "close"), default);
        d = await s.GetAsync(d.Id, false, default);
        log.WriteLine($"Agreement status={closed.Status}; partner-held units still open={d.PartnerHeld}; no warning or block.");
        Assert.Equal("Closed", closed.Status); Assert.Equal(4, d.PartnerHeld);
    }

    [Fact]
    public async Task P04_ExternalHandoverReferenceIsNotDeduplicatedAndHandoverCannotBeReversed()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "p04"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P04"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "external-handover", Act(d, "SALE-0001", [d.Units[0].Id]), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "external-handover", Act(d, "SALE-0001", [d.Units[1].Id]), default);
        log.WriteLine($"Same external sale reference accepted for two separate units: handovers={d.ExternalHandovers}; neither unit was activated.");
        Assert.Equal(2, d.ExternalHandovers);
        var ex = await Assert.ThrowsAsync<ApiException>(() => s.ActionAsync(AdminAccountId, d.Id, "return", Act(d, "mistaken handover", [d.Units[0].Id]), default));
        log.WriteLine($"Correcting a mistaken handover via return: {ex.StatusCode} {ex.Message}. No reversal action exists.");
        var unit = await db.ConsignmentUnits.AsNoTracking().SingleAsync(u => u.Id == d.Units[0].Id);
        log.WriteLine($"Unit carries no handover timestamp column; ReturnedAt={unit.ReturnedAt?.ToString() ?? "null"} ReleasedAt={unit.ReleasedAt?.ToString() ?? "null"}");
    }

    [Fact]
    public async Task P05_ManifestCsvHasNoEventDatesForPeriodSettlement()
    {
        await using var scope = await Database(2); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 2, "p05"), default);
        var docs = new ConsignmentDocumentService(db, s, new AuditLogService(db, new HttpContextAccessor()));
        var csv = System.Text.Encoding.UTF8.GetString(await docs.CsvAsync(AdminAccountId, d.Id, default));
        var header = csv.Split('\n')[0].Trim();
        log.WriteLine("CSV header: " + header);
        Assert.DoesNotContain("Date", header, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Merchant", header, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task P06_ReceiptAcknowledgmentAcceptsAnyTextAndMarksEveryUnitReceived()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "p06"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P06"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "receive", Act(d, "x"), default);
        var received = await db.ConsignmentUnits.CountAsync(u => u.Status == ConsignmentUnitStatus.Received);
        log.WriteLine($"Receipt evidence 'x' accepted by the same actor who dispatched; units marked Received={received}; no partial/shortage path.");
        Assert.Equal("Received", d.Status); Assert.Equal(4, received);
    }

    [Fact]
    public async Task P07_ResubmissionWithNewIdempotencyKeyCreatesDuplicateReservation()
    {
        await using var scope = await Database(8); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var first = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "tab-before-refresh"), default);
        var second = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "tab-after-refresh"), default);
        log.WriteLine($"Identical payload, new key (browser refresh): dispatches={await db.ConsignmentDispatches.CountAsync()} held units={await db.ConsignmentUnits.CountAsync()}");
        Assert.NotEqual(first.Id, second.Id);
    }

    [Fact]
    public async Task P08_ConcurrentSameKeyAndCompetingReservationsStayExclusive()
    {
        await using var scope = await Database(4); Guid agreementId;
        await using (var setup = scope.NewContext()) agreementId = (await Agreement(setup)).Id;
        async Task<string> Run(string key, TaskCompletionSource start)
        {
            await start.Task; await using var db = scope.NewContext();
            try { var d = await Custody(db).ReserveAsync(AdminAccountId, Reserve(agreementId, 4, key), default); return d.Id.ToString(); }
            catch (ApiException e) { return "error:" + e.Code; }
        }
        var go = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var same = new[] { Run("same-key", go), Run("same-key", go), Run("same-key", go) }; go.SetResult();
        var r1 = await Task.WhenAll(same);
        log.WriteLine("Same key x3 concurrent: " + string.Join(" | ", r1));
        await using (var check = scope.NewContext()) Assert.Equal(1, await check.ConsignmentDispatches.CountAsync());
        Assert.Single(r1.Distinct());
        await using (var c = scope.NewContext())
        {
            var d = await Custody(c).GetAsync(Guid.Parse(r1[0]), false, default);
            await Custody(c).ActionAsync(AdminAccountId, d.Id, "cancel", Act(d, "reset"), default);
        }
        var go2 = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var diff = new[] { Run("k-a", go2), Run("k-b", go2), Run("k-c", go2) }; go2.SetResult();
        var r2 = await Task.WhenAll(diff);
        log.WriteLine("Different keys x3 competing for the same 4 units: " + string.Join(" | ", r2));
        Assert.Single(r2.Where(x => !x.StartsWith("error")));
        await using var final = scope.NewContext();
        Assert.Equal(4, await final.ConsignmentUnits.CountAsync(u => u.ReleasedAt == null));
    }

    [Fact]
    public async Task P09_PublicActivationIsBlockedForReservedAndQuarantinedUnits()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "p09"), default);
        var docs = new ConsignmentDocumentService(db, s, new AuditLogService(db, new HttpContextAccessor()));
        var codes = (await docs.ManifestAsync(AdminAccountId, d.Id, default)).Units;
        var petId = Guid.NewGuid();
        db.Pets.Add(new Pet { Id = petId, OwnerUserId = OwnerAccountId, Slug = "qa-probe-pet", Name = "Probe", Species = "Dog", LifecycleStatus = PetLifecycleStatus.Active });
        await db.SaveChangesAsync();
        var activation = new SmartTagService(db, new AuditLogService(db, new HttpContextAccessor()));
        var e1 = await Assert.ThrowsAnyAsync<Exception>(() => activation.ActivateAsync(OwnerAccountId, codes[0].TagCode!, new(petId)));
        log.WriteLine($"Activate Reserved unit: {(e1 as ApiException)?.Code ?? e1.GetType().Name}");
        db.ChangeTracker.Clear();
        d = await s.GetAsync(d.Id, false, default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P09"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "return", Act(d, "RET-P09", [codes[1].Id]), default);
        db.ChangeTracker.Clear();
        var e2 = await Assert.ThrowsAnyAsync<Exception>(() => activation.ActivateAsync(OwnerAccountId, codes[1].TagCode!, new(petId)));
        log.WriteLine($"Activate quarantined return: {(e2 as ApiException)?.Code ?? e2.GetType().Name}");
    }

    [Fact]
    public async Task P10_ReturnThatFailsReinspectionHasNoExitFromCustody()
    {
        await using var scope = await Database(2); await using var db = scope.NewContext(); var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 2, "p10"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P10"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "return", Act(d, "RET-P10", [d.Units[0].Id]), default);
        var unit = await db.ConsignmentUnits.Include(u => u.SmartTag).SingleAsync(u => u.Id == d.Units[0].Id);
        unit.SmartTag.QaStatus = PhysicalQaStatus.Failed; unit.SmartTag.QaVersion++; unit.SmartTag.QaInspectedAt = Now.AddMinutes(5);
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        d = await s.GetAsync(d.Id, false, default);
        foreach (var action in new[] { "release", "return", "external-handover", "cancel" })
        {
            var ex = await Assert.ThrowsAsync<ApiException>(() => s.ActionAsync(AdminAccountId, d.Id, action, Act(d, "try " + action, [unit.Id]), default));
            log.WriteLine($"{action}: {ex.StatusCode} {ex.Message}");
        }
    }

    [Fact]
    public async Task P11_ExpiredAgreementBlocksDispatchButReturnsAndHandoversStillWork()
    {
        await using var scope = await Database(4); await using var db = scope.NewContext(); var a = await Agreement(db, Now.AddDays(1)); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 4, "p11"), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P11"), default);
        var later = Custody(db, Now.AddDays(3));
        var blocked = await Assert.ThrowsAsync<ApiException>(() => later.ReserveAsync(AdminAccountId, Reserve(a.Id, 1, "p11-late"), default));
        log.WriteLine($"New reservation after expiry: {blocked.StatusCode} {blocked.Message}");
        d = await later.ActionAsync(AdminAccountId, d.Id, "return", Act(d, "RET-P11", [d.Units[0].Id]), default);
        d = await later.ActionAsync(AdminAccountId, d.Id, "external-handover", Act(d, "SALE-P11", [d.Units[1].Id]), default);
        log.WriteLine($"After expiry: returned={d.ReturnedQuarantine} handovers={d.ExternalHandovers} (custody reconciliation still possible).");
    }

    [Fact]
    public async Task P12_IdempotentScriptAppliesConsignmentOnTopOfPriorProductionSchema()
    {
        await using var scope = await RelationalDatabase.CreateAsync(createSchema: false); await using var db = scope.NewContext();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261015032111_AddMerchantMainLogo");
        var root = Path.GetFullPath("C:/Project/MyPetLink");
        var script = await File.ReadAllTextAsync(Path.Combine(root, "migration.sql"));
        async Task Apply()
        {
            await db.Database.OpenConnectionAsync();
            try
            {
                foreach (var batch in System.Text.RegularExpressions.Regex.Split(script, @"^GO\s*$", System.Text.RegularExpressions.RegexOptions.Multiline | System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    if (!string.IsNullOrWhiteSpace(batch)) await db.Database.ExecuteSqlRawAsync(batch);
            }
            finally { await db.Database.CloseConnectionAsync(); }
        }
        await Apply(); await Apply();
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToArray();
        var tables = await db.Database.SqlQueryRaw<string>("SELECT name AS Value FROM sys.tables WHERE name LIKE 'Consignment%'").ToListAsync();
        log.WriteLine($"From AddMerchantMainLogo -> script x2: pending={pending.Length}; tables={string.Join(",", tables.OrderBy(x => x))}");
        Assert.Empty(pending); Assert.Equal(4, tables.Count);
    }

    [Fact]
    public async Task P13_DownMigrationAfterCustodyExistsSilentlyDestroysCustodyRecords()
    {
        await using var scope = await RelationalDatabase.CreateAsync(createSchema: false, enableRetryOnFailure: true);
        await using (var db = scope.NewContext())
        {
            await db.Database.MigrateAsync();
            await SeedAsync(db, qrStock: 0, nfcStock: 2); await ReceivedStockFixture.ReceiveAllAsync(db, NfcVariantId); await SeedIdentity(db);
            var a = await Agreement(db); var s = Custody(db);
            var d = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 2, "p13"), default);
            await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Act(d, "TRACK-P13"), default);
        }
        await using (var db = scope.NewContext())
        {
            var held = await db.ConsignmentUnits.CountAsync();
            await db.GetService<IMigrator>().MigrateAsync("20261015032111_AddMerchantMainLogo");
            var tables = await db.Database.SqlQueryRaw<string>("SELECT name AS Value FROM sys.tables WHERE name LIKE 'Consignment%'").ToListAsync();
            var shelf = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM SmartTags WHERE FulfilmentStatus='SentToReseller'").SingleAsync();
            log.WriteLine($"Partner-held units before Down: {held}. After Down migration: consignment tables remaining={tables.Count}. Tags marked SentToReseller with no custody record={shelf}.");
            Assert.Empty(tables);
        }
    }
}
