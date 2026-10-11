using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The new-sale rule on SQL Server: new sales and allocations consume only
/// units that are on the shelf AND passed physical QA; the public catalogue's
/// inStock agrees with what checkout will accept; the per-SKU locks still make
/// the last unit sell once, even while QA is failing it; an order that has
/// shipped no longer reserves stock whatever later happens to its tag; and
/// legacy (QA NULL) tags already issued or committed keep their flows.
/// </summary>
public sealed class SellableInventoryRelationalTests
{
    private static readonly Guid AdminId = Guid.Parse("d8111111-1111-4111-8111-111111111111");
    private static readonly Guid OwnerId = Guid.Parse("d8222222-2222-4222-8222-222222222222");
    private static readonly Guid PetId = Guid.Parse("d8333333-3333-4333-8333-333333333333");
    private static readonly Guid OtherOwnerId = Guid.Parse("d8444444-4444-4444-8444-444444444444");
    private static readonly Guid OtherPetId = Guid.Parse("d8555555-5555-4555-8555-555555555555");
    private const string Site = "https://mypetlink.example";

    // --- Last unit and concurrency ----------------------------------------------

    [RelationalFact]
    public async Task TheLastPassedUnitSellsExactlyOnceUnderConcurrentCheckouts()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "LAST");
            // One sellable unit, surrounded by stock that must never be sold.
            AddShelfTag(seed, variantId, "MPL-LAST-0001", PhysicalQaStatus.Passed);
            AddShelfTag(seed, variantId, "MPL-LAST-0002", null);
            AddShelfTag(seed, variantId, "MPL-LAST-0003", PhysicalQaStatus.Pending);
            AddShelfTag(seed, variantId, "MPL-LAST-0004", PhysicalQaStatus.Failed);
            await seed.SaveChangesAsync();
        }

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 6).Select(async attempt =>
        {
            await using var db = scope.NewContext();
            try
            {
                await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, $"last-{attempt}"));
                return "ok";
            }
            catch (ApiException error)
            {
                return error.Code;
            }
        }));

        Assert.Equal(1, outcomes.Count(outcome => outcome == "ok"));
        Assert.All(outcomes.Where(outcome => outcome != "ok"), code => Assert.Equal("out_of_stock", code));
        await using var check = scope.NewContext();
        Assert.Equal(1, await check.TagOrders.CountAsync());
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
        Assert.False(await InStockAsync(check, variantId));
    }

    [RelationalTheory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public async Task ACheckoutRacingAQaFailureNeverSellsTheFailedUnit(int round)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, tagId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, $"RACE{round}");
            tagId = AddShelfTag(seed, variantId, $"MPL-RCE{round}-0001", PhysicalQaStatus.Passed, shipment: "RACE-SHIP");
            await seed.SaveChangesAsync();
        }

        PhysicalQaItem item;
        await using (var db = scope.NewContext()) item = await QaService(db).LookupAsync($"MPL-RCE{round}-0001", default);

        var checkout = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            try { await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, $"race-{round}")); return "ok"; }
            catch (ApiException error) { return error.Code; }
        });
        var failure = Task.Run(async () =>
        {
            await using var db = scope.NewContext();
            await QaService(db).SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version,
                PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, null, null, "Chip unreadable on re-check"), default);
        });
        var checkoutOutcome = await checkout;
        await failure;

        await using var check = scope.NewContext();
        // Whichever ran first, the unit is now held and nothing more can be sold.
        Assert.Equal(PhysicalQaStatus.Failed, (await check.SmartTags.SingleAsync(t => t.Id == tagId)).QaStatus);
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
        Assert.False(await InStockAsync(check, variantId));
        if (checkoutOutcome == "ok")
        {
            // The order won the lock first and keeps its reservation; the failed
            // tag can never be the unit that fulfils it.
            var order = await check.TagOrders.SingleAsync();
            order.Status = OrderStatus.PaymentConfirmed;
            order.PaymentStatus = PaymentStatus.Confirmed;
            await check.SaveChangesAsync();
            await using var db = scope.NewContext();
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
                Admin(db).AssignInventoryTagAsync(AdminId, order.Id, tagId))).Code);
        }
        else
        {
            Assert.Equal("out_of_stock", checkoutOutcome);
            Assert.Equal(0, await check.TagOrders.CountAsync());
        }
    }

    // --- Catalogue agreement and the ordering switch -----------------------------

    [RelationalFact]
    public async Task TheCatalogueAdvertisesExactlyWhatCheckoutAccepts()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var cases = new List<(string Name, Guid VariantId, bool Sellable)>();
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            async Task<Guid> Variant(string key) => await SeedVariantAsync(seed, key);

            foreach (var (key, qa) in new (string, PhysicalQaStatus?)[]
                     {
                         ("QNUL", null), ("QPEN", PhysicalQaStatus.Pending), ("QPAS", PhysicalQaStatus.Passed),
                         ("QFAI", PhysicalQaStatus.Failed), ("QREV", PhysicalQaStatus.NeedsReview),
                     })
            {
                var id = await Variant(key);
                AddShelfTag(seed, id, $"MPL-{key}-0001", qa);
                cases.Add(($"shelf, QA {qa?.ToString() ?? "NULL"}", id, qa == PhysicalQaStatus.Passed));
            }

            // Passed units that are not on the shelf.
            var lost = await Variant("LOST");
            AddShelfTag(seed, lost, "MPL-LOST-0001", PhysicalQaStatus.Passed, configure: t => t.Status = SmartTagStatus.Lost);
            cases.Add(("Passed but Lost", lost, false));
            var archived = await Variant("ARCH");
            AddShelfTag(seed, archived, "MPL-ARCH-0001", PhysicalQaStatus.Passed, configure: t => t.ArchivedAt = DateTimeOffset.UtcNow);
            cases.Add(("Passed but archived", archived, false));
            var reseller = await Variant("RSLR");
            AddShelfTag(seed, reseller, "MPL-RSLR-0001", PhysicalQaStatus.Passed, configure: t => t.FulfilmentStatus = TagFulfilmentStatus.SentToReseller);
            cases.Add(("Passed but sent to a reseller", reseller, false));
            var owned = await Variant("OWND");
            AddShelfTag(seed, owned, "MPL-OWND-0001", PhysicalQaStatus.Passed, configure: t => { t.OwnerUserId = OtherOwnerId; t.PetId = OtherPetId; t.Status = SmartTagStatus.Active; });
            cases.Add(("Passed but owned", owned, false));
            var reserved = await Variant("RSRV");
            AddShelfTag(seed, reserved, "MPL-RSRV-0001", PhysicalQaStatus.Passed);
            await seed.SaveChangesAsync();
            AddOrder(seed, reserved, "ORD-RSRV", OrderStatus.PendingPayment, quantity: 1);
            cases.Add(("Passed but reserved by an unpaid order", reserved, false));
            var free = await Variant("FREE");
            AddShelfTag(seed, free, "MPL-FREE-0001", PhysicalQaStatus.Passed);
            AddShelfTag(seed, free, "MPL-FREE-0002", PhysicalQaStatus.Passed);
            await seed.SaveChangesAsync();
            AddOrder(seed, free, "ORD-FREE", OrderStatus.PendingPayment, quantity: 1);
            cases.Add(("two Passed, one reserved", free, true));
            await seed.SaveChangesAsync();
        }

        foreach (var (name, variantId, sellable) in cases)
        {
            bool advertised;
            await using (var db = scope.NewContext()) advertised = await InStockAsync(db, variantId);
            bool accepted;
            await using (var db = scope.NewContext())
            {
                try { await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, $"agree-{variantId:N}")); accepted = true; }
                catch (ApiException error) when (error.Code == "out_of_stock") { accepted = false; }
            }

            Assert.True(sellable == advertised, $"{name}: catalogue said inStock={advertised}");
            Assert.True(advertised == accepted, $"{name}: catalogue inStock={advertised} but checkout accepted={accepted}");
        }
    }

    [RelationalTheory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task TheOrderingSwitchGatesCheckoutWithoutChangingWhatIsInStock(bool orderingEnabled)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid passed, legacy;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            passed = await SeedVariantAsync(seed, "SWPA");
            legacy = await SeedVariantAsync(seed, "SWLG");
            AddShelfTag(seed, passed, "MPL-SWPA-0001", PhysicalQaStatus.Passed);
            AddShelfTag(seed, legacy, "MPL-SWLG-0001", null);
            await seed.SaveChangesAsync();
        }

        await using (var db = scope.NewContext())
        {
            Assert.True(await InStockAsync(db, passed));
            Assert.False(await InStockAsync(db, legacy));
        }

        await using (var db = scope.NewContext())
        {
            if (orderingEnabled)
            {
                await Checkout(db, orderingEnabled).CreateAsync(OwnerId, CheckoutRequest(db, passed, "switch-passed"));
                Assert.Equal("out_of_stock", (await Assert.ThrowsAsync<ApiException>(() =>
                    Checkout(db, orderingEnabled).CreateAsync(OwnerId, CheckoutRequest(db, legacy, "switch-legacy")))).Code);
            }
            else
            {
                foreach (var variantId in new[] { passed, legacy })
                {
                    var error = await Assert.ThrowsAsync<ApiException>(() =>
                        Checkout(db, orderingEnabled).CreateAsync(OwnerId, CheckoutRequest(db, variantId, $"switch-{variantId:N}")));
                    Assert.Equal((StatusCodes.Status403Forbidden, "feature_disabled"), (error.StatusCode, error.Code));
                }
            }
        }

        await using var check = scope.NewContext();
        Assert.Equal(orderingEnabled ? 1 : 0, await check.TagOrders.CountAsync());
    }

    // --- Phantom reservations ----------------------------------------------------

    [RelationalFact]
    public async Task AShippedOrderStopsReservingStockWhateverLaterHappensToItsTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        var historical = new List<(Guid OrderId, Guid TagId)>();
        Guid openOrderId, damagedTagId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "PHAN");
            AddShelfTag(seed, variantId, "MPL-PHAN-0001", PhysicalQaStatus.Passed);
            AddShelfTag(seed, variantId, "MPL-PHAN-0002", PhysicalQaStatus.Passed);
            await seed.SaveChangesAsync();

            // Delivered orders whose tags were later lost, disabled or archived by
            // their owners. They used to reserve one unit each, forever.
            var later = new (SmartTagStatus Status, bool Archived)[]
            {
                (SmartTagStatus.Lost, false), (SmartTagStatus.Disabled, false), (SmartTagStatus.Archived, true),
            };
            for (var index = 0; index < later.Length; index++)
            {
                var order = AddOrder(seed, variantId, $"ORD-DLV-{index}", OrderStatus.Delivered, quantity: 1);
                await seed.SaveChangesAsync();
                var tag = AddShelfTag(seed, variantId, $"MPL-PHAN-01{index:00}", PhysicalQaStatus.Passed, configure: t =>
                {
                    t.Status = later[index].Status;
                    t.ArchivedAt = later[index].Archived ? DateTimeOffset.UtcNow : null;
                    t.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
                    t.OwnerUserId = OwnerId; t.PetId = PetId;
                    t.OrderId = order.Id; t.OrderItemId = order.Items.Single().Id;
                });
                await seed.SaveChangesAsync();
                historical.Add((order.Id, tag));
            }

            // A cancelled order holds nothing.
            AddOrder(seed, variantId, "ORD-CNL", OrderStatus.Cancelled, quantity: 3);

            // An open paid order whose assigned tag was damaged and archived
            // before shipping still needs a unit: it must keep its reservation.
            var open = AddOrder(seed, variantId, "ORD-OPEN", OrderStatus.PaymentConfirmed, quantity: 1);
            await seed.SaveChangesAsync();
            openOrderId = open.Id;
            damagedTagId = AddShelfTag(seed, variantId, "MPL-PHAN-0200", PhysicalQaStatus.Passed, configure: t =>
            {
                t.Status = SmartTagStatus.Preparing; t.ArchivedAt = DateTimeOffset.UtcNow;
                t.OwnerUserId = OwnerId; t.PetId = PetId; t.OrderId = open.Id; t.OrderItemId = open.Items.Single().Id;
            });
            await seed.SaveChangesAsync();
        }

        await using (var db = scope.NewContext())
        {
            // Two Passed units on the shelf, one held by the open order.
            Assert.Equal(1, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
            Assert.Equal(1, (await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync([variantId]))[variantId]);
            Assert.True(await InStockAsync(db, variantId));
        }
        await using (var db = scope.NewContext()) await Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "phantom-1"));
        await using (var db = scope.NewContext())
            Assert.Equal("out_of_stock", (await Assert.ThrowsAsync<ApiException>(() =>
                Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "phantom-2")))).Code);

        // History is untouched: the delivered orders still name their tags.
        await using var check = scope.NewContext();
        foreach (var (orderId, tagId) in historical)
        {
            var tag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == tagId);
            Assert.Equal(orderId, tag.OrderId);
            Assert.NotNull(tag.OrderItemId);
            Assert.Equal(OrderStatus.Delivered, (await check.TagOrders.AsNoTracking().SingleAsync(o => o.Id == orderId)).Status);
        }
        Assert.Equal(openOrderId, (await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == damagedTagId)).OrderId);
    }

    [RelationalFact]
    public async Task AReplacementAfterDeliveryKeepsTraceabilityAndConsumesExactlyOneUnit()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId, oldTagId, newTagId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "REPL");
            newTagId = AddShelfTag(seed, variantId, "MPL-REPL-0001", PhysicalQaStatus.Passed);
            AddShelfTag(seed, variantId, "MPL-REPL-0002", PhysicalQaStatus.Passed);
            var order = AddOrder(seed, variantId, "ORD-REPL", OrderStatus.Delivered, quantity: 1);
            order.PaymentStatus = PaymentStatus.Confirmed;
            await seed.SaveChangesAsync();
            orderId = order.Id;
            oldTagId = AddShelfTag(seed, variantId, "MPL-REPL-0100", PhysicalQaStatus.Passed, configure: t =>
            {
                t.Status = SmartTagStatus.Active; t.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
                t.OwnerUserId = OwnerId; t.PetId = PetId; t.OrderId = order.Id; t.OrderItemId = order.Items.Single().Id;
                t.ActivatedAt = DateTimeOffset.UtcNow.AddDays(-10);
            });
            await seed.SaveChangesAsync();
            order.SmartTagId = oldTagId;
            await seed.SaveChangesAsync();
        }

        await using (var db = scope.NewContext())
            Assert.Equal(2, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));

        await using (var db = scope.NewContext())
            await Admin(db).ReplaceTagAsync(AdminId, orderId, newTagId, "Damaged", "Owner reported a cracked tag");

        await using var check = scope.NewContext();
        var oldTag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == oldTagId);
        var newTag = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == newTagId);
        Assert.Equal(SmartTagStatus.Replaced, oldTag.Status);
        Assert.Equal(orderId, oldTag.OrderId);
        Assert.Equal(orderId, newTag.OrderId);
        Assert.Equal(oldTag.OrderItemId, newTag.OrderItemId);
        // The replacement took one shelf unit, and the order's item is covered.
        Assert.Equal(1, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
    }

    // --- Historical (QA NULL) compatibility ---------------------------------------

    [RelationalFact]
    public async Task LegacyStockOnTheShelfIsNeverUsedForANewCommitment()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId, legacyId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "LGSH");
            legacyId = AddShelfTag(seed, variantId, "MPL-LGSH-0001", null, fulfilment: TagFulfilmentStatus.Printed);
            await seed.SaveChangesAsync();
            var order = AddOrder(seed, variantId, "ORD-LGSH", OrderStatus.PaymentConfirmed, quantity: 1);
            order.PaymentStatus = PaymentStatus.Confirmed;
            await seed.SaveChangesAsync();
            orderId = order.Id;
        }

        await using var db = scope.NewContext();
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(variantId));
        Assert.False(await InStockAsync(db, variantId));
        Assert.Empty(await db.SmartTags.Where(MerchantInventoryEligibility.For(db, variantId)).ToListAsync());
        Assert.Equal("out_of_stock", (await Assert.ThrowsAsync<ApiException>(() =>
            Checkout(db).CreateAsync(OwnerId, CheckoutRequest(db, variantId, "legacy-shelf")))).Code);
        Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
            Admin(db).AssignInventoryTagAsync(AdminId, orderId, legacyId))).Code);
        var tag = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == legacyId);
        Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
            SmartTags(db).ClaimAsync(AdminId, legacyId, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerId, PetId = PetId, ExpectedAssignmentVersion = tag.AssignmentVersion,
            }))).Code);
        Assert.Equal("tag_not_ready", (await Assert.ThrowsAsync<ApiException>(() =>
            Activation(db).ActivateAsync(OwnerId, "MPL-LGSH-0001", new ActivateTagRequest(PetId)))).Code);
        var bulk = await Inventory(db).BulkUpdateFulfilmentAsync(AdminId, new AdminTagInventoryBulkActionRequest("send-to-reseller", [legacyId]));
        Assert.Equal(legacyId, Assert.Single(bulk.Failures).TagId);

        // Nothing was written: the tag is exactly as it was.
        await using var check = scope.NewContext();
        var after = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == legacyId);
        Assert.Equal((SmartTagStatus.Unclaimed, TagFulfilmentStatus.Printed, (PhysicalQaStatus?)null, (Guid?)null),
            (after.Status, after.FulfilmentStatus, after.QaStatus, after.OwnerUserId));
    }

    [RelationalFact]
    public async Task APaidOrderHoldingALegacyTagIsHeldUntilItsTagIsChangedToAnInspectedOne()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId, legacyId, passedId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "HOLD");
            passedId = AddShelfTag(seed, variantId, "MPL-HOLD-0002", PhysicalQaStatus.Passed);
            var order = AddOrder(seed, variantId, "ORD-HOLD", OrderStatus.PaymentConfirmed, quantity: 1);
            await seed.SaveChangesAsync();
            orderId = order.Id;
            // Paid and assigned before the new-sale rule existed (QA NULL).
            legacyId = AddShelfTag(seed, variantId, "MPL-HOLD-0001", null, configure: t =>
            {
                t.Status = SmartTagStatus.Preparing; t.OwnerUserId = OwnerId; t.PetId = PetId;
                t.OrderId = order.Id; t.OrderItemId = order.Items.Single().Id;
            });
            await seed.SaveChangesAsync();
            order.SmartTagId = legacyId;
            await seed.SaveChangesAsync();
        }

        // Preparation is allowed; leaving the warehouse is held.
        await using (var db = scope.NewContext())
        {
            await Admin(db).MarkOrderPreparingAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            var held = await Assert.ThrowsAsync<ApiException>(async () =>
                await Admin(db).MarkOrderReadyToShipAsync(AdminId, orderId, await OrderVersionAsync(db, orderId)));
            Assert.Equal("physical_qa_required", held.Code);
            Assert.Contains("has not been physically inspected yet", held.Message);
        }

        // The hold changes nothing on its own: the order, its payment, its
        // reservation and its assigned tag are exactly as they were.
        await using (var check = scope.NewContext())
        {
            var order = await check.TagOrders.AsNoTracking().SingleAsync(o => o.Id == orderId);
            Assert.Equal((OrderStatus.PreparingTag, PaymentStatus.Confirmed), (order.Status, order.PaymentStatus));
            Assert.Equal(orderId, (await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == legacyId)).OrderId);
            Assert.Equal(1, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
        }

        // Resolved by changing the assigned tag to an inspected one.
        await using (var db = scope.NewContext())
        {
            await Admin(db).ChangeAssignedTagAsync(AdminId, orderId, passedId, "Ship inspected stock");
            await Admin(db).MarkOrderReadyToShipAsync(AdminId, orderId, await OrderVersionAsync(db, orderId));
            await Admin(db).MarkOrderShippedAsync(AdminId, orderId, new MarkOrderShippedRequest(
                "Test Courier", "Standard", "HOLD-TRK-1", null, null, await OrderVersionAsync(db, orderId)));
        }

        await using var after = scope.NewContext();
        Assert.Equal(OrderStatus.Shipped, (await after.TagOrders.SingleAsync(o => o.Id == orderId)).Status);
        var legacy = await after.SmartTags.AsNoTracking().SingleAsync(t => t.Id == legacyId);
        // The legacy tag is back in the warehouse — and still not sellable.
        Assert.Equal((SmartTagStatus.Unclaimed, (Guid?)null, (PhysicalQaStatus?)null), (legacy.Status, legacy.OrderId, legacy.QaStatus));
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(after).GetAvailableUnitsAsync(variantId));
    }

    [RelationalFact]
    public async Task AMerchantAllocationOfLegacyTagsIsHeldAtReadyToShipAndKept()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var db = scope.NewContext())
        {
            await SeedAsync(db);
            await IssueInvoiceAsync(db);
            var merchant = Service(db);
            await merchant.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
            await merchant.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
            // Stand-in for allocations made before the new-sale rule, of stock
            // that was never inspected.
            foreach (var tag in await db.SmartTags.Where(t => db.MerchantOrderAllocatedTags.Any(a => a.SmartTagId == t.Id)).ToListAsync())
                tag.QaStatus = null;
            await db.SaveChangesAsync();
        }

        await using (var db = scope.NewContext())
            Assert.Equal("physical_qa_required", (await Assert.ThrowsAsync<ApiException>(() =>
                Service(db).MarkReadyToShipAsync(AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest()))).Code);

        await using var check = scope.NewContext();
        Assert.Equal(14, await check.MerchantOrderAllocatedTags.CountAsync(a => a.MerchantOrderId == OrderId && a.ReleasedAt == null));
        Assert.NotEqual(MerchantOrderFulfilmentStatus.ReadyToShip, (await check.MerchantOrders.SingleAsync(o => o.Id == OrderId)).FulfilmentStatus);
    }

    [RelationalFact]
    public async Task ALegacyTagAlreadyWithItsOwnerActivatesScansAndTransfersAsBefore()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId, legacyId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "LGOR");
            // Shipped to its owner before the new-sale rule existed (QA NULL).
            var order = AddOrder(seed, variantId, "ORD-LGOR", OrderStatus.Shipped, quantity: 1);
            order.ShippedAt = DateTimeOffset.UtcNow.AddDays(-2);
            await seed.SaveChangesAsync();
            orderId = order.Id;
            legacyId = AddShelfTag(seed, variantId, "MPL-LGOR-0001", null, configure: t =>
            {
                t.Status = SmartTagStatus.Preparing; t.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
                t.OwnerUserId = OwnerId; t.PetId = PetId; t.OrderId = order.Id; t.OrderItemId = order.Items.Single().Id;
            });
            // A Passed tag in the same owned, active state, to compare scanning with.
            AddShelfTag(seed, variantId, "MPL-LGOR-0002", PhysicalQaStatus.Passed, configure: t =>
            {
                t.Status = SmartTagStatus.Active; t.OwnerUserId = OwnerId; t.PetId = PetId;
                t.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
            });
            await seed.SaveChangesAsync();
            order.SmartTagId = legacyId;
            await seed.SaveChangesAsync();
        }

        // The owner activates the tag that reached them.
        await using (var db = scope.NewContext())
            Assert.Equal(SmartTagStatus.Active, (await Activation(db).ActivateAsync(OwnerId, "MPL-LGOR-0001", new ActivateTagRequest(null))).Status);

        // Scanning does not look at QA: the legacy tag resolves exactly like a Passed one.
        await using (var db = scope.NewContext())
        {
            var scans = new TagScanService(db, Options.Create(new CloudflareR2Options()));
            var legacyScan = await scans.ResolveAsync("MPL-LGOR-0001", TagScanSource.Qr, new TagScanContext("127.0.0.1", "test-agent", null));
            var passedScan = await scans.ResolveAsync("MPL-LGOR-0002", TagScanSource.Qr, new TagScanContext("127.0.0.1", "test-agent", null));
            Assert.Equal(passedScan.State, legacyScan.State);
        }

        // Ownership can still be transferred.
        await using (var db = scope.NewContext())
        {
            var tag = await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == legacyId);
            await SmartTags(db).TransferOwnershipAsync(AdminId, legacyId, new AdminSmartTagTransferRequest
            {
                NewOwnerUserId = OtherOwnerId, NewPetId = OtherPetId,
                ExpectedAssignmentVersion = tag.AssignmentVersion, Reason = "Pet rehomed with its tag",
            });
        }

        await using var check = scope.NewContext();
        var stored = await check.SmartTags.AsNoTracking().SingleAsync(t => t.Id == legacyId);
        Assert.Equal((OtherOwnerId, OtherPetId, (PhysicalQaStatus?)null), (stored.OwnerUserId!.Value, stored.PetId!.Value, stored.QaStatus));
        Assert.Equal(OrderStatus.Delivered, (await check.TagOrders.SingleAsync(o => o.Id == orderId)).Status);
    }

    [RelationalTheory]
    [InlineData("owner-activation", true)]
    [InlineData("tag-shipped-to-owner", true)]
    [InlineData("other-tag-activated", false)]
    [InlineData("order-link-only", false)]
    [InlineData("scan-history-only", false)]
    [InlineData("admin-claim-only", false)]
    [InlineData("no-history", false)]
    public async Task ALegacyTagReturnedToUnclaimedIsReactivatedOnlyWithTrustworthyIssuanceHistory(string history, bool reactivates)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, tagId;
        await using (var seed = scope.NewContext())
        {
            await SeedPeopleAsync(seed);
            variantId = await SeedVariantAsync(seed, "RTRN");
            // A legacy tag (QA NULL) whose fulfilment trail never recorded a
            // shipment — it went out before fulfilment tracking, or never left.
            // It is now Disabled with its previous owner unassigned, which is the
            // state an Admin "return to unclaimed" accepts.
            tagId = AddShelfTag(seed, variantId, "MPL-RTRN-0001", null, configure: t => t.Status = SmartTagStatus.Disabled);
            await seed.SaveChangesAsync();
            switch (history)
            {
                case "owner-activation":
                    seed.AuditLogs.Add(new AuditLog
                    {
                        ActorId = OwnerId, ActorType = ActorType.Owner, Action = "tag.activate-retail",
                        Entity = "SmartTag", EntityId = tagId, CreatedAt = DateTimeOffset.UtcNow.AddMonths(-3),
                    });
                    break;
                case "tag-shipped-to-owner":
                    // This tag's own fulfilment trail records that it shipped.
                    var shipped = await seed.SmartTags.SingleAsync(t => t.Id == tagId);
                    shipped.FulfilmentStatus = TagFulfilmentStatus.SentToOwner;
                    shipped.SentToOwnerAt = DateTimeOffset.UtcNow.AddMonths(-3);
                    break;
                case "other-tag-activated":
                    // Evidence must belong to this tag, not to another one.
                    seed.AuditLogs.Add(new AuditLog
                    {
                        ActorId = OwnerId, ActorType = ActorType.Owner, Action = "tag.activate-retail",
                        Entity = "SmartTag", EntityId = Guid.NewGuid(), CreatedAt = DateTimeOffset.UtcNow.AddMonths(-3),
                    });
                    break;
                case "order-link-only":
                    // Still linked to an order item whose order shipped — with
                    // another tag. That proves nothing about this tag.
                    var order = AddOrder(seed, variantId, "ORD-RTRN", OrderStatus.Delivered, quantity: 1);
                    order.ShippedAt = DateTimeOffset.UtcNow.AddMonths(-3);
                    await seed.SaveChangesAsync();
                    (await seed.SmartTags.SingleAsync(t => t.Id == tagId)).OrderItemId = order.Items.Single().Id;
                    break;
                case "scan-history-only":
                    seed.TagScans.Add(new TagScan
                    {
                        SmartTagId = tagId, TagCode = "MPL-RTRN-0001", Source = TagScanSource.Qr,
                        ResolvedState = TagScanResolvedState.Unclaimed, ScanTime = DateTimeOffset.UtcNow.AddDays(-5),
                    });
                    break;
                case "admin-claim-only":
                    seed.AuditLogs.Add(new AuditLog
                    {
                        ActorId = AdminId, ActorType = ActorType.Admin, Action = "smart-tags.owner-and-pet-assigned",
                        Entity = "SmartTag", EntityId = tagId, CreatedAt = DateTimeOffset.UtcNow.AddMonths(-3),
                    });
                    break;
            }
            await seed.SaveChangesAsync();
        }

        await using (var db = scope.NewContext())
            await SmartTags(db).UpdateStatusAsync(AdminId, tagId, "return-to-unclaimed", "Owner gave the tag back");

        await using (var db = scope.NewContext())
        {
            if (reactivates)
            {
                Assert.Equal(SmartTagStatus.Active, (await Activation(db).ActivateAsync(
                    OtherOwnerId, "MPL-RTRN-0001", new ActivateTagRequest(OtherPetId))).Status);
            }
            else
            {
                Assert.Equal("tag_not_ready", (await Assert.ThrowsAsync<ApiException>(() =>
                    Activation(db).ActivateAsync(OtherOwnerId, "MPL-RTRN-0001", new ActivateTagRequest(OtherPetId)))).Code);
            }
        }

        // A returned legacy tag is never stock for a new sale either way.
        await using var check = scope.NewContext();
        Assert.Equal(0, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
    }

    [RelationalFact]
    public async Task ALegacyTagSoldThroughAMerchantOrResellerCanStillBeHandedToItsOwner()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        var merchant = Service(db);
        await merchant.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await merchant.AutoAllocateAsync(AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await merchant.MarkReadyToShipAsync(AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await merchant.MarkShippedAsync(AdminAccountId, OrderId,
            new MarkMerchantOrderShippedRequest(null, "Test Courier", null, "TRK-LG-1", null, null));

        // Stand-in for stock that was sold this way before physical QA existed.
        var shipped = await db.SmartTags.Where(t => db.MerchantOrderAllocatedTags.Any(a => a.SmartTagId == t.Id)).ToListAsync();
        foreach (var tag in shipped) tag.QaStatus = null;
        var reseller = await db.SmartTags.FirstAsync(t => !db.MerchantOrderAllocatedTags.Any(a => a.SmartTagId == t.Id));
        reseller.QaStatus = null;
        reseller.FulfilmentStatus = TagFulfilmentStatus.Received;
        var finalPet = new Pet
        {
            Id = Guid.NewGuid(), OwnerUserId = OwnerAccountId, Slug = "rex-legacy01", Name = "Rex", Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active, CreatedAt = Now, UpdatedAt = Now,
        };
        db.Pets.Add(finalPet);
        await db.SaveChangesAsync();

        await using (var owner = scope.NewContext())
            Assert.Equal(SmartTagStatus.Active, (await Activation(owner).ActivateAsync(
                OwnerAccountId, shipped[0].TagCode, new ActivateTagRequest(finalPet.Id))).Status);

        await using (var admin = scope.NewContext())
        {
            var tag = await admin.SmartTags.AsNoTracking().SingleAsync(t => t.Id == reseller.Id);
            await SmartTags(admin, AdminAccountId).ClaimAsync(AdminAccountId, reseller.Id, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerAccountId, PetId = finalPet.Id, ExpectedAssignmentVersion = tag.AssignmentVersion,
                Reason = "Bought from a reseller before physical QA",
            });
        }

        await using var check = scope.NewContext();
        Assert.Equal(OwnerAccountId, (await check.SmartTags.SingleAsync(t => t.Id == shipped[0].Id)).OwnerUserId);
        Assert.Equal(OwnerAccountId, (await check.SmartTags.SingleAsync(t => t.Id == reseller.Id)).OwnerUserId);
    }

    // --- Helpers -----------------------------------------------------------------------

    private static OrderService Checkout(MyPetLinkDbContext db, bool orderingEnabled = true) => new(
        db, Options.Create(new FeatureOptions { SmartTagOrderingEnabled = orderingEnabled }), new TagPricingService(db),
        new DeliveryService(db, new TagPricingService(db), new AuditLogService(db, new HttpContextAccessor())),
        new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()), TimeProvider.System,
        inventoryAvailability: new TagOrderInventoryAvailabilityService(db));

    private static AdminService Admin(MyPetLinkDbContext db) =>
        new(db, new AuditLogService(db, new HttpContextAccessor()), Options.Create(new FeatureOptions()));

    private static AdminSmartTagService SmartTags(MyPetLinkDbContext db, Guid? _ = null) =>
        new(db, new AuditLogService(db, new HttpContextAccessor()));

    private static SmartTagService Activation(MyPetLinkDbContext db) => new(db, new AuditLogService(db, new HttpContextAccessor()));

    private static AdminTagInventoryService Inventory(MyPetLinkDbContext db) => new(db,
        new AuditLogService(db, new HttpContextAccessor()), Options.Create(new PublicSiteOptions { BaseUrl = Site }));

    private static PhysicalQaService QaService(MyPetLinkDbContext db) => new(db,
        new AuditLogService(db, new HttpContextAccessor()), PhysicalQaTests.Protection,
        Options.Create(new PublicSiteOptions { BaseUrl = Site }), TimeProvider.System);

    private static async Task<bool> InStockAsync(MyPetLinkDbContext db, Guid variantId)
    {
        var catalog = new TagCatalogService(db, new AuditLogService(db, new HttpContextAccessor()),
            new TagPricingService(db), Options.Create(new CloudflareR2Options()));
        var key = await db.TagProductVariants.AsNoTracking().Where(v => v.Id == variantId).Select(v => v.PublicKey).SingleAsync();
        return (await catalog.ListPublicAsync()).SelectMany(p => p.Variants).Single(v => v.Key == key).InStock;
    }

    private static CreateTagOrderRequest CheckoutRequest(MyPetLinkDbContext db, Guid variantId, string key) => new(
        PetId, db.TagProductVariants.AsNoTracking().Single(v => v.Id == variantId).PublicKey, 1,
        new DeliveryDetailsRequest("Aina", "+60123456789", "1 Jalan Pet", null, "50000", "Kuala Lumpur", "KUL", null),
        null, key);

    private static async Task<string> OrderVersionAsync(MyPetLinkDbContext db, Guid orderId) =>
        Convert.ToBase64String(await db.TagOrders.AsNoTracking().Where(o => o.Id == orderId).Select(o => o.RowVersion).SingleAsync());

    private static async Task SeedPeopleAsync(MyPetLinkDbContext db)
    {
        foreach (var (id, email, name) in new[] { (AdminId, "sell.admin@example.com", "Sell Admin"),
            (OwnerId, "sell.owner@example.com", "Sell Owner"), (OtherOwnerId, "sell.other@example.com", "Other Owner") })
            db.Users.Add(new User
            {
                Id = id, Email = email, NormalizedEmail = email.ToUpperInvariant(), DisplayName = name, Status = UserStatus.Active,
                AdminUser = id == AdminId ? new AdminUser { UserId = id, Role = AdminRole.Admin, IsActive = true } : null,
            });
        db.Pets.Add(new Pet { Id = PetId, OwnerUserId = OwnerId, Slug = "milo-sell1", Name = "Milo", Species = "Dog", LifecycleStatus = PetLifecycleStatus.Active });
        db.Pets.Add(new Pet { Id = OtherPetId, OwnerUserId = OtherOwnerId, Slug = "luna-sell2", Name = "Luna", Species = "Cat", LifecycleStatus = PetLifecycleStatus.Active });
        db.DeliveryRates.Add(new DeliveryRate
        {
            Name = "Peninsular Standard Delivery", ZoneCode = "PEN", ApplicableStateCodesJson = "[\"KUL\"]",
            Fee = 0m, Currency = "MYR", IsActive = true,
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedVariantAsync(MyPetLinkDbContext db, string key)
    {
        var product = new TagProduct { Name = $"Smart Tag {key}", Slug = $"sell-{key.ToLowerInvariant()}", IsPublished = true };
        var variant = new TagProductVariant
        {
            TagProduct = product, PublicKey = $"SELL{key}VARIANT".PadRight(16, '0')[..16], Sku = $"MPL-SELL-{key}",
            DisplayName = "Lightweight, QR + NFC", SupportsQr = true, SupportsNfc = true, TagVariant = "Lightweight",
            BasePrice = 39.90m, Currency = "MYR", IsActive = true, IsPurchasable = true,
        };
        db.AddRange(product, variant);
        await db.SaveChangesAsync();
        return variant.Id;
    }

    private static Guid AddShelfTag(MyPetLinkDbContext db, Guid variantId, string code, PhysicalQaStatus? qa,
        TagFulfilmentStatus fulfilment = TagFulfilmentStatus.Generated, string? shipment = null, Action<SmartTag>? configure = null)
    {
        var tag = new SmartTag
        {
            TagCode = code, ProductVariantId = variantId, HasNfc = true, Variant = "Lightweight",
            Status = SmartTagStatus.Unclaimed, FulfilmentStatus = fulfilment, QaStatus = qa,
            QaShipmentReference = qa is null ? null : shipment ?? "SELL-SHIP", QaVersion = qa is null ? 0 : 1,
        };
        configure?.Invoke(tag);
        db.SmartTags.Add(tag);
        return tag.Id == Guid.Empty ? (tag.Id = Guid.NewGuid()) : tag.Id;
    }

    private static TagOrder AddOrder(MyPetLinkDbContext db, Guid variantId, string number, OrderStatus status, int quantity)
    {
        var variant = db.TagProductVariants.Single(v => v.Id == variantId);
        var order = new TagOrder
        {
            OrderNumber = number, OwnerUserId = OwnerId, PetId = PetId, TagType = TagType.QrNfcSmartTag, Variant = variant.TagVariant,
            Amount = 39.90m * quantity, Currency = "MYR", Status = status,
            PaymentStatus = status is OrderStatus.PendingPayment or OrderStatus.Cancelled ? PaymentStatus.Pending : PaymentStatus.Confirmed,
            RecipientName = "Aina", DeliveryPhoneE164 = "+60123456789", AddressLine1 = "1 Jalan Pet", Postcode = "50000",
            City = "Kuala Lumpur", State = "WP",
            PaymentReservationExpiresAt = status == OrderStatus.PendingPayment ? DateTimeOffset.UtcNow.AddHours(2) : null,
            Items =
            {
                new TagOrderItem
                {
                    ProductVariantId = variant.Id, SkuSnapshot = variant.Sku, ProductNameSnapshot = "Smart Tag",
                    VariantNameSnapshot = variant.DisplayName, UnitBasePrice = 39.90m, Quantity = quantity,
                    Subtotal = 39.90m * quantity, FinalUnitPrice = 39.90m, FinalAmount = 39.90m * quantity, Currency = "MYR",
                },
            },
        };
        db.TagOrders.Add(order);
        return order;
    }
}
