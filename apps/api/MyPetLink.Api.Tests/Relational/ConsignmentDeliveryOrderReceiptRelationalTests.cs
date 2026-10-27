using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// What a Delivery Order says about receipt must come from the receiving evidence actually recorded:
// a classified shortage is not a count, a later return does not rewrite what was counted, and the
// absence of a damage finding is not a recorded inspection. All parties and quantities are synthetic.
public sealed partial class ConsignmentRelationalTests
{
    private static bool Ticked(string squashed, string label) => squashed.Contains("X" + label, StringComparison.Ordinal);

    private static async Task<(MyPetLink.Api.Services.ConsignmentService.DeliveryOrderSnapshot Snapshot, string Text)> IssueAndRead(
        MyPetLinkDbContext db, Guid dispatchId, string? sample = null)
    {
        await Custody(db).IssueDeliveryOrderAsync(AdminAccountId, dispatchId, default);
        var file = await Documents(db).DeliveryOrderPdfAsync(AdminAccountId, dispatchId, default);
        if (sample is not null && Environment.GetEnvironmentVariable("MYPETLINK_DELIVERY_ORDER_PDF_QA") is { Length: > 0 } dir)
            await File.WriteAllBytesAsync(Path.Combine(dir, sample), file.Content);
        return (await StoredSnapshot(db, dispatchId), Squash(Text(file.Content)));
    }

    [Fact]
    public async Task DeliveryOrderMissingOnlyReceiptConfirmsNoCountOrCondition()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var d = await Dispatched(db, (await Agreement(db)).Id, 3, "do-missing-only");
        d = await Custody(db).ActionAsync(OwnerAccountId, d.Id, "receive", Action(d, "Nothing arrived") with {
            Receipt = Findings([], missing: d.Units.Select(u => u.Id).ToArray()) }, default);
        var before = await Footprint(db, d.Id);

