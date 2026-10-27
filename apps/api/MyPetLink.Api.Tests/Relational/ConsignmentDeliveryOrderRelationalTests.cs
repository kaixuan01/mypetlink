using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using UglyToad.PdfPig;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// The Delivery Order is a document about a dispatch that already happened. These scenarios
// prove it reads the delivery without moving stock, is numbered once, and stays frozen.
// All parties and quantities are synthetic.
public sealed partial class ConsignmentRelationalTests
{
    private static readonly Guid SecondNfcVariantId = Guid.Parse("f3000000-0000-0000-0000-0000000000d0");

    private sealed record StockFootprint(int Ledger, int Movements, int Handovers, string Units, string DispatchVersion);

    // Everything a stock movement could touch. Issuing or downloading a Delivery Order must leave all of it alone.
    private static async Task<StockFootprint> Footprint(MyPetLinkDbContext db, Guid dispatchId)
    {
        var units = await db.ConsignmentUnits.AsNoTracking().Where(u => u.DispatchId == dispatchId).OrderBy(u => u.Id)
            .Select(u => u.Id + ":" + u.Status + ":" + u.ReceivingState + ":" + u.SmartTag.FulfilmentStatus + ":" + u.SmartTag.AssignmentVersion)
            .ToListAsync();
        var version = await db.ConsignmentDispatches.AsNoTracking().Where(d => d.Id == dispatchId).Select(d => d.RowVersion).SingleAsync();
        return new(await db.ConsignmentStockLedgerEntries.CountAsync(), await db.ConsignmentMovements.CountAsync(),
            await db.ConsignmentHandoverRecords.CountAsync(), string.Join("|", units), Convert.ToBase64String(version));
    }

