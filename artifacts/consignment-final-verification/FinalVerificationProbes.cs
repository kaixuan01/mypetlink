using Microsoft.AspNetCore.Http;
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

// Independent final verification probes. Synthetic data, disposable SQL Server databases only.
// Each test asserts OBSERVED behaviour and logs evidence.
[Collection("PDF document rendering")]
public sealed class FinalVerificationProbes(ITestOutputHelper log)
{
    static readonly Guid Branch = Guid.Parse("e9000000-0000-0000-0000-0000000000b1");
    static readonly Guid ForeignBranch = Guid.Parse("e9000000-0000-0000-0000-0000000000b2");
    static readonly Guid CheckerAdmin = Guid.Parse("e9000000-0000-0000-0000-0000000000c1");
    static readonly Guid Maker = AdminAccountId, Checker = OwnerAccountId; // user ids of two distinct admin records

    static MerchantBranch B(Guid id, Guid merchant, bool active = true) => new() { Id = id, MerchantId = merchant, Name = "SYN branch " + id.ToString()[..4],
        AddressLine1 = "1 Synthetic Road", Postcode = "50000", City = "Kuala Lumpur", State = "Kuala Lumpur", Country = "Malaysia", IsActive = active };

    static async Task<RelationalScope> Db(int stock)
    {
        Assert.True(RelationalDatabase.IsAvailable);
        var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using var db = scope.NewContext();
        await SeedAsync(db, qrStock: 0, nfcStock: stock);
        await ReceivedStockFixture.ReceiveAllAsync(db, NfcVariantId);
        await Setup(db);
        return scope;
    }
    static async Task Setup(MyPetLinkDbContext db)
    {
        db.AdminUsers.Add(new AdminUser { Id = CheckerAdmin, UserId = OwnerAccountId, IsActive = true });
        db.MerchantBranches.Add(B(Branch, MerchantId));
        db.MerchantBranches.Add(B(ForeignBranch, OtherMerchantId));
        var id = await db.BusinessIdentitySettings.SingleAsync();
        id.LegalBusinessName = "SYN Seller"; id.BrandName = "MyPetLink"; id.BusinessRegistrationNumber = "SYN-REG"; id.RegisteredAddressLine1 = "Addr";
        id.RegisteredPostcode = "50000"; id.RegisteredCity = "KL"; id.RegisteredState = "KL"; id.RegisteredCountry = "Malaysia"; id.SupportEmail = "syn@example.invalid";
        await db.SaveChangesAsync();
    }
    static ConsignmentService S(MyPetLinkDbContext db, DateTimeOffset? at = null)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor()); var c = new FixedClock(at ?? Now);
        return new(db, audit, new BusinessIdentityService(db, audit, c), new DocumentNumberService(db), c);
    }
    static ConsignmentDocumentService Docs(MyPetLinkDbContext db) => new(db, S(db), new AuditLogService(db, new HttpContextAccessor()));
    static SaveConsignmentAgreementRequest Terms(string reference = "SYN-AGR", Guid? supersedes = null) => new(MerchantId, reference, 35m, Now.AddDays(-1), null,
        "SYN duration", "SYN settlement", 14, "SYN discounts", "SYN returns", "SYN loss", "SYN-SIGNED", "SYN-TRACKER", supersedes);
    static async Task<ConsignmentAgreementResponse> Approved(MyPetLinkDbContext db)
    {
        var a = await S(db).SaveAgreementAsync(Maker, null, Terms(), null, default);
        return await S(db).AgreementActionAsync(Checker, a.Id, "approve", new(a.ConcurrencyToken, "SYN approval"), default);
    }
    static ReserveConsignmentRequest R(Guid agreement, int qty, string key, Guid? branch = null, string? dest = null) =>
        new(agreement, dest ?? ConsignmentService.BranchDestination(B(Branch, MerchantId)), "SYN-TRACKER", key, [new(NfcVariantId, qty)], branch ?? Branch);
    static ConsignmentActionRequest A(ConsignmentDispatchResponse d, string reference, IReadOnlyList<Guid>? units = null) => new(d.ConcurrencyToken, reference, units);
    static ConsignmentReceiptEvidence Rx(int qty, int missing = 0, int damaged = 0) => new("SYN recipient", Now, qty, damaged, missing, "SYN-SIGNED-RX");
    static ConsignmentHandoverEvidence H(string reference, Guid? supersedes = null, bool sale = false, decimal? price = null, decimal? disc = null) =>
        new(reference, Now, sale, price, disc, disc > 0 ? "SYN promo" : null, supersedes);
    static async Task<ConsignmentDispatchResponse> Dispatched(MyPetLinkDbContext db, Guid agreement, int qty, string key)
    {
        var d = await S(db).ReserveAsync(Maker, R(agreement, qty, key), default);
        return await S(db).ActionAsync(Maker, d.Id, "dispatch", A(d, "SYN-SHIP-" + key), default);
    }
    async Task<string> Err(Func<Task> f) { try { await f(); return "OK"; } catch (ApiException e) { return $"{e.StatusCode} {e.Code}: {e.Message}"; } }
    static Task<int> FinanceRows(MyPetLinkDbContext db) => Task.FromResult(db.MerchantInvoices.Count() + db.MerchantPayments.Count() + db.MerchantReceipts.Count()
        + db.SalesCommissions.Count() + db.TagOrders.Count(o => o.OrderNumber != "MPL-ORD-260806-9001") + db.CommissionPayouts.Count());
    static async Task RetailOrder(MyPetLinkDbContext db, int qty, OrderStatus status = OrderStatus.PaymentConfirmed)
    {
        var r = await SeedRetailOrderAsync(db);
        var item = await db.TagOrderItems.Include(x => x.Order).SingleAsync(x => x.Id == r.OrderItemId);
        item.ProductVariantId = NfcVariantId; item.Quantity = qty; item.Order.Status = status; await db.SaveChangesAsync();
    }
    static async Task SetPending(MyPetLinkDbContext db, int n)
    {
        var shelf = await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db, NfcVariantId)).OrderBy(t => t.TagCode).Take(n).ToListAsync();
        foreach (var t in shelf) t.QaStatus = PhysicalQaStatus.Pending; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
    }

    [Fact]
    public async Task V01_H1_OriginalP01IsBlocked_AndSmallerReservationAllowed()
    {
        await using var scope = await Db(6); await using var db = scope.NewContext(); var a = await Approved(db);
        await SetPending(db, 2); await RetailOrder(db, 2);
        log.WriteLine("Setup: 4 Passed + 2 Pending on shelf, paid retail reservation of 2.");
        log.WriteLine("Reserve all 4 Passed: " + await Err(() => S(db).ReserveAsync(Maker, R(a.Id, 4, "v01a"), default)));
        log.WriteLine("Reserve 2 Passed: " + await Err(() => S(db).ReserveAsync(Maker, R(a.Id, 2, "v01b"), default)));
        var passedLeft = await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db, NfcVariantId)).CountAsync();
        log.WriteLine($"Passed units still on shelf for the paid order: {passedLeft}");
        Assert.Equal(2, passedLeft);
    }

    [Fact]
    public async Task V02_DispatchRecheckBlocksConsignmentForLaterRetailOrdersEvenThoughHeldUnitsAreAlreadyOffShelf()
    {
        await using var scope = await Db(8); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await S(db).ReserveAsync(Maker, R(a.Id, 4, "v02"), default);
        await SetPending(db, 3); await RetailOrder(db, 2);
        var shelfPassed = await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db, NfcVariantId)).CountAsync();
        log.WriteLine($"After reserving 4: a later paid retail order of 2 arrives; shelf has {shelfPassed} Passed + 3 Pending (retail checkout accepted it).");
        var r = await Err(() => S(db).ActionAsync(Maker, d.Id, "dispatch", A(d, "SYN-SHIP"), default));
        log.WriteLine("Dispatch of the already-held reservation: " + r);
        var after = await db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db, NfcVariantId)).CountAsync();
        log.WriteLine($"Shelf Passed after attempt: {after} (dispatching the held units cannot change this number).");
    }

    [Fact]
    public async Task V03_WholesaleReadyToShipBlockedByLaterRetailOrdersOnPendingStock()
    {
        await using var scope = await Db(8); await using var db = scope.NewContext();
        db.MerchantOrderItems.Remove(await db.MerchantOrderItems.SingleAsync(x => x.Id == QrItemId)); await db.SaveChangesAsync();
        var order = await db.MerchantOrders.SingleAsync(x => x.Id == OrderId);
        order.MerchandiseSubtotal = (await db.MerchantOrderItems.SingleAsync(x => x.Id == NfcItemId)).LineSubtotal;
        order.DiscountTotal = 0; order.DeliveryFee = 0; order.GrandTotal = order.MerchandiseSubtotal; await db.SaveChangesAsync();
        await IssueInvoiceAsync(db);
        var f = Service(db); await f.AutoAllocateAsync(AdminAccountId, OrderId, new(NfcItemId, 4));
        db.ChangeTracker.Clear();
        await SetPending(db, 3); await RetailOrder(db, 2);
        log.WriteLine("Wholesale order fully allocated (4 held). Later paid retail order 2; shelf = 1 Passed + 3 Pending.");
        var r = await Err(() => Service(db).MarkReadyToShipAsync(AdminAccountId, OrderId, new()));
        log.WriteLine("Wholesale Mark Ready to Ship: " + r);
    }

    [Fact]
    public async Task V04_H2_MakerChecker_ReceiptIndependence_Evidence()
    {
        await using var scope = await Db(4); await using var db = scope.NewContext();
        var a = await S(db).SaveAgreementAsync(Maker, null, Terms(), null, default);
        log.WriteLine("Maker self-approval: " + await Err(() => S(db).AgreementActionAsync(Maker, a.Id, "approve", new(a.ConcurrencyToken, "self"), default)));
        // Checker edits, then maker approves: allowed because the rule is 'last editor'.
        var edited = await S(db).SaveAgreementAsync(Checker, a.Id, Terms(), a.ConcurrencyToken, default);
        log.WriteLine("Original maker approves after checker's no-change edit: " + await Err(() => S(db).AgreementActionAsync(Maker, a.Id, "approve", new(edited.ConcurrencyToken, "maker approves"), default)));
        var agr = (await S(db).AgreementsAsync(1, 10, null, default)).Items.Single();
        var d = await Dispatched(db, agr.Id, 4, "v04");
        log.WriteLine("Dispatcher records receipt: " + await Err(() => S(db).ActionAsync(Maker, d.Id, "receive", A(d, "rx") with { Receipt = Rx(4) }, default)));
        log.WriteLine("Other operator, no evidence: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "receive", A(d, "rx"), default)));
        log.WriteLine("Other operator, evidence ref 'x': " + await Err(() => S(db).ActionAsync(Checker, d.Id, "receive", A(d, "rx") with { Receipt = Rx(4) with { SignedEvidenceReference = "x" } }, default)));
        log.WriteLine("Other operator, counts not adding up: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "receive", A(d, "rx") with { Receipt = Rx(3) }, default)));
        log.WriteLine("Other operator, complete evidence: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "receive", A(d, "rx") with { Receipt = Rx(4) }, default)));
    }

    [Fact]
    public async Task V05_M8_ShortDeliveryBlocksAllHandoversAndCannotResolveAfterReturningDamagedUnit()
    {
        await using var scope = await Db(4); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await Dispatched(db, a.Id, 4, "v05");
        log.WriteLine("Receipt 3 counted +1 missing: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "receive", A(d, "rx") with { Receipt = Rx(3, missing: 1) }, default)));
        d = await S(db).GetAsync(d.Id, false, default);
        d = await S(db).ActionAsync(Checker, d.Id, "record-discrepancy", A(d, "SYN short") with { Receipt = Rx(3, missing: 1) }, default);
        log.WriteLine($"Discrepancy recorded: status={d.Status} open={d.HasOpenDiscrepancy}");
        log.WriteLine("Handover of one of the 3 units that DID arrive: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[0].Id]) with { Handover = H("SALE-V05-1") }, default)));
        log.WriteLine("Same recorder resolves own discrepancy with full recount: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "resolve-discrepancy", A(d, "SYN found") with { Receipt = Rx(4) }, default)));

        // Damaged-unit scenario on a fresh dispatch: partner returns the damaged unit, then the business tries to resolve.
        await using var scope2 = await Db(4); await using var db2 = scope2.NewContext(); var a2 = await Approved(db2);
        var e = await Dispatched(db2, a2.Id, 4, "v05b");
        e = await S(db2).ActionAsync(Checker, e.Id, "record-discrepancy", A(e, "SYN damaged") with { Receipt = Rx(4, damaged: 1) }, default);
        e = await S(db2).ActionAsync(Maker, e.Id, "return", A(e, "SYN damaged returned", [e.Units[0].Id]), default);
        log.WriteLine($"Damaged unit physically returned: partner now holds {e.PartnerHeld}, quarantine {e.ReturnedQuarantine}.");
        log.WriteLine("Resolve with truthful recount (3 good, 0 missing): " + await Err(() => S(db2).ActionAsync(Checker, e.Id, "resolve-discrepancy", A(e, "SYN") with { Receipt = Rx(3) }, default)));
        log.WriteLine("Receive with truthful count 3: " + await Err(() => S(db2).ActionAsync(Checker, e.Id, "receive", A(e, "SYN") with { Receipt = Rx(3) }, default)));
        log.WriteLine("Handover blocked meanwhile: " + await Err(() => S(db2).ActionAsync(Checker, e.Id, "external-handover", A(e, "SYN", [e.Units[1].Id]) with { Handover = H("SALE-V05-2") }, default)));
    }

    [Fact]
    public async Task V06_H3_HandoverUniquenessCorrectionReversalAndExport()
    {
        await using var scope = await Db(4); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await Dispatched(db, a.Id, 4, "v06");
        d = await S(db).ActionAsync(Checker, d.Id, "receive", A(d, "rx") with { Receipt = Rx(4) }, default);
        d = await S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[0].Id]) with { Handover = H("SALE-0001", sale: true, price: 34.90m, disc: 5m) }, default);
        log.WriteLine("Same ref on another unit: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[1].Id]) with { Handover = H("SALE-0001") }, default)));
        d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine("Case/space variant ' sale-0001 ': " + await Err(() => S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[1].Id]) with { Handover = H(" sale-0001 ") }, default)));
        d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine("Two units in one request: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[1].Id, d.Units[2].Id]) with { Handover = H("SALE-0002") }, default)));
        log.WriteLine("Reported sale without price: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[1].Id]) with { Handover = H("SALE-0003", sale: true) }, default)));
        log.WriteLine("Price with 3 decimals: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[1].Id]) with { Handover = H("SALE-0004", sale: true, price: 34.905m, disc: 0m) }, default)));
        log.WriteLine("Absurd price 1e15: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "SYN ev", [d.Units[1].Id]) with { Handover = H("SALE-0005", sale: true, price: 1_000_000_000_000_000m, disc: 0m) }, default)));
        d = await S(db).GetAsync(d.Id, false, default);
        var unit = d.Units.Single(u => u.Id == d.Units[0].Id); var original = unit.CurrentHandoverRecordId!.Value;
        log.WriteLine("Correction reusing original ref: " + await Err(() => S(db).ActionAsync(Checker, d.Id, "correct-handover", A(d, "SYN fix", [unit.Id]) with { Handover = H("SALE-0001", original, true, 39.90m, 0m) }, default)));
        d = await S(db).ActionAsync(Checker, d.Id, "correct-handover", A(d, "SYN fix", [unit.Id]) with { Handover = H("SALE-0001-C1", original, true, 39.90m, 0m) }, default);
        var corr = d.Units.Single(u => u.Id == unit.Id).CurrentHandoverRecordId!.Value;
        log.WriteLine("Second correction of the ORIGINAL (forking lineage): " + await Err(() => S(db).ActionAsync(Checker, d.Id, "correct-handover", A(d, "SYN fork", [unit.Id]) with { Handover = H("SALE-0001-C2", original, true, 39.90m, 0m) }, default)));
        d = await S(db).GetAsync(d.Id, false, default);
        d = await S(db).ActionAsync(Checker, d.Id, "reverse-handover", A(d, "SYN refund", [unit.Id]) with { Handover = H("SALE-0001-R1", corr) }, default);
        log.WriteLine($"After reversal: unit status={d.Units.Single(u => u.Id == unit.Id).Status}; handover records kept={d.Reconciliation.Count} kinds={string.Join(",", d.Reconciliation.Select(r => r.Kind))}");
        var csv = System.Text.Encoding.UTF8.GetString(await Docs(db).ReconciliationCsvAsync(Maker, Now.AddDays(-1), Now.AddDays(1), default));
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        log.WriteLine("Reconciliation CSV header: " + lines[0].Trim());
        log.WriteLine($"Reconciliation CSV data rows: {lines.Length - 1}");
        log.WriteLine("Export > 366 days: " + await Err(() => Docs(db).ReconciliationCsvAsync(Maker, Now.AddDays(-400), Now, default)));
        log.WriteLine($"Finance rows: {await FinanceRows(db)}");
        Assert.Equal(0, await FinanceRows(db));
    }

    [Fact]
    public async Task V07_M1_M2_AgreementRevisionAndClosure()
    {
        await using var scope = await Db(8); await using var db = scope.NewContext(); var a = await Approved(db);
        var res = await S(db).ReserveAsync(Maker, R(a.Id, 2, "v07r"), default);
        var rev = await S(db).SaveAgreementAsync(Maker, null, Terms(supersedes: a.Id), null, default);
        log.WriteLine("Approve v2 while v1 reservation open: " + await Err(() => S(db).AgreementActionAsync(Checker, rev.Id, "approve", new(rev.ConcurrencyToken, "v2"), default)));
        var dsp = await S(db).ActionAsync(Maker, res.Id, "dispatch", A(res, "SYN-SHIP"), default);
        rev = (await S(db).AgreementsAsync(1, 10, null, default)).Items.Single(x => x.Id == rev.Id);
        log.WriteLine("Approve v2 after v1 dispatch: " + await Err(() => S(db).AgreementActionAsync(Checker, rev.Id, "approve", new(rev.ConcurrencyToken, "v2"), default)));
        dsp = await S(db).GetAsync(dsp.Id, false, default);
        log.WriteLine("Receive v1 custody after supersession: " + await Err(() => S(db).ActionAsync(Checker, dsp.Id, "receive", A(dsp, "rx") with { Receipt = Rx(2) }, default)));
        var v2 = (await S(db).AgreementsAsync(1, 10, null, default)).Items.Single(x => x.Id == rev.Id);
        var d2 = await Dispatched(db, v2.Id, 2, "v07b");
        v2 = (await S(db).AgreementsAsync(1, 10, null, default)).Items.Single(x => x.Id == rev.Id);
        log.WriteLine("Close v2 with 2 partner-held: " + await Err(() => S(db).AgreementActionAsync(Checker, v2.Id, "close", new(v2.ConcurrencyToken, "close"), default)));
    }

    [Fact]
    public async Task V08_M3_RefreshDuplicateAndLegitimateSecondReservation()
    {
        await using var scope = await Db(8); await using var db = scope.NewContext(); var a = await Approved(db);
        var first = await S(db).ReserveAsync(Maker, R(a.Id, 4, "tab-1"), default);
        var refresh = await S(db).ReserveAsync(Maker, R(a.Id, 4, "tab-2-after-refresh"), default);
        log.WriteLine($"Identical payload, new key: same dispatch={first.Id == refresh.Id}; dispatches={await db.ConsignmentDispatches.CountAsync()}");
        var intended = await S(db).ReserveAsync(Maker, R(a.Id, 4, "operator-wants-second-carton"), default);
        log.WriteLine($"Deliberate identical second carton while first is Reserved: returned existing={intended.Id == first.Id}; no error shown to operator.");
    }

    [Fact]
    public async Task V09_M4_M6_ErrorsHideCodes_PdfFrozenByteForByte()
    {
        await using var scope = await Db(4); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await S(db).ReserveAsync(Maker, R(a.Id, 4, "v09"), default);
        log.WriteLine("PDF before dispatch: " + await Err(() => Docs(db).PdfAsync(Maker, d.Id, default)));
        var t = await db.SmartTags.SingleAsync(x => x.Id == db.ConsignmentUnits.First().SmartTagId); t.QaStatus = PhysicalQaStatus.Failed; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var msg = await Err(() => S(db).ActionAsync(Maker, d.Id, "dispatch", A(d, "SYN"), default));
        var codes = await db.SmartTags.Select(x => x.TagCode).ToListAsync();
        log.WriteLine($"Dispatch with failed unit: {msg} | contains any Tag Code: {codes.Any(c => msg.Contains(c))}");
        t = await db.SmartTags.SingleAsync(x => x.Id == t.Id); t.QaStatus = PhysicalQaStatus.Passed; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        d = await S(db).GetAsync(d.Id, false, default);
        d = await S(db).ActionAsync(Maker, d.Id, "dispatch", A(d, "SYN-SHIP"), default);
        var h0 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData((await Docs(db).PdfAsync(Maker, d.Id, default)).Content));
        d = await S(db).ActionAsync(Checker, d.Id, "receive", A(d, "rx") with { Receipt = Rx(4) }, default);
        d = await S(db).ActionAsync(Checker, d.Id, "external-handover", A(d, "ev", [d.Units[0].Id]) with { Handover = H("SALE-V09") }, default);
        d = await S(db).ActionAsync(Maker, d.Id, "return", A(d, "ret", [d.Units[1].Id]), default);
        var early = await Err(() => S(db).ActionAsync(Maker, d.Id, "release", A(d, "early", [d.Units[1].Id]), default));
        log.WriteLine($"Early release: {early} | contains any Tag Code: {codes.Any(c => early.Contains(c))}");
        var h1 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData((await Docs(db).PdfAsync(Maker, d.Id, default)).Content));
        var stored = await db.ConsignmentDispatches.Where(x => x.Id == d.Id).Select(x => x.IssuedDocumentSha256).SingleAsync();
        log.WriteLine($"PDF sha at dispatch={h0[..16]}… after receive/handover/return={h1[..16]}… identical={h0 == h1}; stored hash matches={stored == h0}");
        Assert.Equal(h0, h1);
    }

    [Fact]
    public async Task V10_M9_BranchValidation()
    {
        await using var scope = await Db(4); await using var db = scope.NewContext(); var a = await Approved(db);
        log.WriteLine("Foreign merchant branch: " + await Err(() => S(db).ReserveAsync(Maker, R(a.Id, 1, "v10a", ForeignBranch, ConsignmentService.BranchDestination(B(ForeignBranch, OtherMerchantId))), default)));
        log.WriteLine("No branch: " + await Err(() => S(db).ReserveAsync(Maker, new(a.Id, "anything", "SYN-TRACKER", "v10b", [new(NfcVariantId, 1)]), default)));
        log.WriteLine("Edited destination text: " + await Err(() => S(db).ReserveAsync(Maker, R(a.Id, 1, "v10c", Branch, "Somewhere else"), default)));
        var d = await S(db).ReserveAsync(Maker, R(a.Id, 1, "v10d"), default);
        var br = await db.MerchantBranches.SingleAsync(b => b.Id == Branch); br.IsActive = false; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        log.WriteLine("Dispatch after branch deactivated: " + await Err(() => S(db).ActionAsync(Maker, d.Id, "dispatch", A(d, "SYN"), default)));
    }

    [Fact]
    public async Task V11_H3_M10_RealQaFailThenWriteOff_NotResellable()
    {
        await using var scope = await Db(2); await using var db = scope.NewContext(); var a = await Approved(db);
        var d = await Dispatched(db, a.Id, 2, "v11");
        d = await S(db).ActionAsync(Maker, d.Id, "return", A(d, "SYN-RET", [d.Units[0].Id]), default);
        var tag = await db.SmartTags.SingleAsync(t => t.Id == db.ConsignmentUnits.Single(u => u.Id == d.Units[0].Id).SmartTagId);
        var qa = PhysicalQaTests.Service(db, new FixedClock(Now.AddMinutes(1)));
        var qr = await qa.CaptureAsync(Maker, new(tag.TagCode, tag.QaVersion, QaCaptureSource.Camera, $"https://mypetlink.example/q/{tag.TagCode}", null), default);
        var nfc = await qa.CaptureAsync(Maker, new(tag.TagCode, tag.QaVersion, QaCaptureSource.WebNfc, $"https://mypetlink.example/n/{tag.TagCode}", tag.QaNfcSerialNumber ?? "04A1B2C3D4E5F6"), default);
        await qa.SaveAsync(Maker, tag.Id, new(Guid.NewGuid(), tag.QaVersion, PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, qr.Evidence, nfc.Evidence, "SYN damaged"), default);
        db.ChangeTracker.Clear(); d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine("Release failed return: " + await Err(() => S(db).ActionAsync(Maker, d.Id, "release", A(d, "SYN", [d.Units[0].Id]), default)));
        log.WriteLine("Write-off partner-held (not returned) unit: " + await Err(() => S(db).ActionAsync(Maker, d.Id, "write-off", A(d, "SYN", [d.Units[1].Id]), default)));
        d = await S(db).ActionAsync(Maker, d.Id, "write-off", A(d, "SYN damaged write-off", [d.Units[0].Id]), default);
        db.ChangeTracker.Clear();
        var t2 = await db.SmartTags.SingleAsync(t => t.Id == tag.Id);
        var orderable = await db.SmartTags.Where(SellableInventoryRules.OrderableUnit(db)).CountAsync(t => t.Id == tag.Id);
        log.WriteLine($"After write-off: unit={d.Units.Single(u => u.Id == d.Units[0].Id).Status} tagStatus={t2.Status} orderable={orderable} hold kept={await db.ConsignmentUnits.AnyAsync(u => u.SmartTagId == tag.Id && u.ReleasedAt == null)}");
        log.WriteLine("Admin status change on written-off tag: " + await Err(() => InventoryCustodyRules.RequireNoCustodyMutationAsync(db, tag.Id, default)));
    }

    [Fact]
    public async Task V12_H4_DownBlockedForHistoryOnly_AndEmptySchemaDowngrades()
    {
        await using (var scope = await RelationalDatabase.CreateAsync(createSchema: false, enableRetryOnFailure: true))
        {
            await using (var db = scope.NewContext())
            {
                await db.Database.MigrateAsync(); await SeedAsync(db, qrStock: 0, nfcStock: 2); await ReceivedStockFixture.ReceiveAllAsync(db, NfcVariantId); await Setup(db);
                var a = await S(db).SaveAgreementAsync(Maker, null, Terms(), null, default); // draft only = history
            }
            await using (var db = scope.NewContext())
            {
                var e = await Record(() => db.GetService<IMigrator>().MigrateAsync("20261015032111_AddMerchantMainLogo"));
                var applied = (await db.Database.GetAppliedMigrationsAsync()).Last();
                log.WriteLine($"Down with one Draft agreement only: {e}; last applied={applied}; agreements kept={await db.ConsignmentAgreements.CountAsync()}");
            }
        }
        await using (var scope = await RelationalDatabase.CreateAsync(createSchema: false))
        await using (var db = scope.NewContext())
        {
            await db.Database.MigrateAsync();
            var e = await Record(() => db.GetService<IMigrator>().MigrateAsync("20261015032111_AddMerchantMainLogo"));
            log.WriteLine($"Down with empty consignment schema: {e}; last applied={(await db.Database.GetAppliedMigrationsAsync()).Last()}");
            var e2 = await Record(() => db.Database.MigrateAsync());
            log.WriteLine($"Re-apply Up after downgrade: {e2}; pending={(await db.Database.GetPendingMigrationsAsync()).Count()}");
        }
    }
    static async Task<string> Record(Func<Task> f) { try { await f(); return "succeeded"; } catch (Exception e) { return "blocked: " + (e.InnerException?.Message ?? e.Message).Split('\n')[0]; } }

    [Fact]
    public async Task V13_ConcurrentReceiptsAndHandoversByTwoOperators()
    {
        await using var scope = await Db(4); Guid did;
        await using (var db = scope.NewContext()) { var a = await Approved(db); did = (await Dispatched(db, a.Id, 4, "v13")).Id; }
        async Task<string> Run(Func<MyPetLinkDbContext, Task> f, TaskCompletionSource go) { await go.Task; await using var db = scope.NewContext(); try { await f(db); return "won"; } catch (ApiException e) { return e.Code; } }
        ConsignmentDispatchResponse d; await using (var db = scope.NewContext()) d = await S(db).GetAsync(did, false, default);
        var go = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tasks = new[] { Run(db => S(db).ActionAsync(Checker, did, "receive", A(d, "rx") with { Receipt = Rx(4) }, default), go),
                            Run(db => S(db).ActionAsync(Checker, did, "record-discrepancy", A(d, "rx") with { Receipt = Rx(3, missing: 1) }, default), go) };
        go.SetResult(); var r = await Task.WhenAll(tasks);
        log.WriteLine("Concurrent receive vs record-discrepancy: " + string.Join(" | ", r));
        await using (var db = scope.NewContext()) d = await S(db).GetAsync(did, false, default);
        log.WriteLine($"Final: status={d.Status} openDiscrepancy={d.HasOpenDiscrepancy}");
        var go2 = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var unitA = d.Units[0].Id; var unitB = d.Units[1].Id;
        var t2 = new[] { Run(db => S(db).ActionAsync(Checker, did, "external-handover", A(d, "ev", [unitA]) with { Handover = H("SALE-RACE") }, default), go2),
                         Run(db => S(db).ActionAsync(Checker, did, "external-handover", A(d, "ev", [unitB]) with { Handover = H("SALE-RACE") }, default), go2) };
        go2.SetResult(); var r2 = await Task.WhenAll(t2);
        await using (var db = scope.NewContext())
            log.WriteLine($"Concurrent same reference on two units: {string.Join(" | ", r2)}; records with that ref={await db.ConsignmentHandoverRecords.CountAsync(h => h.EventReference == "SALE-RACE")}");
    }
}