        var (snapshot, text) = await IssueAndRead(db, d.Id, "receipt-missing-only.pdf");
        Assert.Equal((0, 0, 0, 3), (snapshot.Receipt!.Counted, snapshot.Receipt.Good, snapshot.Receipt.Damaged, snapshot.Receipt.Missing));
        // Nobody physically counted or inspected a unit, so nothing affirmative is ticked.
        Assert.False(Ticked(text, "Allunitscounted"), text);
        Assert.False(Ticked(text, "Partialcount"), text);
        Assert.False(Ticked(text, "Novisibledamage"), text);
        Assert.False(Ticked(text, "Nil"), text);
        // The recorded shortage itself is evidence, and is shown as such.
        Assert.True(Ticked(text, "Short3pcs"), text);
        Assert.True(Ticked(text, "Damage/exceptionsnotedbelow"), text);
        Assert.Contains("3missing", text);
        // A receipt that found nothing is listed, but its recipient is not printed as the person who received the goods.
        Assert.Contains("Recordedreceipt:06-08-202610:00,Syntheticrecipient:3missing.", text);
        Assert.DoesNotContain("Name/title:Synthetic", text.Split("RECEIVEDBY/FORCONSIGNEE")[1]);
        Assert.Equal(before, await Footprint(db, d.Id));
    }

    [Fact]
    public async Task DeliveryOrderReviewRequiredUnitsStayUnverified()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var d = await Dispatched(db, (await Agreement(db)).Id, 3, "do-review-required");
        var ids = d.Units.Select(u => u.Id).ToArray();
        d = await Custody(db).ActionAsync(OwnerAccountId, d.Id, "receive", Action(d, "One counted") with { Receipt = Findings([ids[0]]) }, default);
        // A delivery carried forward from before unit-level receiving: an open discrepancy awaiting review,
        // exactly as the receiving migration classified such units. No per-unit evidence exists for them.
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ConsignmentUnits SET ReceivingState = 'ReviewRequired' WHERE Id IN ({ids[1]}, {ids[2]})");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ConsignmentDispatches SET HasOpenDiscrepancy = 1 WHERE Id = {d.Id}");

        var (snapshot, text) = await IssueAndRead(db, d.Id, "receipt-review-required.pdf");
        Assert.Equal(1, snapshot.Receipt!.Counted);
        Assert.False(Ticked(text, "Allunitscounted"), text);
        Assert.False(Ticked(text, "Novisibledamage"), text);
        Assert.False(Ticked(text, "Nil"), text); Assert.False(Ticked(text, "Short"), text);
        Assert.True(Ticked(text, "Unverified/sealed-countpending"), text);
        Assert.True(Ticked(text, "Partialcount"), text);
        Assert.Contains("2underreview", text);
    }

    [Fact]
    public async Task DeliveryOrderMixedCompleteReceiptReportsTheRecordedShortageAndDamage()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var d = await Dispatched(db, (await Agreement(db)).Id, 4, "do-mixed");
        var ids = d.Units.Select(u => u.Id).ToArray();
        d = await Custody(db).ActionAsync(OwnerAccountId, d.Id, "record-discrepancy", Action(d, "Mixed findings") with {
            Receipt = Findings(ids[..2], [ids[2]], [ids[3]]) }, default);

        var (snapshot, text) = await IssueAndRead(db, d.Id, "receipt-mixed.pdf");
        Assert.Equal((3, 2, 1, 1), (snapshot.Receipt!.Counted, snapshot.Receipt.Good, snapshot.Receipt.Damaged, snapshot.Receipt.Missing));
        Assert.Equal(3, Assert.Single(snapshot.Lines).Counted);
        Assert.False(Ticked(text, "Allunitscounted"), text);
        Assert.True(Ticked(text, "Partialcount"), text);
        Assert.False(Ticked(text, "Novisibledamage"), text);
        Assert.True(Ticked(text, "Damage/exceptionsnotedbelow"), text);
        Assert.True(Ticked(text, "Short1pcs"), text);
        Assert.False(Ticked(text, "Unverified/sealed-countpending"), text);
    }

    [Fact]
    public async Task DeliveryOrderAllUnitsCountedGoodConfirmsCountAndCondition()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var d = await Dispatched(db, (await Agreement(db)).Id, 3, "do-all-good");
        d = await Custody(db).ActionAsync(OwnerAccountId, d.Id, "receive", Action(d, "All counted") with {
            Receipt = Findings(d.Units.Select(u => u.Id).ToArray()) }, default);

        var (snapshot, text) = await IssueAndRead(db, d.Id, "receipt-all-good.pdf");
        Assert.Equal(3, snapshot.Receipt!.Counted);
        Assert.True(Ticked(text, "Allunitscounted"), text);
        Assert.True(Ticked(text, "Novisibledamage"), text);
        Assert.True(Ticked(text, "Nil"), text);
        Assert.False(Ticked(text, "Partialcount"), text);
        Assert.False(Ticked(text, "Damage/exceptionsnotedbelow"), text);
    }

    [Fact]
    public async Task DeliveryOrderWithoutReceiptLeavesEveryConfirmationBlank()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        var d = await Dispatched(db, (await Agreement(db)).Id, 2, "do-no-receipt");
        var (snapshot, text) = await IssueAndRead(db, d.Id);
        Assert.Null(snapshot.Receipt);
        foreach (var label in new[] { "Allunitscounted", "Partialcount", "Sealedpacksonly", "Novisibledamage", "Damage/exceptionsnotedbelow",
            "Nil", "Short", "Excess", "Unverified/sealed-countpending" })
            Assert.False(Ticked(text, label), $"{label} ticked in: {text}");
    }

    // Two receipts on one dispatch, across two SKUs: each unit counts once, under its own SKU and receiver.
    [Fact]
    public async Task DeliveryOrderCombinesSeveralPartialReceiptsPerSkuWithoutDoubleCounting()
    {
        await using var scope = await Database(); await using var db = scope.NewContext();
        await AddSecondSku(db, 3);
        var a = await Agreement(db); var s = Custody(db);
        var d = await s.ReserveAsync(AdminAccountId, new(a.Id, MyPetLink.Api.Services.ConsignmentService.BranchDestination(TestBranch()), "TEST-TRACKER",
            "do-two-receipts", [new(NfcVariantId, 4), new(SecondNfcVariantId, 3)], BranchId), default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "dispatch", Action(d, "TRACK-TWO-RECEIPTS"), default);
        var first = d.Units.Where(u => u.Sku == "WS-NFC-0001").Select(u => u.Id).ToArray();
        var second = d.Units.Where(u => u.Sku == "SYN-PAWSOME-LW-QR-NFC").Select(u => u.Id).ToArray();
        d = await s.ActionAsync(OwnerAccountId, d.Id, "receive", Action(d, "Morning count") with {
            Receipt = new("Synthetic morning staff", Now, 2, 0, 0, "SIGNED-MORNING", GoodUnitIds: first[..2]) }, default);
        d = await s.ActionAsync(OwnerAccountId, d.Id, "receive", Action(d, "Afternoon count") with {
            Receipt = new("Synthetic afternoon staff", Now.AddMinutes(1), 5, 1, 0, "SIGNED-AFTERNOON",
                GoodUnitIds: [.. first[2..], .. second[..2]], DamagedUnitIds: [second[2]]) }, default);
        Assert.Equal(5, d.ReceivedQuantity);   // the dispatch keeps only the latest event's count
        var before = await Footprint(db, d.Id);

        var (snapshot, text) = await IssueAndRead(db, d.Id, "receipt-two-events-two-skus.pdf");
        Assert.Equal((7, 6, 1, 0), (snapshot.Receipt!.Counted, snapshot.Receipt.Good, snapshot.Receipt.Damaged, snapshot.Receipt.Missing));
        Assert.Equal(new (string, int, int?)[] { ("SYN-PAWSOME-LW-QR-NFC", 3, 3), ("WS-NFC-0001", 4, 4) },
            snapshot.Lines.Select(l => (l.Sku, l.Delivered, l.Counted)).ToArray());
        Assert.Equal(new[] { ("Synthetic morning staff", 2, 0), ("Synthetic afternoon staff", 4, 1) },
            snapshot.Receipt.Events.Select(e => (e.RecipientName, e.Good, e.Damaged)).ToArray());
        Assert.Contains("Syntheticmorningstaff:2good;", text);
        Assert.Contains("Syntheticafternoonstaff:4good,1damaged.", text);
        Assert.True(Ticked(text, "Allunitscounted"), text);
        Assert.True(Ticked(text, "Nil"), text);
        Assert.False(Ticked(text, "Novisibledamage"), text);
        // Two receivers: neither is printed as the single signer.
        Assert.DoesNotContain("Name/title:Synthetic", text.Split("RECEIVEDBY/FORCONSIGNEE")[1]);
        Assert.Equal(before, await Footprint(db, d.Id));
    }

    // A unit missing at receipt and confirmed good later stays missing in the receipt and appears, dated, as a later outcome.
    [Fact]
    public async Task DeliveryOrderShowsALaterDiscrepancyResolutionSeparately()
    {
        await using var scope = await Database(); await using var db = scope.NewContext(); await AddReviewer(db);
        var s = Custody(db);
        var d = await Dispatched(db, (await Agreement(db)).Id, 3, "do-later-found");
        var ids = d.Units.Select(u => u.Id).ToArray();
        d = await s.ActionAsync(OwnerAccountId, d.Id, "record-discrepancy", Action(d, "One missing") with { Receipt = Findings(ids[..2], missing: [ids[2]]) }, default);
        d = await s.ActionAsync(ReviewerUser, d.Id, "resolve-discrepancy", Action(d, "Found at the counter") with { Receipt = Findings([ids[2]]) }, default);
        Assert.Equal("Good", d.Units.Single(u => u.Id == ids[2]).ReceivingState);

        var (snapshot, text) = await IssueAndRead(db, d.Id, "receipt-later-resolution.pdf");
        Assert.Equal((2, 2, 0, 1), (snapshot.Receipt!.Counted, snapshot.Receipt.Good, snapshot.Receipt.Damaged, snapshot.Receipt.Missing));
        var later = Assert.Single(snapshot.Receipt.Later);
        Assert.Equal(("confirmed good after review", 1), (later.Outcome, later.Units));
        Assert.True(Ticked(text, "Short1pcs"), text);
        Assert.Contains("Later:1confirmedgoodafterreview(6August2026).", text);
    }

    // F2: a unit counted damaged at receipt and later returned stays part of what was counted that day.
    [Fact]
    public async Task DeliveryOrderKeepsTheOriginalCountWhenADamagedUnitIsLaterReturned()
    {
        await using var scope = await Database(); await using var db = scope.NewContext(); await AddReviewer(db);
        var s = Custody(db);
        var d = await Dispatched(db, (await Agreement(db)).Id, 4, "do-returned-damage");
        var ids = d.Units.Select(u => u.Id).ToArray();
        d = await s.ActionAsync(OwnerAccountId, d.Id, "record-discrepancy", Action(d, "Four counted, one damaged") with { Receipt = Findings(ids[..3], [ids[3]]) }, default);
        d = await s.ActionAsync(AdminAccountId, d.Id, "return", Action(d, "Damaged unit sent back", [ids[3]]), default);
        d = await s.ActionAsync(ReviewerUser, d.Id, "resolve-discrepancy", Action(d, "Returned damage reviewed") with { Receipt = Findings([], returned: [ids[3]]) }, default);
        Assert.Equal("Returned", d.Units.Single(u => u.Id == ids[3]).ReceivingState);
        var before = await Footprint(db, d.Id);

        var (snapshot, text) = await IssueAndRead(db, d.Id, "receipt-damaged-then-returned.pdf");
        Assert.Equal((4, 3, 1, 0), (snapshot.Receipt!.Counted, snapshot.Receipt.Good, snapshot.Receipt.Damaged, snapshot.Receipt.Missing));
        Assert.Equal(4, Assert.Single(snapshot.Lines).Counted);
        Assert.True(Ticked(text, "Nil"), text);
        Assert.False(Ticked(text, "Short"), text);
        Assert.False(Ticked(text, "Novisibledamage"), text);
        Assert.True(Ticked(text, "Damage/exceptionsnotedbelow"), text);
        Assert.Contains("1returnedtoMyPetLink", text);
        Assert.Equal(before, await Footprint(db, d.Id));
    }
}