    private static async Task<ConsignmentService.DeliveryOrderSnapshot> StoredSnapshot(MyPetLinkDbContext db, Guid dispatchId) =>
        JsonSerializer.Deserialize<ConsignmentService.DeliveryOrderSnapshot>(
            await db.ConsignmentDeliveryOrders.AsNoTracking().Where(x => x.DispatchId == dispatchId).Select(x => x.SnapshotJson).SingleAsync(),
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

    private static async Task<int> DeliveryOrderCounter(MyPetLinkDbContext db) =>
        (int)await db.DocumentNumberCounters.AsNoTracking().Where(c => c.CounterKey.StartsWith("merchant-delivery-order:"))
            .SumAsync(c => c.NextValue);

    /// <summary>A second QR + NFC SKU of a different design and size, with its own received stock taken from the first.</summary>
    private static async Task AddSecondSku(MyPetLinkDbContext db, int stock)
    {
        db.TagProducts.Add(new TagProduct { Id = Guid.Parse("f3000000-0000-0000-0000-0000000000d1"), Name = "Synthetic Pawsome Pet Tag",
            Slug = "synthetic-pawsome", IsPublished = true });
        db.TagProductVariants.Add(new TagProductVariant { Id = SecondNfcVariantId, TagProductId = Guid.Parse("f3000000-0000-0000-0000-0000000000d1"),
            PublicKey = "syn-pawsome-lw", Sku = "SYN-PAWSOME-LW-QR-NFC", DisplayName = "Lightweight", TagVariant = "Lightweight",
            SupportsQr = true, SupportsNfc = true, BasePrice = 39.9m, Currency = "MYR", IsActive = true, IsPurchasable = true });
        await db.SaveChangesAsync();
        foreach (var tag in await db.SmartTags.Where(t => t.ProductVariantId == NfcVariantId).OrderByDescending(t => t.TagCode).Take(stock).ToListAsync())
        { tag.ProductVariantId = SecondNfcVariantId; tag.InventoryReceiptId = null; }
        await db.SaveChangesAsync();
        await ReceivedStockFixture.ReceiveAllAsync(db, SecondNfcVariantId);
    }

    private static async Task<ConsignmentDispatchResponse> Dispatched(MyPetLinkDbContext db, Guid agreement, int quantity, string key)
    {
        var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, Reserve(agreement, quantity, key), default);
        return await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Action(d, "HAND-DELIVERED-" + key), default);
    }

    [Fact]
    public async Task DeliveryOrderIsGeneratedFromTheDispatchAndNeverMovesStock()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var a = await Agreement(db); var s = Custody(db);
        var d = await Dispatched(db, a.Id, 10, "do-single");
        Assert.Null(d.DeliveryOrder);
        var before = await Footprint(db, d.Id);

        var issued = await s.IssueDeliveryOrderAsync(AdminAccountId, d.Id, default);
        Assert.Matches(new Regex(@"^MPL-DO-\d{6}-\d{4}$"), issued.DeliveryOrderNumber);
        Assert.Equal(10, issued.DeliveredQuantity);
        Assert.Equal($"MyPetLink_Delivery_Order_{issued.DeliveryOrderNumber}.pdf", issued.FileName);
        Assert.Equal("Fulfilment Admin", issued.IssuedByName);

        var file = await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, d.Id, default);
        Assert.Equal("application/pdf", file.ContentType); Assert.Equal(issued.FileName, file.FileName);
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            await File.WriteAllBytesAsync(Path.Combine(dir, "single-sku-at-dispatch.pdf"), file.Content);
        var text = Squash(Text(file.Content));
        foreach (var expected in new[] { "DELIVERYORDER/HANDOVER", issued.DeliveryOrderNumber, "THECOMPANY/CONSIGNOR", "TestSeller",
            "Brand:MyPetLink", "THEPARTNER/CONSIGNEE", "QAbranch", "Testpartnerdeliveryaddress",
            a.Reference + "|Version1", "Deliveryrecord" + d.DispatchNumber, "DELIVEREDTOTAL:10QR+NFCSMARTTAGS",
            "WS-NFC-0001", "WholesaleSmartTag", "Standard", "Totaldelivered", "Actualcountedtotal:", "Countbasis(tick):",
            "DELIVEREDBY/FORCONSIGNOR", "RECEIVEDBY/FORCONSIGNEE", "Signature/companystamp(ifavailable)", "FulfilmentAdmin",
            "Consignmentonly:", "Thisisnotasale,invoiceorproofofpayment.", "Print2identicalcopies.", "Page1of1" })
            Assert.True(text.Contains(expected, StringComparison.Ordinal), $"Missing '{expected}' in: {text}");
        // Commercial terms and individual Tag Codes are never on a Delivery Order.
        Assert.DoesNotContain("MPL-TEST-", text); Assert.DoesNotContain("35%", text); Assert.DoesNotContain("Recordedatreceipt", text);
        Assert.DoesNotContain("HAND-DELIVERED", text);   // free-text dispatch notes stay in the admin record

        // Generating again, downloading again, or reading the delivery: the same number and the same bytes.
        var again = await s.IssueDeliveryOrderAsync(AdminAccountId, d.Id, default);
        Assert.Equal(issued, again);
        var second = await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, d.Id, default);
        Assert.Equal(file.Content, second.Content);
        var stored = await db.ConsignmentDeliveryOrders.AsNoTracking().SingleAsync();
        Assert.Equal(Convert.ToHexString(SHA256.HashData(file.Content)), stored.ContentSha256);
        Assert.Equal(MerchantId, stored.MerchantId); Assert.Equal(d.Id, stored.DispatchId);
        Assert.Equal(issued.DeliveryOrderNumber, (await s.GetAsync(d.Id, false, default)).DeliveryOrder?.DeliveryOrderNumber);
        Assert.Equal(1, await DeliveryOrderCounter(db));

        Assert.Equal(before, await Footprint(db, d.Id));
        Assert.Single(await db.AuditLogs.Where(x => x.Action == "consignment.delivery-order-issued").ToListAsync());
        Assert.Equal(2, await db.AuditLogs.CountAsync(x => x.Action == "consignment.document-downloaded" && x.NewValue!.Contains("delivery-order")));

        // The shared Delivery Order series continues after it, so a B2B sales DO can never take the same number.
        var next = await new DocumentNumberService(db).NextMerchantDeliveryOrderNumberAsync(Now, default);
        Assert.NotEqual(issued.DeliveryOrderNumber, next);

        var tracked = await db.ConsignmentDeliveryOrders.SingleAsync();
        tracked.FileName = "tampered.pdf";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task ReservedCancelledOrUnknownDeliveriesHaveNoDeliveryOrder()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var a = await Agreement(db); var s = Custody(db);
        var reserved = await s.ReserveAsync(AdminAccountId, Reserve(a.Id, 3, "do-reserved"), default);
        var error = await Assert.ThrowsAsync<ApiException>(() => s.IssueDeliveryOrderAsync(AdminAccountId, reserved.Id, default));
        Assert.Equal(409, error.StatusCode); Assert.Equal("consignment_delivery_order_unavailable", error.Code);
        Assert.Equal("consignment_delivery_order_not_issued",
            (await Assert.ThrowsAsync<ApiException>(() => Documents(db).DeliveryOrderPdfAsync(AdminAccountId, reserved.Id, default))).Code);

        var cancelled = await s.ActionAsync(AdminAccountId, reserved.Id, "cancel", Action(reserved, "Partner postponed"), default);
        Assert.Equal("Cancelled", cancelled.Status);
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => s.IssueDeliveryOrderAsync(AdminAccountId, reserved.Id, default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => s.IssueDeliveryOrderAsync(AdminAccountId, Guid.NewGuid(), default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => Documents(db).DeliveryOrderPdfAsync(AdminAccountId, Guid.NewGuid(), default))).StatusCode);
        // An inactive or unknown admin cannot issue one either.
        Assert.Equal(401, (await Assert.ThrowsAsync<ApiException>(() => s.IssueDeliveryOrderAsync(null, reserved.Id, default))).StatusCode);

        Assert.Empty(db.ConsignmentDeliveryOrders);
        Assert.Equal(0, await DeliveryOrderCounter(db));   // A refused request never burns a number.
    }

    [Fact]
    public async Task DeliveryOrderListsEachSkuWithItsDeliveredQuantity()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        await AddSecondSku(db, 3);

        var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, new(a.Id, ConsignmentService.BranchDestination(TestBranch()), "TEST-TRACKER", "do-multi",
            [new(NfcVariantId, 4), new(SecondNfcVariantId, 3)], BranchId), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Action(d, "TRACK-MULTI"), default);
        var before = await Footprint(db, d.Id);

        var issued = await s.IssueDeliveryOrderAsync(AdminAccountId, d.Id, default);
        Assert.Equal(7, issued.DeliveredQuantity);
        var snapshot = await StoredSnapshot(db, d.Id);
        Assert.Equal(new[] { ("SYN-PAWSOME-LW-QR-NFC", "Synthetic Pawsome Pet Tag", "Lightweight", 3), ("WS-NFC-0001", "Wholesale Smart Tag", "Standard", 4) },
            snapshot.Lines.Select(l => (l.Sku, l.Design, l.Size, l.Delivered)).ToArray());
        Assert.All(snapshot.Lines, l => Assert.Null(l.Counted));
        Assert.Equal(7, snapshot.TotalQuantity); Assert.Null(snapshot.Receipt);

        var file = await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, d.Id, default);
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            await File.WriteAllBytesAsync(Path.Combine(dir, "multi-sku-at-dispatch.pdf"), file.Content);
        var text = Squash(Text(file.Content));
        Assert.Contains("1SYN-PAWSOME-LW-QR-NFCSyntheticPawsomePetTagLightweight3", text);
        Assert.Contains("2WS-NFC-0001WholesaleSmartTagStandard4", text);
        Assert.Contains("Totaldelivered7", text); Assert.Contains("DELIVEREDTOTAL:7QR+NFCSMARTTAGS", text);
        Assert.Equal(before, await Footprint(db, d.Id));
    }

    [Fact]
    public async Task DeliveryOrderPrintsHistoricalAndPartialReceiptsAsRecorded()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var a = await Agreement(db); var s = Custody(db);

        // A completed delivery: received in full before anyone generated its Delivery Order.
        var full = await Dispatched(db, a.Id, 5, "do-historical");
        full = await s.ActionAsync(OwnerAccountId, full.Id, "receive", Action(full, "Signed delivery acknowledgment") with { Receipt = Receipt(full) }, default);
        Assert.Equal("Received", full.Status);
        var fullBefore = await Footprint(db, full.Id);
        await s.IssueDeliveryOrderAsync(AdminAccountId, full.Id, default);
        var complete = await StoredSnapshot(db, full.Id);
        Assert.Equal(5, complete.TotalQuantity); Assert.Equal(5, complete.Receipt!.Counted); Assert.Equal(0, complete.Receipt.AwaitingConfirmation);
        Assert.Equal("Synthetic shop recipient", Assert.Single(complete.Receipt.Events).RecipientName);
        var fullText = Squash(Text((await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, full.Id, default)).Content));
        Assert.Contains("Nodamageorshortagerecordedatreceipt.", fullText); Assert.Contains("Syntheticshoprecipient", fullText);
        Assert.Contains("Countedquantitiesareasrecordedatreceipton", fullText);
        Assert.Equal(fullBefore, await Footprint(db, full.Id));

        // A partial delivery: 3 counted good, 1 damaged, 1 missing, and 1 not yet confirmed at all.
        var part = await Dispatched(db, a.Id, 6, "do-partial");
        var ids = part.Units.Select(u => u.Id).ToArray();
        part = await s.ActionAsync(OwnerAccountId, part.Id, "receive", Action(part, "Partial count at counter") with {
            Receipt = new("Synthetic counter staff", Now, 4, 1, 1, "SIGNED-PARTIAL-RECEIPT",
                GoodUnitIds: ids[..3], DamagedUnitIds: [ids[3]], MissingUnitIds: [ids[4]]) }, default);
        Assert.Equal("Dispatched", part.Status); Assert.True(part.HasOpenDiscrepancy);
        var partBefore = await Footprint(db, part.Id);
        var issued = await s.IssueDeliveryOrderAsync(AdminAccountId, part.Id, default);
        Assert.Equal(6, issued.DeliveredQuantity);   // what left MyPetLink, never only what was counted
        var partial = await StoredSnapshot(db, part.Id);
        Assert.Equal((4, 3, 1, 1, 0, 0, 1), (partial.Receipt!.Counted, partial.Receipt.Good, partial.Receipt.Damaged, partial.Receipt.Missing,
            partial.Receipt.UnderReview, partial.Receipt.NotRecordedByUnit, partial.Receipt.AwaitingConfirmation));
        Assert.Equal(4, Assert.Single(partial.Lines).Counted); Assert.Equal(6, partial.Lines[0].Delivered);
        var file = await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, part.Id, default);
        if (Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            await File.WriteAllBytesAsync(Path.Combine(dir, "partial-receipt-recorded.pdf"), file.Content);
        var text = Squash(Text(file.Content));
        Assert.Contains("Recordedatreceipt:1damaged,1missing.", text);
        Assert.Contains("Unverified:1awaitingcountconfirmation.", text);
        Assert.Contains("Syntheticcounterstaff", text); Assert.Contains("DELIVEREDTOTAL:6QR+NFCSMARTTAGS", text);
        Assert.DoesNotContain("SIGNED-PARTIAL-RECEIPT", text);   // evidence references stay in the admin record
        Assert.Equal(partBefore, await Footprint(db, part.Id));

        // Receiving recorded after issue never rewrites the issued copy.
        var bytes = file.Content;
        part = await s.GetAsync(part.Id, false, default);
        await s.ActionAsync(OwnerAccountId, part.Id, "receive", Action(part, "Late count") with {
            Receipt = new("Synthetic counter staff", Now, 1, 0, 0, "SIGNED-LATE-RECEIPT", GoodUnitIds: [ids[5]]) }, default);
        Assert.Equal(bytes, (await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, part.Id, default)).Content);
        Assert.Equal(2, await db.ConsignmentDeliveryOrders.CountAsync());
    }

    [Fact]
    public async Task MigratedSchemaKeepsIssuedDeliveryOrdersAndBlocksTheirRollback()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(); await using var db = scope.NewContext();
            var a = await Agreement(db);
            var d = await Dispatched(db, a.Id, 2, "do-migrated");
            await Custody(db).IssueDeliveryOrderAsync(AdminAccountId, d.Id, default);
            foreach (var sql in new[] { "UPDATE ConsignmentDeliveryOrders SET FileName = 'x.pdf'", "DELETE FROM ConsignmentDeliveryOrders" })
                Assert.Contains("51059", (await Assert.ThrowsAnyAsync<Exception>(() => db.Database.ExecuteSqlRawAsync(sql))).ToString());
            var migrator = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
            Assert.Contains("51060", (await Assert.ThrowsAnyAsync<Exception>(() => migrator.MigrateAsync(CareCompletionIdempotencyMigration))).ToString());
            db.ChangeTracker.Clear();
            // With nothing signed, the later migrations roll back first; the Delivery Order step then stops.
            Assert.Equal([DocumentSignaturesMigration, SettlementsMigration, RecoveriesMigration], await db.Database.GetPendingMigrationsAsync());
            await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            Assert.Single(db.ConsignmentDeliveryOrders);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task ConcurrentRequestsIssueExactlyOneDeliveryOrderNumber()
    {
        await using var scope = await Database(); string dispatchId;
        await using (var db = scope.NewContext()) { var a = await Agreement(db); dispatchId = (await Dispatched(db, a.Id, 8, "do-race")).Id.ToString(); }
        var id = Guid.Parse(dispatchId);
        var contexts = Enumerable.Range(0, 6).Select(_ => scope.NewContext()).ToArray();
        try
        {
            var results = await Task.WhenAll(contexts.Select(c => Task.Run(() => Custody(c).IssueDeliveryOrderAsync(AdminAccountId, id, default))));
            Assert.Single(results.Select(r => r.DeliveryOrderNumber).Distinct());
            Assert.Single(results.Select(r => r.Id).Distinct());
        }
        finally { foreach (var c in contexts) await c.DisposeAsync(); }
        await using var check = scope.NewContext();
        Assert.Equal(1, await check.ConsignmentDeliveryOrders.CountAsync());
        Assert.Equal(1, await DeliveryOrderCounter(check));
        Assert.Single(await check.AuditLogs.Where(x => x.Action == "consignment.delivery-order-issued").ToListAsync());
    }

    [Fact]
    public async Task DeliveryOrderLeavesMissingPartnerDetailsBlankAndIgnoresLaterEdits()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var a = await Agreement(db); var s = Custody(db);
        var d = await Dispatched(db, a.Id, 2, "do-optional");
        var merchant = await db.Merchants.SingleAsync(m => m.Id == MerchantId);
        merchant.LegalBusinessName = "Synthetic Original Pets Sdn Bhd"; merchant.TradingName = null;
        merchant.BusinessRegistrationNumber = null; merchant.ContactPerson = ""; merchant.ContactPhone = "";
        await db.SaveChangesAsync();

        await s.IssueDeliveryOrderAsync(AdminAccountId, d.Id, default);
        var issued = await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, d.Id, default);
        var text = Squash(Text(issued.Content));
        Assert.Contains("SyntheticOriginalPetsSdnBhd", text);
        Assert.DoesNotContain("RegistrationNo.:", text.Split("THEPARTNER/CONSIGNEE")[1]);   // nothing invented for the partner
        var snapshot = await StoredSnapshot(db, d.Id);
        Assert.Null(snapshot.PartnerRegistrationNumber); Assert.Null(snapshot.ContactPerson); Assert.Null(snapshot.ContactPhone);
        Assert.Equal("QA branch", snapshot.BranchName);

        merchant.LegalBusinessName = "Synthetic Renamed Holdings Bhd"; merchant.BusinessRegistrationNumber = "SYN-NEW-REG";
        (await db.MerchantBranches.SingleAsync(b => b.Id == BranchId)).Name = "Renamed outlet";
        var seller = await db.BusinessIdentitySettings.SingleAsync(); seller.LegalBusinessName = "Renamed Seller";
        await db.SaveChangesAsync();
        Assert.Equal(issued.Content, (await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, d.Id, default)).Content);
        Assert.Equal(issued.FileName, (await s.IssueDeliveryOrderAsync(AdminAccountId, d.Id, default)).FileName);
        Assert.Equal(1, await db.ConsignmentDeliveryOrders.CountAsync());
    }
}
