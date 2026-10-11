using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Order first, inspect before shipping, on SQL Server through the real
/// services: received commercial stock waiting for its individual inspection
/// can be ordered and paid for; a paid order waits at Payment Confirmed until a
/// tag of its SKU is inspected and passes; only a Passed tag is ever assigned,
/// readied or shipped; a failed tag is never used and another can be
/// inspected; and when none passes the order simply waits for the operator.
/// </summary>
public sealed partial class SellableInventoryRelationalTests
{
    [RelationalFact]
    public async Task TheWholeOrderFirstLifecycleShipsOnlyAnInspectedTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "LIFE");
            // A received, enrolled shipment of three packaged tags; none opened yet.
            for (var n = 1; n <= 3; n++) AddShelfTag(seed, variantId, QaCode("LYFE", n), PhysicalQaStatus.Pending);
            await seed.SaveChangesAsync();
        }

        // Order and payment proof before any inspection.
        TagOrderResponse order;
        await using (var db = scope.NewContext())
        {
            Assert.True(await InStockAsync(db, variantId));
            order = (await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "life"))).Order;
            await Checkout(db).SubmitPaymentProofAsync(OwnerId, order.OrderNumber,
                new UploadPaymentProofRequest(null, "duitnow.png", "DuitNow", "DN-1", null, order.TotalAmount));
        }
        await using (var db = scope.NewContext())
            await Admin(db).ConfirmPaymentAsync(AdminId, order.Id);

        // Paid. No tag was chosen, inspected or passed along the way.
        await using (var db = scope.NewContext())
        {
            var paid = await db.TagOrders.AsNoTracking().SingleAsync(o => o.Id == order.Id);
            Assert.Equal((OrderStatus.PaymentConfirmed, PaymentStatus.Confirmed), (paid.Status, paid.PaymentStatus));
            Assert.Equal(3, await db.SmartTags.CountAsync(t => t.QaStatus == PhysicalQaStatus.Pending && t.OrderId == null));
            var picker = await Admin(db).ListAssignableTagsAsync(order.Id, null, null, 1, 20);
            Assert.Equal((0, 3), (picker.Total, picker.AwaitingInspection));
            Assert.Equal(2, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
        }

        // Open one package, inspect it, pass it: it is the one offered.
        await InspectAsync(scope, QaCode("LYFE", 2), PhysicalQaStatus.Passed);
        Guid tagId;
        await using (var db = scope.NewContext())
        {
            var picker = await Admin(db).ListAssignableTagsAsync(order.Id, null, QaCode("LYFE", 2).ToLowerInvariant(), 1, 20);
            var offered = Assert.Single(picker.Items);
            Assert.Equal((QaCode("LYFE", 2), 2), (offered.TagCode, picker.AwaitingInspection));
            tagId = offered.Id;
            await Admin(db).AssignInventoryTagAsync(AdminId, order.Id, tagId);
        }
        await using (var db = scope.NewContext())
            await Admin(db).MarkOrderPreparingAsync(AdminId, order.Id, await OrderVersionAsync(db, order.Id));
        await using (var db = scope.NewContext())
            await Admin(db).MarkOrderReadyToShipAsync(AdminId, order.Id, await OrderVersionAsync(db, order.Id));
        await using (var db = scope.NewContext())
            await Admin(db).MarkOrderShippedAsync(AdminId, order.Id,
                new MarkOrderShippedRequest("Test Courier", "Standard", "LIFE-1", null, null, await OrderVersionAsync(db, order.Id)));

        await using var check = scope.NewContext();
        var shipped = await check.TagOrders.AsNoTracking().SingleAsync(o => o.Id == order.Id);
        Assert.Equal(OrderStatus.Shipped, shipped.Status);
        var tag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == tagId);
        Assert.Equal((PhysicalQaStatus.Passed, order.Id), (tag.QaStatus!.Value, tag.OrderId!.Value));
        // The other two were never opened, never passed and are still for sale.
        Assert.Equal(2, await check.SmartTags.CountAsync(t => t.QaStatus == PhysicalQaStatus.Pending && t.OrderId == null));
        Assert.Equal(2, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
    }

    [RelationalFact]
    public async Task ATagThatFailsAfterPaymentIsNeverUsedAndAnotherCanBeInspected()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (variantId, orderId) = await PaidOrderOverPendingStockAsync(scope, "FALS", tags: 2);
        var failedId = await TagIdByCodeAsync(scope, QaCode("FALS", 1));

        await InspectAsync(scope, QaCode("FALS", 1), PhysicalQaStatus.Failed);
        await using (var db = scope.NewContext())
        {
            // The failed tag is offered nowhere and refused when chosen directly.
            var picker = await Admin(db).ListAssignableTagsAsync(orderId, null, null, 1, 20);
            Assert.Equal((0, 1), (picker.Total, picker.AwaitingInspection));
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
                Admin(db).AssignInventoryTagAsync(AdminId, orderId, failedId))).Code);
            // It no longer counts as orderable stock either; the paid order still holds its unit.
            Assert.Equal(0, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
        }

        await InspectAsync(scope, QaCode("FALS", 2), PhysicalQaStatus.Passed);
        await using (var db = scope.NewContext())
        {
            var offered = Assert.Single((await Admin(db).ListAssignableTagsAsync(orderId, null, null, 1, 20)).Items);
            Assert.Equal(QaCode("FALS", 2), offered.TagCode);
            await Admin(db).AssignInventoryTagAsync(AdminId, orderId, offered.Id);
        }

        await using var check = scope.NewContext();
        var failed = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == failedId);
        Assert.Equal((PhysicalQaStatus.Failed, (Guid?)null, SmartTagStatus.Unclaimed), (failed.QaStatus!.Value, failed.OrderId, failed.Status));
    }

    [RelationalFact]
    public async Task WhenEveryTagFailsThePaidOrderWaitsAndNothingIsCancelledOrRefunded()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (variantId, orderId) = await PaidOrderOverPendingStockAsync(scope, "NUNE", tags: 1);

        await InspectAsync(scope, QaCode("NUNE", 1), PhysicalQaStatus.Failed);

        await using var db = scope.NewContext();
        var picker = await Admin(db).ListAssignableTagsAsync(orderId, null, null, 1, 20);
        Assert.Equal((0, 0), (picker.Total, picker.AwaitingInspection));
        // Nothing can be readied: no inspected tag is assigned.
        var version = await OrderVersionAsync(db, orderId);
        Assert.IsType<ApiException>(await Record.ExceptionAsync(() => Admin(db).MarkOrderPreparingAsync(AdminId, orderId, version)));
        // No new order can be placed against stock that does not exist.
        Assert.Equal("out_of_stock", (await Assert.ThrowsAsync<ApiException>(() =>
            Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "after-fail")))).Code);
        var order = await db.TagOrders.AsNoTracking().SingleAsync(o => o.Id == orderId);
        // The paid order is untouched, waiting for the operator to resolve it.
        Assert.Equal((OrderStatus.PaymentConfirmed, PaymentStatus.Confirmed, (DateTimeOffset?)null),
            (order.Status, order.PaymentStatus, order.CancelledAt));
    }

    [RelationalFact]
    public async Task ConcurrentCheckoutsNeverOrderMoreThanTheReceivedEnrolledStock()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "RACE");
            // Three orderable units (one Passed, two waiting), and stock that never is.
            AddShelfTag(seed, variantId, "MPL-RACE-0001", PhysicalQaStatus.Passed);
            AddShelfTag(seed, variantId, "MPL-RACE-0002", PhysicalQaStatus.Pending);
            AddShelfTag(seed, variantId, "MPL-RACE-0003", PhysicalQaStatus.Pending);
            AddShelfTag(seed, variantId, "MPL-RACE-0004", PhysicalQaStatus.Pending, received: false);
            AddShelfTag(seed, variantId, "MPL-RACE-0005", PhysicalQaStatus.Pending, purpose: SmartTagStockPurpose.Test);
            AddShelfTag(seed, variantId, "MPL-RACE-0006", null);
            await seed.SaveChangesAsync();
        }

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 8).Select(async attempt =>
        {
            await using var db = scope.NewContext();
            try { await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, $"race-{attempt}")); return "ok"; }
            catch (ApiException error) { return error.Code; }
        }));

        Assert.Equal(3, outcomes.Count(outcome => outcome == "ok"));
        Assert.All(outcomes.Where(outcome => outcome != "ok"), code => Assert.Equal("out_of_stock", code));
        await using var check = scope.NewContext();
        Assert.Equal(3, await check.TagOrders.CountAsync());
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
        Assert.False(await InStockAsync(check, variantId));
    }

    [RelationalFact]
    public async Task MultiUnitOrdersAndCompetingOrdersShareTheSameStockWithoutGoingNegative()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "MULT");
            for (var n = 1; n <= 3; n++) AddShelfTag(seed, variantId, QaCode("MULT", n), PhysicalQaStatus.Pending);
            await seed.SaveChangesAsync();
        }

        await using var db = scope.NewContext();
        await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "two", quantity: 2));
        Assert.Equal(1, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
        Assert.Equal("out_of_stock", (await Assert.ThrowsAsync<ApiException>(() =>
            Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "another-two", quantity: 2)))).Code);
        await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "last-one"));
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
        // One unit fails inspection while all three are reserved: availability
        // floors at zero instead of going negative.
        await InspectAsync(scope, QaCode("MULT", 1), PhysicalQaStatus.Failed);
        await using var check = scope.NewContext();
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
        Assert.Equal(2, await check.TagOrders.CountAsync());
    }

    [RelationalTheory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public async Task AnAssignmentRacingAQaFailureNeverAssignsAFailedTag(int round)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var key = $"ASR{"ABC"[round - 1]}";
        var (_, orderId) = await PaidOrderOverPendingStockAsync(scope, key, tags: 1);
        var code = QaCode(key, 1);
        await InspectAsync(scope, code, PhysicalQaStatus.Passed);
        var tagId = await TagIdByCodeAsync(scope, code);
        PhysicalQaItem item;
        await using (var db = scope.NewContext()) item = await QaService(db).LookupAsync(code, default);

        var assign = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            try { await Admin(db).AssignInventoryTagAsync(AdminId, orderId, tagId); return true; }
            catch (Exception) { return false; }
        });
        var fail = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            try
            {
                await QaService(db).SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version,
                    PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, null, null, "Cracked on re-check"), default);
                return true;
            }
            catch (Exception) { return false; }
        });
        var (assigned, failed) = (await assign, await fail);

        await using var check = scope.NewContext();
        var tag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == tagId);
        Assert.True(assigned || failed, $"Round {round}: neither landed");
        // Never a failed tag on an order that then readies: either it is still
        // Passed on the order, or it failed and the order cannot be readied.
        if (tag.OrderId == orderId && tag.QaStatus != PhysicalQaStatus.Passed)
        {
            await using var db = scope.NewContext();
            await Admin(db).MarkOrderPreparingAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            await using var later = scope.NewContext();
            var version = await OrderVersionAsync(later, orderId);
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
                Admin(later).MarkOrderReadyToShipAsync(AdminId, orderId, version))).Code);
        }
    }

    [RelationalFact]
    public async Task ThePickerSearchesEveryInspectedTagOfTheSkuNotJustTheFirstHundred()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, otherVariantId, orderId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "PICK");
            otherVariantId = await SeedVariantAsync(seed, "OTHR");
            for (var n = 1; n <= 130; n++)
            {
                var minutes = n;
                AddShelfTag(seed, variantId, QaCode("PKCK", n), PhysicalQaStatus.Passed, configure: t => t.QaInspectedAt = DateTimeOffset.UtcNow.AddMinutes(-minutes));
            }
            // Not assignable: waiting for inspection, failed, another SKU, a testing sample.
            AddShelfTag(seed, variantId, QaCode("PKCK", 901), PhysicalQaStatus.Pending);
            AddShelfTag(seed, variantId, QaCode("PKCK", 902), PhysicalQaStatus.Failed);
            AddShelfTag(seed, otherVariantId, QaCode("QTHR", 1), PhysicalQaStatus.Passed);
            AddShelfTag(seed, variantId, QaCode("PKCK", 903), PhysicalQaStatus.Passed, purpose: SmartTagStockPurpose.Test);
            await seed.SaveChangesAsync();
            var order = AddOrder(seed, variantId, "ORD-PICK", OrderStatus.PaymentConfirmed, quantity: 1);
            order.PaymentStatus = PaymentStatus.Confirmed;
            await seed.SaveChangesAsync();
            orderId = order.Id;
        }

        await using var db = scope.NewContext();
        var first = await Admin(db).ListAssignableTagsAsync(orderId, null, null, 1, 50);
        Assert.Equal((130, 1, 50), (first.Total, first.AwaitingInspection, first.Items.Count));
        // Most recently inspected first, so a tag that has just passed is on top.
        Assert.Equal(QaCode("PKCK", 1), first.Items.First().TagCode);
        var last = await Admin(db).ListAssignableTagsAsync(orderId, null, null, 3, 50);
        Assert.Equal(30, last.Items.Count);
        Assert.Equal(QaCode("PKCK", 130), last.Items.Last().TagCode);
        // A code far beyond the first hundred is found by search, in any case.
        var found = Assert.Single((await Admin(db).ListAssignableTagsAsync(orderId, null, QaCode("PKCK", 127).ToLowerInvariant(), 1, 20)).Items);
        Assert.Equal(QaCode("PKCK", 127), found.TagCode);
        await Admin(db).AssignInventoryTagAsync(AdminId, orderId, found.Id);
        // Nothing unassignable is ever offered.
        var all = new List<string>();
        await using (var reread = scope.NewContext())
            for (var page = 1; page <= 3; page++)
                all.AddRange((await Admin(reread).ListAssignableTagsAsync(orderId, null, null, page, 50)).Items.Select(i => i.TagCode));
        var unassignable = new[] { QaCode("PKCK", 901), QaCode("PKCK", 902), QaCode("QTHR", 1), QaCode("PKCK", 903), QaCode("PKCK", 127) };
        Assert.Empty(all.Intersect(unassignable));
    }

    // --- Helpers -----------------------------------------------------------------------

    private static async Task<(Guid VariantId, Guid OrderId)> PaidOrderOverPendingStockAsync(RelationalScope scope, string key, int tags)
    {
        Guid variantId, orderId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, key);
            for (var n = 1; n <= tags; n++) AddShelfTag(seed, variantId, QaCode(key, n), PhysicalQaStatus.Pending);
            await seed.SaveChangesAsync();
        }
        await using (var db = scope.NewContext())
            orderId = (await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, $"paid-{key}"))).Order.Id;
        await using (var db = scope.NewContext())
        {
            var order = await db.TagOrders.SingleAsync(o => o.Id == orderId);
            order.Status = OrderStatus.PaymentConfirmed; order.PaymentStatus = PaymentStatus.Confirmed;
            await db.SaveChangesAsync();
        }
        return (variantId, orderId);
    }

    // A tag code in the printed format (no 0, 1, I or O), so it can be inspected.
    private const string QaAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static string QaCode(string key, int n) =>
        $"MPL-{key}-{QaAlphabet[n / 32768 % 32]}{QaAlphabet[n / 1024 % 32]}{QaAlphabet[n / 32 % 32]}{QaAlphabet[n % 32]}";

    private static async Task<Guid> TagIdByCodeAsync(RelationalScope scope, string code)
    {
        await using var db = scope.NewContext();
        return await db.SmartTags.Where(t => t.TagCode == code).Select(t => t.Id).SingleAsync();
    }

    // A real inspection through the QA service: QR and NFC reads, condition,
    // and for a pass a chip UID unique to this tag.
    private static async Task InspectAsync(RelationalScope scope, string code, PhysicalQaStatus decision)
    {
        await using var db = scope.NewContext();
        var qa = QaService(db);
        var item = await qa.LookupAsync(code, default);
        var serial = "04" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(code)))[..12];
        var qr = await qa.CaptureAsync(AdminId, new(code, item.Version, QaCaptureSource.Camera, $"{Site}/q/{code}", null), default);
        var nfc = await qa.CaptureAsync(AdminId, new(code, item.Version, QaCaptureSource.WebNfc, $"{Site}/n/{code}", serial), default);
        var passed = decision == PhysicalQaStatus.Passed;
        await qa.SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version, decision,
            passed ? PhysicalTagCondition.Good : PhysicalTagCondition.Damaged, qr.Evidence, nfc.Evidence,
            passed ? null : "Cracked casing"), default);
    }
}
