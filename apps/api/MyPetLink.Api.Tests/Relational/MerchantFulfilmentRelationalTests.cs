using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

public sealed class MerchantFulfilmentRelationalTests
{
    private static MarkMerchantOrderShippedRequest Shipment(
        string tracking = "TRK-0001", string? courierName = "Test Courier") =>
        new(null, courierName, "Next day", tracking, 18.50m, "Two cartons, gate B.");

    private static async Task AllocateEverythingAsync(
        MerchantFulfilmentService service, Guid orderId = default)
    {
        var id = orderId == default ? OrderId : orderId;
        await service.AutoAllocateAsync(
            AdminAccountId, id, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, id, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
    }

    // =====================================================================
    // Ready to ship
    // =====================================================================

    [RelationalFact]
    public async Task AnIncompletelyAllocatedOrderCannotBecomeReadyToShip()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);

        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));

        var failure = await Assert.ThrowsAsync<ApiException>(() => service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest()));

        Assert.Equal("allocation_incomplete", failure.Code);
        Assert.Contains("WS-NFC-0001", failure.Message);
        Assert.Contains("4 more unit", failure.Message);
    }

    [RelationalFact]
    public async Task FullAllocationAllowsReadyToShip()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);

        var result = await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        Assert.Equal("ReadyToShip", result.FulfilmentStatus);
        Assert.Equal(Now, result.ReadyToShipAt);
        Assert.True(result.Allocation.IsFullyAllocated);
        Assert.Equal(14, result.Allocation.AllocatedUnits);
    }

    [RelationalFact]
    public async Task RepeatingReadyToShipChangesNothing()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);

        var first = await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        var second = await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        Assert.Equal(first.ReadyToShipAt, second.ReadyToShipAt);
        Assert.Equal(
            1, await db.AuditLogs.CountAsync(log => log.Action == "merchant-order.ready-to-ship"));
    }

    // =====================================================================
    // Shipping
    // =====================================================================

    [RelationalFact]
    public async Task ShippingRequiresATrackingNumber()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var failure = await Assert.ThrowsAsync<ApiException>(() => service.MarkShippedAsync(
            AdminAccountId, OrderId, Shipment(tracking: "   ")));

        Assert.Equal("tracking_required", failure.Code);
        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal(MerchantOrderFulfilmentStatus.ReadyToShip, order.FulfilmentStatus);
    }

    [RelationalFact]
    public async Task AnOrderCannotShipBeforeItIsReady()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));

        var failure = await Assert.ThrowsAsync<ApiException>(() => service.MarkShippedAsync(
            AdminAccountId, OrderId, Shipment()));

        Assert.Equal("invalid_fulfilment_transition", failure.Code);
    }

    [RelationalFact]
    public async Task ShippingHandsEveryAllocatedTagToTheMerchant()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var result = await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        Assert.Equal("Shipped", result.FulfilmentStatus);
        Assert.Equal("TRK-0001", result.TrackingNumber);
        Assert.Equal("Test Courier", result.CourierProvider);

        var allocations = await db.MerchantOrderAllocatedTags.AsNoTracking().ToListAsync();
        Assert.Equal(14, allocations.Count);
        Assert.All(allocations, allocation =>
        {
            Assert.Equal(MerchantAllocationStatus.SentToMerchant, allocation.Status);
            Assert.Equal(Now, allocation.SentToMerchantAt);
        });

        var tags = await db.SmartTags
            .AsNoTracking()
            .Where(tag => allocations.Select(a => a.SmartTagId).Contains(tag.Id))
            .ToListAsync();
        Assert.All(tags, tag =>
        {
            Assert.Equal(TagFulfilmentStatus.SentToReseller, tag.FulfilmentStatus);
            Assert.Equal(Now, tag.SentToResellerAt);
            // The final pet owner still has to activate it themselves.
            Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
            Assert.Null(tag.OwnerUserId);
            Assert.Null(tag.PetId);
        });
    }

    [RelationalFact]
    public async Task ShippedInventoryIsNoLongerAvailableToAnyoneElse()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        // Retail sees none of it.
        var retailAvailable = await new TagOrderInventoryAvailabilityService(db)
            .GetAvailableUnitsAsync(QrVariantId);
        Assert.Equal(4, retailAvailable);

        // Nor does another merchant order.
        var eligible = await db.SmartTags
            .CountAsync(MerchantInventoryEligibility.For(db, QrVariantId));
        Assert.Equal(4, eligible);
    }

    [RelationalFact]
    public async Task RepeatingShippedDoesNotShipTwice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var first = await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());
        var second = await service.MarkShippedAsync(
            AdminAccountId, OrderId, Shipment(tracking: "TRK-DIFFERENT"));

        Assert.Equal(first.ShippedAt, second.ShippedAt);
        Assert.Equal("TRK-0001", second.TrackingNumber);
        Assert.Equal(1, await db.AuditLogs.CountAsync(log => log.Action == "merchant-order.shipped"));
    }

    [RelationalFact]
    public async Task ShippedInventoryCannotBeReleased()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());
        var one = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id).FirstAsync();

        var failure = await Assert.ThrowsAsync<ApiException>(() => service.ReleaseAsync(
            AdminAccountId, OrderId, new ReleaseMerchantInventoryRequest([one], "Changed my mind.")));

        Assert.Equal("allocation_not_allowed", failure.Code);
        Assert.Equal(0, await db.MerchantOrderAllocatedTags.CountAsync(a => a.ReleasedAt != null));
    }

    [RelationalFact]
    public async Task InternalCourierCostAndNotesStayOutOfTheDeliveryOrder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        // A delivery order records who issued it, and that identity comes from
        // the order's invoice, so the fixture takes the same payment-first
        // route production does.
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var document = await service.IssueDeliveryOrderAsync(AdminAccountId, OrderId);
        var serialised = System.Text.Json.JsonSerializer.Serialize(document);

        Assert.DoesNotContain("18.5", serialised);
        Assert.DoesNotContain("gate B", serialised);
    }

    // =====================================================================
    // Delivered
    // =====================================================================

    [RelationalFact]
    public async Task DeliveryFollowsShipmentAndIsIdempotent()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var first = await service.MarkDeliveredAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        var second = await service.MarkDeliveredAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        Assert.Equal("Delivered", first.FulfilmentStatus);
        Assert.Equal(first.DeliveredAt, second.DeliveredAt);
        Assert.Equal(
            1, await db.AuditLogs.CountAsync(log => log.Action == "merchant-order.delivered"));
    }

    [RelationalFact]
    public async Task AnOrderCannotBeDeliveredBeforeItShips()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var failure = await Assert.ThrowsAsync<ApiException>(() => service.MarkDeliveredAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest()));

        Assert.Equal("invalid_fulfilment_transition", failure.Code);
    }

    // =====================================================================
    // Delivery order record
    // =====================================================================

    [RelationalFact]
    public async Task ADeliveryOrderCannotBeIssuedBeforeTheOrderIsReady()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));

        var failure = await Assert.ThrowsAsync<ApiException>(
            () => service.IssueDeliveryOrderAsync(AdminAccountId, OrderId));

        Assert.Equal("delivery_order_not_ready", failure.Code);
        Assert.Empty(await db.MerchantDeliveryOrders.ToListAsync());
    }

    [RelationalFact]
    public async Task TheDeliveryOrderSnapshotsQuantitiesAndBatchesOnly()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        // A delivery order records who issued it, and that identity comes from
        // the order's invoice, so the fixture takes the same payment-first
        // route production does.
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var document = await service.IssueDeliveryOrderAsync(AdminAccountId, OrderId);

        Assert.Equal("MPL-DO-260806-0001", document.DeliveryOrderNumber);
        Assert.Equal("MPL-B2B-ORD-260806-0001", document.MerchantOrderNumber);
        Assert.Equal(2, document.Items.Count);

        var qr = document.Items.Single(item => item.SkuCode == "WS-QR-0001");
        Assert.Equal(10, qr.OrderedQuantity);
        Assert.Equal(10, qr.AllocatedQuantity);
        Assert.Equal("B-2601 x 10", qr.BatchSummary);

        var nfc = document.Items.Single(item => item.SkuCode == "WS-NFC-0001");
        Assert.Contains("B-2601 x 3", nfc.BatchSummary);
        Assert.Contains("B-2602 x 1", nfc.BatchSummary);

        // A document that leaves the building carries no database ids and no
        // individual tag codes — only the SKU, the counts, and the batches.
        var serialised = System.Text.Json.JsonSerializer.Serialize(document.Items);
        var allocated = await db.MerchantOrderAllocatedTags
            .Select(allocation => new { allocation.TagCodeSnapshot, allocation.SmartTagId })
            .ToListAsync();
        Assert.Equal(14, allocated.Count);
        Assert.All(allocated, row =>
        {
            Assert.DoesNotContain(row.TagCodeSnapshot, serialised);
            Assert.DoesNotContain(row.SmartTagId.ToString(), serialised);
        });
    }

    [RelationalFact]
    public async Task IssuingADeliveryOrderTwiceReturnsTheSameDocument()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        // A delivery order records who issued it, and that identity comes from
        // the order's invoice, so the fixture takes the same payment-first
        // route production does.
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var first = await service.IssueDeliveryOrderAsync(AdminAccountId, OrderId);
        var second = await service.IssueDeliveryOrderAsync(AdminAccountId, OrderId);

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(first.DeliveryOrderNumber, second.DeliveryOrderNumber);
        Assert.Equal(1, await db.MerchantDeliveryOrders.CountAsync());
    }

    [RelationalFact]
    public async Task ConcurrentIssuersProduceOneDeliveryOrder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup);
        // A delivery order records who issued it, and that identity comes from
        // the order's invoice, so the fixture takes the same payment-first
        // route production does.
            await IssueInvoiceAsync(setup);
            var service = Service(setup);
            await AllocateEverythingAsync(service);
            await service.MarkReadyToShipAsync(
                AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        }

        const int workers = 6;
        using var gate = new SemaphoreSlim(0, workers);
        var numbers = new string?[workers];

        var running = Enumerable.Range(0, workers).Select(async index =>
        {
            await gate.WaitAsync();
            await using var db = scope.NewContext();
            try
            {
                numbers[index] =
                    (await Service(db).IssueDeliveryOrderAsync(AdminAccountId, OrderId))
                    .DeliveryOrderNumber;
            }
            catch (ApiException)
            {
                numbers[index] = null;
            }
        }).ToArray();

        gate.Release(workers);
        await Task.WhenAll(running);

        await using var check = scope.NewContext();
        Assert.Equal(1, await check.MerchantDeliveryOrders.CountAsync());
        Assert.Single(numbers.Where(number => number is not null).Distinct());
    }

    // =====================================================================
    // Paid-order cancellation
    // =====================================================================

    [RelationalFact]
    public async Task APaidOrderKeepsItsInventoryUntilAControlledRefundExists()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);

        // Allocation can still be corrected before shipment without cancelling.
        var one = await db.MerchantOrderAllocatedTags
            .Select(allocation => allocation.Id).FirstAsync();
        var summary = await service.ReleaseAsync(
            AdminAccountId, OrderId,
            new ReleaseMerchantInventoryRequest([one], "Miscount during packing."));

        Assert.Equal(13, summary.AllocatedUnits);
        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal(MerchantOrderPaymentStatus.PaymentConfirmed, order.PaymentStatus);
        Assert.Null(order.CancelledAt);
    }

    // =====================================================================
    // Fulfilment audit
    // =====================================================================

    [RelationalFact]
    public async Task EveryFulfilmentStepIsAudited()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        // A delivery order records who issued it, and that identity comes from
        // the order's invoice, so the fixture takes the same payment-first
        // route production does.
        await IssueInvoiceAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.IssueDeliveryOrderAsync(AdminAccountId, OrderId);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());
        await service.MarkDeliveredAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        var actions = await db.AuditLogs.Select(log => log.Action).ToListAsync();
        Assert.Contains("merchant-order.ready-to-ship", actions);
        Assert.Contains("merchant-delivery-order.issued", actions);
        Assert.Contains("merchant-order.shipped", actions);
        Assert.Contains("merchant-order.delivered", actions);

        // The shipping audit records the courier and tracking, never the
        // internal cost or the internal note.
        var shipped = await db.AuditLogs
            .Where(log => log.Action == "merchant-order.shipped")
            .Select(log => log.NewValue!)
            .SingleAsync();
        Assert.Contains("TRK-0001", shipped);
        Assert.DoesNotContain("18.5", shipped);
        Assert.DoesNotContain("gate B", shipped);
    }

    // =====================================================================
    // Delivery order seller snapshot
    // =====================================================================

    /// <summary>
    /// Merchant fulfilment is payment-first, so an invoice always exists by the
    /// time a delivery order is issued — and the delivery order takes its
    /// issuer identity from it. An order that somehow reaches this point
    /// without one must be refused rather than quietly stamped with whatever
    /// the settings table happens to say today.
    /// </summary>
    [RelationalFact]
    public async Task ADeliveryOrderIsRefusedWhenTheOrderHasNoInvoice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        var service = Service(db);
        await AllocateEverythingAsync(service);
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        Assert.Empty(await db.MerchantInvoices.AsNoTracking().ToListAsync());

        var refusal = await Assert.ThrowsAsync<ApiException>(
            () => service.IssueDeliveryOrderAsync(AdminAccountId, OrderId));

        Assert.Equal(409, refusal.StatusCode);
        Assert.Equal("delivery_order_seller_unavailable", refusal.Code);
        Assert.Contains("Issue the invoice first", refusal.Message);
        // Admin-readable: no code, no type name, no stack.
        Assert.DoesNotContain("_", refusal.Message);

        // Nothing half-created.
        await using var verify = scope.NewContext();
        Assert.Empty(await verify.MerchantDeliveryOrders.AsNoTracking().ToListAsync());
        Assert.DoesNotContain(
            await verify.AuditLogs.AsNoTracking().Select(log => log.Action).ToListAsync(),
            action => action.Contains("delivery-order", StringComparison.OrdinalIgnoreCase));
    }

    [RelationalFact]
    public async Task TheDeliveryOrderKeepsItsOwnCopyOfTheSellerIdentity()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid deliveryOrderId;

        await using (var db = scope.NewContext())
        {
            await SeedAsync(db);
            await IssueInvoiceAsync(db);
            var service = Service(db);
            await AllocateEverythingAsync(service);
            await service.MarkReadyToShipAsync(
                AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
            deliveryOrderId = (await service.IssueDeliveryOrderAsync(AdminAccountId, OrderId)).Id;
        }

        await using (var check = scope.NewContext())
        {
            var document = await check.MerchantDeliveryOrders
                .AsNoTracking()
                .SingleAsync(item => item.Id == deliveryOrderId);
            var invoice = await check.MerchantInvoices.AsNoTracking().FirstAsync();

            // The copy carries the issuer, field for field.
            Assert.Equal(invoice.Seller.BrandName, document.Seller.BrandName);
            Assert.Equal(invoice.Seller.LegalBusinessName, document.Seller.LegalBusinessName);
            Assert.Equal(
                invoice.Seller.BusinessRegistrationNumber,
                document.Seller.BusinessRegistrationNumber);
            Assert.Equal(invoice.Seller.TaxIdentificationNumber, document.Seller.TaxIdentificationNumber);
            Assert.Equal(invoice.Seller.SstRegistrationNumber, document.Seller.SstRegistrationNumber);
            Assert.Equal(invoice.Seller.AddressLine1, document.Seller.AddressLine1);
            Assert.Equal(invoice.Seller.Postcode, document.Seller.Postcode);
            Assert.Equal(invoice.Seller.City, document.Seller.City);
            Assert.Equal(invoice.Seller.State, document.Seller.State);
            Assert.Equal(invoice.Seller.Country, document.Seller.Country);
            Assert.Equal(invoice.Seller.SupportEmail, document.Seller.SupportEmail);
            Assert.Equal(invoice.Seller.BusinessPhone, document.Seller.BusinessPhone);
            Assert.Equal(invoice.Seller.BusinessWebsite, document.Seller.BusinessWebsite);
            Assert.False(string.IsNullOrWhiteSpace(document.Seller.LegalBusinessName));
        }

        // Rebrand everything the identity could have come from.
        await using (var rebrand = scope.NewContext())
        {
            var settings = await rebrand.BusinessIdentitySettings.FirstAsync();
            settings.BrandName = "Rebranded Brand";
            settings.LegalBusinessName = "Rebranded Holdings Berhad";
            settings.BusinessRegistrationNumber = "999999999999";
            settings.RegisteredAddressLine1 = "999 New Tower";
            settings.SupportEmail = "new@rebranded.example";

            var invoice = await rebrand.MerchantInvoices.FirstAsync();
            invoice.Seller.LegalBusinessName = "Invoice Was Edited Later";
            invoice.Seller.BrandName = "Invoice Brand Edited";
            await rebrand.SaveChangesAsync();
        }

        await using (var after = scope.NewContext())
        {
            var document = await after.MerchantDeliveryOrders
                .AsNoTracking()
                .SingleAsync(item => item.Id == deliveryOrderId);

            // A value copy, not a shared row: neither edit reached it.
            Assert.Equal("MyPetLink Sdn Bhd", document.Seller.LegalBusinessName);
            Assert.Equal("MyPetLink", document.Seller.BrandName);
            Assert.Equal("202601000001", document.Seller.BusinessRegistrationNumber);
            Assert.Equal("12 Jalan Teknologi", document.Seller.AddressLine1);
            Assert.Equal("support@mypetlink.local", document.Seller.SupportEmail);
        }
    }
}
