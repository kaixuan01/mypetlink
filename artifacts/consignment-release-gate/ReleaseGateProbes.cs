using System.Data.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using Xunit.Abstractions;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Release-gate verification probes for N1-N9. Synthetic data, disposable SQL Server only.
[Collection("PDF document rendering")]
public sealed class ReleaseGateProbes(ITestOutputHelper log)
{
    static readonly Guid Branch = Guid.Parse("e8000000-0000-0000-0000-0000000000b1");
    static readonly Guid UserC = Guid.Parse("e8000000-0000-0000-0000-0000000000c3");
    static readonly Guid A = AdminAccountId, B = OwnerAccountId, C = UserC; // three distinct admin users

    sealed class Capture : DbCommandInterceptor
    {
        public readonly List<string> Sql = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand c, CommandEventData e, InterceptionResult<DbDataReader> r, CancellationToken ct = default)
        { lock (Sql) Sql.Add(c.CommandText); return base.ReaderExecutingAsync(c, e, r, ct); }
    }

    static async Task<RelationalScope> Db(int stock, IInterceptor? interceptor = null)
    {
        Assert.True(RelationalDatabase.IsAvailable);
        var scope = await RelationalDatabase.CreateAsync(interceptor, enableRetryOnFailure: true);
        await using var db = scope.NewContext();
        await SeedAsync(db, qrStock: 0, nfcStock: stock);
        await ReceivedStockFixture.ReceiveAllAsync(db, NfcVariantId);
        db.Users.Add(new User { Id = UserC, Email = "qa.c@mypetlink.local", NormalizedEmail = "QA.C@MYPETLINK.LOCAL", DisplayName = "QA C", Status = UserStatus.Active, CreatedAt = Now, UpdatedAt = Now });
        db.AdminUsers.Add(new AdminUser { Id = Guid.NewGuid(), UserId = OwnerAccountId, IsActive = true });
        db.AdminUsers.Add(new AdminUser { Id = Guid.NewGuid(), UserId = UserC, IsActive = true });
        db.MerchantBranches.Add(new MerchantBranch { Id = Branch, MerchantId = MerchantId, Name = "SYN branch", AddressLine1 = "1 Synthetic Road",
            Postcode = "50000", City = "KL", State = "KL", Country = "Malaysia", IsActive = true });
        var tags = await db.SmartTags.OrderBy(t => t.Id).ToListAsync();
        const string al = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (var i = 0; i < tags.Count; i++) tags[i].TagCode = "MPL-TEST-" + new string([al[(i / 1024) % 32], al[(i / 32) % 32], al[i % 32], 'Q']);
        var id = await db.BusinessIdentitySettings.SingleAsync();
        id.LegalBusinessName = "SYN Seller"; id.BrandName = "MyPetLink"; id.BusinessRegistrationNumber = "SYN-REG"; id.RegisteredAddressLine1 = "Addr";
        id.RegisteredPostcode = "50000"; id.RegisteredCity = "KL"; id.RegisteredState = "KL"; id.RegisteredCountry = "Malaysia"; id.SupportEmail = "syn@example.invalid";
        await db.SaveChangesAsync();
        return scope;
    }
    static ConsignmentService S(MyPetLinkDbContext db, DateTimeOffset? at = null)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor()); var c = new FixedClock(at ?? Now);
        return new(db, audit, new BusinessIdentityService(db, audit, c), new DocumentNumberService(db), c);
    }
    static SaveConsignmentAgreementRequest Terms(decimal rate = 35m) => new(MerchantId, "SYN-AGR", rate, Now.AddDays(-1), null,
        "SYN duration", "SYN settlement", 14, "SYN discounts", "SYN returns", "SYN loss", "SYN-SIGNED", "SYN-TRACKER");
    static async Task<ConsignmentAgreementResponse> Approved(MyPetLinkDbContext db)
    {
        var a = await S(db).SaveAgreementAsync(A, null, Terms(), null, default);
        return await S(db).AgreementActionAsync(B, a.Id, "approve", new(a.ConcurrencyToken, "SYN approval"), default);
    }
    static ReserveConsignmentRequest R(Guid agreement, int qty, string key) => new(agreement,
        "SYN branch, 1 Synthetic Road, 50000, KL, KL, Malaysia", "SYN-TRACKER", key, [new(NfcVariantId, qty)], Branch);
    static ConsignmentActionRequest Act(ConsignmentDispatchResponse d, string reference, IReadOnlyList<Guid>? units = null) => new(d.ConcurrencyToken, reference, units);
    async Task<string> Err(Func<Task> f) { try { await f(); return "OK"; } catch (ApiException e) { return $"{e.StatusCode} {e.Code}: {e.Message}"; } }
    static int Finance(MyPetLinkDbContext db) => db.MerchantInvoices.Count() + db.MerchantPayments.Count() + db.MerchantReceipts.Count()
        + db.SalesCommissions.Count() + db.CommissionPayouts.Count() + db.TagOrders.Count(o => o.OrderNumber != "MPL-ORD-260806-9001");
    static async Task RetailOrder(MyPetLinkDbContext db, int qty)
    {
        var r = await SeedRetailOrderAsync(db);
        var item = await db.TagOrderItems.Include(x => x.Order).SingleAsync(x => x.Id == r.OrderItemId);
        item.ProductVariantId = NfcVariantId; item.Quantity = qty; await db.SaveChangesAsync();
    }
    static async Task SetPending(MyPetLinkDbContext db, int n)
    {
        var shelf = await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db, NfcVariantId)).OrderBy(t => t.TagCode).Take(n).ToListAsync();
        foreach (var t in shelf) t.QaStatus = PhysicalQaStatus.Pending; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
    }
    static ConsignmentReceiptEvidence Rx(int qty, int damaged, int missing, IEnumerable<Guid>? good = null, IEnumerable<Guid>? dmg = null, IEnumerable<Guid>? miss = null, IEnumerable<Guid>? ret = null, string evidence = "SYN-SIGNED-RX")
        => new("SYN recipient", Now, qty, damaged, missing, evidence, good?.ToArray(), dmg?.ToArray(), miss?.ToArray(), ret?.ToArray());

    [Fact]
    public async Task G01_N1_HeldShipmentsNoLongerBlockedAndH1StillGuardsNewClaims()
    {
        await using var scope = await Db(8); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await S(db).ReserveAsync(A, R(a.Id, 4, "g01"), default);
        await SetPending(db, 3); await RetailOrder(db, 2);
        log.WriteLine("Consignment: reserved 4, then later paid retail 2 vs shelf 1 Passed + 3 Pending.");
        log.WriteLine("  Dispatch held reservation: " + await Err(() => S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN-SHIP"), default)));
        log.WriteLine("  New reservation of the 1 remaining Passed unit: " + await Err(() => S(db).ReserveAsync(A, R(a.Id, 1, "g01b"), default)));

        await using var scope2 = await Db(8); await using var db2 = scope2.NewContext();
        db2.MerchantOrderItems.Remove(await db2.MerchantOrderItems.SingleAsync(x => x.Id == QrItemId)); await db2.SaveChangesAsync();
        var order = await db2.MerchantOrders.SingleAsync(x => x.Id == OrderId);
        order.MerchandiseSubtotal = (await db2.MerchantOrderItems.SingleAsync(x => x.Id == NfcItemId)).LineSubtotal;
        order.DiscountTotal = 0; order.DeliveryFee = 0; order.GrandTotal = order.MerchandiseSubtotal; await db2.SaveChangesAsync();
        await IssueInvoiceAsync(db2);
        await Service(db2).AutoAllocateAsync(A, OrderId, new(NfcItemId, 4)); db2.ChangeTracker.Clear();
        await SetPending(db2, 3); await RetailOrder(db2, 2);
        log.WriteLine("Wholesale: 4 allocated, later paid retail 2 vs shelf 1 Passed + 3 Pending.");
        log.WriteLine("  Mark Ready to Ship: " + await Err(() => Service(db2).MarkReadyToShipAsync(A, OrderId, new())));
        db2.ChangeTracker.Clear();

        log.WriteLine("  Mark Shipped: " + await Err(() => Service(db2).MarkShippedAsync(A, OrderId, new(null, "Test Courier", null, "TRACK-G01", 0, null))));
        // Held QA downgrade must still block.
        await using var scope3 = await Db(4); await using var db3 = scope3.NewContext(); var a3 = await Approved(db3);
        var d3 = await S(db3).ReserveAsync(A, R(a3.Id, 4, "g01c"), default);
        var t = await db3.SmartTags.SingleAsync(x => x.Id == db3.ConsignmentUnits.First().SmartTagId); t.QaStatus = PhysicalQaStatus.Failed; await db3.SaveChangesAsync(); db3.ChangeTracker.Clear();
        log.WriteLine("Held unit failed QA after reservation, dispatch: " + await Err(() => S(db3).ActionAsync(A, d3.Id, "dispatch", Act(d3, "SYN"), default)));
    }

    [Fact]
    public async Task G02_N2_N4_Exact100_98Good_1Damaged_1Missing()
    {
        await using var scope = await Db(100); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await S(db).ReserveAsync(A, R(a.Id, 100, "g02"), default);
        d = await S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN-SHIP-100"), default);
        var ids = d.Units.Select(u => u.Id).ToArray(); var dmg = ids[0]; var miss = ids[1]; var good = ids.Skip(2).ToArray();
        log.WriteLine("Dispatcher A records the partial receipt: " + await Err(() => S(db).ActionAsync(A, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(99, 1, 1, good, [dmg], [miss]) }, default)));
        log.WriteLine("Untruthful total (100 counted, 1 missing): " + await Err(() => S(db).ActionAsync(B, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(100, 1, 1, good, [dmg], [miss]) }, default)));
        d = await S(db).ActionAsync(B, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(99, 1, 1, good, [dmg], [miss]) }, default);
        var replay = await Err(() => S(db).ActionAsync(B, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(99, 1, 1, good, [dmg], [miss]) }, default));
        var mv = await db.ConsignmentMovements.CountAsync(m => m.DispatchId == d.Id && m.Action == "record-discrepancy");
        d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine($"B records truthful 99 counted (98 good + 1 damaged) + 1 missing. Exact replay: {replay}; discrepancy movements={mv}");
        log.WriteLine($"  Dispatch={d.Status}; units Received={d.Units.Count(u => u.Status == "Received")}; receiving Good={d.Units.Count(u => u.ReceivingState == "Good")}, Damaged={d.Units.Count(u => u.ReceivingState == "Damaged")}, Missing={d.Units.Count(u => u.ReceivingState == "Missing")}; ReceivedQuantity={d.ReceivedQuantity}");
        log.WriteLine("  Handover of a good unit while issues open: " + await Err(() => S(db).ActionAsync(B, d.Id, "external-handover", Act(d, "ev", [good[0]]) with { Handover = new("SALE-G02-1", Now, false, null, null, null) }, default)));
        d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine("  Handover of the missing unit: " + await Err(() => S(db).ActionAsync(B, d.Id, "external-handover", Act(d, "ev", [miss]) with { Handover = new("SALE-G02-2", Now, false, null, null, null) }, default)));
        log.WriteLine("  Handover of the damaged unit: " + await Err(() => S(db).ActionAsync(B, d.Id, "external-handover", Act(d, "ev", [dmg]) with { Handover = new("SALE-G02-3", Now, false, null, null, null) }, default)));
        var missTag = await db.ConsignmentUnits.Where(u => u.Id == miss).Select(u => u.SmartTag.TagCode).SingleAsync();
        var pet = Guid.NewGuid(); db.Pets.Add(new Pet { Id = pet, OwnerUserId = OwnerAccountId, Slug = "g02-pet", Name = "Probe", Species = "Dog", LifecycleStatus = PetLifecycleStatus.Active }); await db.SaveChangesAsync();
        string act; try { await new SmartTagService(db, new AuditLogService(db, new HttpContextAccessor())).ActivateAsync(OwnerAccountId, missTag, new(pet)); act = "activated"; } catch (ApiException e) { act = e.Code; }
        log.WriteLine("  Customer activation of the MISSING unit's tag: " + act);
        db.ChangeTracker.Clear(); d = await S(db).GetAsync(d.Id, false, default);
        d = await S(db).ActionAsync(A, d.Id, "return", Act(d, "SYN damaged returned to warehouse", [dmg]), default);
        log.WriteLine("Damaged unit physically returned by A.");
        log.WriteLine("  Recorder B resolves: " + await Err(() => S(db).ActionAsync(B, d.Id, "resolve-discrepancy", Act(d, "REV-1") with { Receipt = Rx(0, 0, 0, ret: [dmg]) }, default)));
        log.WriteLine("  Dispatcher A resolves: " + await Err(() => S(db).ActionAsync(A, d.Id, "resolve-discrepancy", Act(d, "REV-1") with { Receipt = Rx(0, 0, 0, ret: [dmg]) }, default)));
        var tag = await db.SmartTags.SingleAsync(t => t.Id == db.ConsignmentUnits.Single(u => u.Id == dmg).SmartTagId);
        tag.QaStatus = PhysicalQaStatus.Passed; tag.QaVersion++; tag.QaInspectedAt = Now.AddMinutes(5); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine("  Release returned unit (QA Passed) BEFORE independent review: " + await Err(() => S(db).ActionAsync(A, d.Id, "release", Act(d, "early", [dmg]), default)));
        d = await S(db).ActionAsync(C, d.Id, "resolve-discrepancy", Act(d, "REV-1") with { Receipt = Rx(0, 0, 0, ret: [dmg]) }, default);
        log.WriteLine($"  Third operator C reviews return: OK; damaged unit receiving={d.Units.Single(u => u.Id == dmg).ReceivingState}; ReceivedQuantity still={d.ReceivedQuantity}; recipient={d.RecipientName}");
        log.WriteLine("  C 'resolves' missing as still missing: " + await Err(() => S(db).ActionAsync(C, d.Id, "resolve-discrepancy", Act(d, "REV-2") with { Receipt = Rx(0, 0, 1, miss: [miss]) }, default)));
        log.WriteLine("  Close agreement with missing unit open: " + await Err(async () => { var ag = (await S(db).AgreementsAsync(1, 5, null, default)).Items.Single(); await S(db).AgreementActionAsync(C, ag.Id, "close", new(ag.ConcurrencyToken, "close"), default); }));
        d = await S(db).GetAsync(d.Id, false, default);
        d = await S(db).ActionAsync(C, d.Id, "resolve-discrepancy", Act(d, "REV-3 located at shop") with { Receipt = Rx(1, 0, 0, good: [miss], evidence: "SYN-SIGNED-RX-2") }, default);
        log.WriteLine($"  C confirms missing unit located at the partner: dispatch={d.Status}; openDiscrepancy={d.HasOpenDiscrepancy}; Good={d.Units.Count(u => u.ReceivingState == "Good")}; ReceivedQuantity={d.ReceivedQuantity}");
        log.WriteLine($"Finance rows: {Finance(db)}");
        Assert.Equal(0, Finance(db));
    }

    [Fact]
    public async Task G03_N3_ContributorsExcluded()
    {
        await using var scope = await Db(2); await using var db = scope.NewContext();
        var a = await S(db).SaveAgreementAsync(A, null, Terms(), null, default);
        a = await S(db).SaveAgreementAsync(B, a.Id, Terms(35.00m), a.ConcurrencyToken, default);
        log.WriteLine("B no-op save (35 vs 35.00), A creator approves: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x"), default)));
        a = (await S(db).AgreementsAsync(1, 5, null, default)).Items.Single();
        a = await S(db).SaveAgreementAsync(B, a.Id, Terms(30m), a.ConcurrencyToken, default);
        a = await S(db).SaveAgreementAsync(B, a.Id, Terms(35m), a.ConcurrencyToken, default);
        log.WriteLine("B changed 35->30->35 (reverted). A approves: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x"), default)));
        log.WriteLine("B approves: " + await Err(() => S(db).AgreementActionAsync(B, a.Id, "approve", new(a.ConcurrencyToken, "x"), default)));
        log.WriteLine($"Contributors recorded: {await db.ConsignmentDraftContributors.CountAsync()}");
        log.WriteLine("C (never edited) approves: " + await Err(() => S(db).AgreementActionAsync(C, a.Id, "approve", new(a.ConcurrencyToken, "x"), default)));
        // No-op-only editor may approve
        await using var scope2 = await Db(2); await using var db2 = scope2.NewContext();
        var b = await S(db2).SaveAgreementAsync(A, null, Terms(), null, default);
        b = await S(db2).SaveAgreementAsync(B, b.Id, Terms(), b.ConcurrencyToken, default);
        log.WriteLine("Only a no-op save by B, then B approves: " + await Err(() => S(db2).AgreementActionAsync(B, b.Id, "approve", new(b.ConcurrencyToken, "x"), default)));
    }

    [Fact]
    public async Task G04_N5_ReuseFlagAndNoExtraTags()
    {
        await using var scope = await Db(8); await using var db = scope.NewContext(); var a = await Approved(db);
        var first = await S(db).ReserveAsync(A, R(a.Id, 4, "k1"), default);
        var again = await S(db).ReserveAsync(A, R(a.Id, 4, "k2-new-key"), default);
        var held = await db.ConsignmentUnits.CountAsync(u => u.ReleasedAt == null);
        log.WriteLine($"First: reused={first.ReservationReused}. Same payload new key: reused={again.ReservationReused} sameId={first.Id == again.Id}; held units={held}; dispatches={await db.ConsignmentDispatches.CountAsync()}");
        var other = await S(db).ReserveAsync(A, R(a.Id, 2, "k3") with { ExternalTrackerReference = "SYN-TRACKER-2" }, default);
        log.WriteLine($"Different content: reused={other.ReservationReused}; held units={await db.ConsignmentUnits.CountAsync(u => u.ReleasedAt == null)}");
    }

    [Fact]
    public async Task G05_N6_ReadsOmitPdfBytes_PdfUnchanged()
    {
        var cap = new Capture();
        await using var scope = await Db(4, cap); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await S(db).ReserveAsync(A, R(a.Id, 4, "g05"), default);
        d = await S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN"), default);
        var docs = new ConsignmentDocumentService(db, S(db), new AuditLogService(db, new HttpContextAccessor()));
        var h0 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData((await docs.PdfAsync(A, d.Id, default)).Content));
        lock (cap.Sql) cap.Sql.Clear();
        await S(db).DispatchesAsync(1, 20, null, default); await S(db).GetAsync(d.Id, false, default);
        string[] reads; lock (cap.Sql) reads = cap.Sql.ToArray();
        log.WriteLine($"List+detail SQL statements={reads.Length}; any selects IssuedDocumentContent={reads.Any(s => s.Contains("IssuedDocumentContent"))}");
        d = await S(db).ActionAsync(B, d.Id, "receive", Act(d, "rx") with { Receipt = Rx(4, 0, 0) }, default);
        var h1 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData((await docs.PdfAsync(A, d.Id, default)).Content));
        log.WriteLine($"PDF identical after receipt={h0 == h1}; HasIssuedDocument={d.HasIssuedDocument}");
        Assert.DoesNotContain(reads, s => s.Contains("IssuedDocumentContent"));
    }

    [Fact]
    public async Task G06_N7_AmountBounds()
    {
        await using var scope = await Db(6); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await S(db).ReserveAsync(A, R(a.Id, 6, "g06"), default);
        d = await S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN"), default);
        d = await S(db).ActionAsync(B, d.Id, "receive", Act(d, "rx") with { Receipt = Rx(6, 0, 0) }, default);
        int i = 0;
        foreach (var (price, disc) in new (decimal, decimal)[] { (1_000_000_000_000_000m, 0m), (1_000_000m, 0m), (-1m, 0m), (34.90m, -1m), (34.905m, 0m), (999_999.99m, 0m), (49.90m, 0m) })
        {
            d = await S(db).GetAsync(d.Id, false, default);
            var unit = d.Units.First(u => u.Status == "Received");
            log.WriteLine($"price={price} discount={disc}: " + await Err(() => S(db).ActionAsync(B, d.Id, "external-handover", Act(d, "ev", [unit.Id]) with { Handover = new($"SALE-G06-{i++}", Now, true, price, disc, disc > 0 ? "x" : null) }, default)));
        }
    }

    [Fact]
    public async Task G07_N8_N9_HistoryFieldsAndStableReferences()
    {
        await using var scope = await Db(4); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await S(db).ReserveAsync(A, R(a.Id, 4, "g07"), default);
        var before = d.Units.ToDictionary(u => u.Id, u => u.UnitReference);
        var order1 = string.Join(",", d.Units.Select(u => u.UnitReference[..8]));
        // Reverse tag-code sort order without touching unit ids.
        var units = await db.ConsignmentUnits.ToListAsync();
        foreach (var u in units) u.TagCodeSnapshot = "MPL-TEST-" + new string(u.TagCodeSnapshot.Reverse().Take(4).ToArray());
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        d = await S(db).GetAsync(d.Id, false, default);
        var order2 = string.Join(",", d.Units.Select(u => u.UnitReference[..8]));
        log.WriteLine($"Display order changed={order1 != order2}; every unit kept its reference={d.Units.All(u => before[u.Id] == u.UnitReference)}; sample={d.Units[0].UnitReference}; contains tag code={d.Units.Any(u => u.UnitReference.Contains("MPL"))}");
        d = await S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN-SHIP"), default);
        d = await S(db).ActionAsync(B, d.Id, "receive", Act(d, "SYN-RX-REF") with { Receipt = Rx(4, 0, 0) }, default);
        var m = d.History.First(h => h.Action is "receive" or "received");
        log.WriteLine($"History entry: action={m.Action} | actor={m.ActorName} | unit={m.UnitId?.ToString() ?? "whole delivery"} | reference={m.Reference} | evidence={m.EvidenceJson?[..Math.Min(80, m.EvidenceJson.Length)]}");
    }

    [Fact]
    public async Task G08_ConcurrentConflictingFindingsOneWinner()
    {
        await using var scope = await Db(4); Guid did; ConsignmentDispatchResponse d;
        await using (var db = scope.NewContext()) { var a = await Approved(db); d = await S(db).ReserveAsync(A, R(a.Id, 4, "g08"), default); d = await S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN"), default); did = d.Id; }
        var ids = d.Units.Select(u => u.Id).ToArray();
        var go = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<string> Run(Guid actor, ConsignmentReceiptEvidence rx, string reference) { await go.Task; await using var db = scope.NewContext(); try { await S(db).ActionAsync(actor, did, "record-discrepancy", Act(d, reference) with { Receipt = rx }, default); return "won"; } catch (ApiException e) { return e.Code; } }
        var t = new[] { Run(B, Rx(3, 0, 1, ids[1..], null, [ids[0]]), "B-RX"), Run(C, Rx(3, 1, 1, [ids[1], ids[2]], [ids[3]], [ids[0]]), "C-RX") };
        go.SetResult(); var r = await Task.WhenAll(t);
        await using var check = scope.NewContext();
        log.WriteLine($"Concurrent conflicting findings by B and C: {string.Join(" | ", r)}; receiving-unit movements={await check.ConsignmentMovements.CountAsync(m => m.Action == "receiving-unit")}");
    }
}
