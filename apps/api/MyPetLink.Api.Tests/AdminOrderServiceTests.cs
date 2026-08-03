using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class AdminOrderServiceTests
{
    [Fact]
    public async Task List_SearchesFiltersSortsAndPagesOnTheServer()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Query.ListAsync(new AdminOrderQuery
        {
            Search = "aina@example.com",
            PaymentStatus = "Confirmed",
            TagType = "QR_NFC",
            SortBy = "orderNumber",
            SortDir = "asc",
            PageSize = 2
        });

        Assert.Equal(3, total);
        Assert.Equal(2, items.Count);
        Assert.All(items, item =>
        {
            Assert.Equal(PaymentStatus.Confirmed, item.PaymentStatus);
            Assert.Equal(TagType.QrNfcSmartTag, item.TagType);
        });
    }

    [Fact]
    public async Task List_SeparatesPaymentFromDerivedFulfilment()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.Query.ListAsync(new AdminOrderQuery
        {
            PaymentStatus = "Confirmed",
            FulfilmentStatus = "Preparing"
        });

        Assert.Equal(1, total);
        var item = Assert.Single(items);
        Assert.Equal(PaymentStatus.Confirmed, item.PaymentStatus);
        Assert.Equal(AdminOrderFulfilmentStatus.Preparing, item.FulfilmentStatus);
        Assert.Equal(OrderStatus.PreparingTag, item.OrderStatus);
    }

    [Fact]
    public async Task Counts_IgnoreStageButRespectOtherFilters()
    {
        using var harness = await Harness.CreateAsync();
        var counts = await harness.Query.CountByStageAsync(new AdminOrderQuery
        {
            Stage = "delivered",
            TagType = "QR_NFC"
        });

        Assert.Equal(3, counts.All);
        Assert.Equal(1, counts.ReadyToPrepare);
        Assert.Equal(1, counts.Preparing);
        Assert.Equal(1, counts.Shipped);
        Assert.Equal(0, counts.Delivered);
    }

    [Fact]
    public async Task List_RejectsUnsafeSortInvalidFilterAndInvertedRanges()
    {
        using var harness = await Harness.CreateAsync();
        await Assert.ThrowsAsync<ApiException>(() => harness.Query.ListAsync(
            new AdminOrderQuery { SortBy = "CreatedAt; DROP TABLE" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Query.ListAsync(
            new AdminOrderQuery { FulfilmentStatus = "Packed" }));
        await Assert.ThrowsAsync<ApiException>(() => harness.Query.ListAsync(
            new AdminOrderQuery { CreatedFrom = Harness.Now, CreatedTo = Harness.Now.AddDays(-1) }));
    }

    [Fact]
    public async Task Export_UsesAllFilteredRowsAndOmitsInternalIdentifiers()
    {
        using var harness = await Harness.CreateAsync();
        var export = await harness.Query.ExportAsync(
            Harness.AdminId,
            new AdminOrderQuery { PaymentStatus = "Confirmed", PageSize = 1 },
            "csv",
            null);
        var text = Encoding.UTF8.GetString(export.Content);

        Assert.Contains("MPL-ORD-PAID", text);
        Assert.Contains("MPL-ORD-PREPARING", text);
        Assert.DoesNotContain(Harness.OwnerId.ToString(), text);
        Assert.DoesNotContain("OwnerUserId", text);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "orders.export");
    }

    [Fact]
    public async Task ConfirmAndRejectPaymentShareTheExistingProofTransitionLogic()
    {
        using var harness = await Harness.CreateAsync();
        var review = await harness.Db.TagOrders.SingleAsync(order => order.Status == OrderStatus.PaymentProofSubmitted);
        var confirmed = await harness.Admin.ConfirmPaymentAsync(Harness.AdminId, review.Id);
        Assert.Equal(PaymentStatus.Confirmed, confirmed.Order.PaymentStatus);
        Assert.Equal("MPL-RCP-260717140000-4000", confirmed.Order.ReceiptNumber);
        Assert.Equal(
            confirmed.Order.ReceiptNumber,
            (await harness.Db.TagOrders.AsNoTracking().SingleAsync(order => order.Id == review.Id)).ReceiptNumber);
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.ConfirmPaymentAsync(Harness.AdminId, review.Id));
        Assert.Equal(
            "MPL-RCP-260717140000-4000",
            (await harness.Db.TagOrders.AsNoTracking().SingleAsync(order => order.Id == review.Id)).ReceiptNumber);

        var second = Harness.Order("MPL-ORD-REVIEW-2", OrderStatus.PaymentProofSubmitted, PaymentStatus.ProofSubmitted, false);
        second.PaymentProofs.Add(Harness.Proof());
        harness.Db.TagOrders.Add(second);
        await harness.Db.SaveChangesAsync();
        var rejected = await harness.Admin.RejectPaymentProofAsync(Harness.AdminId, second.Id, "Reference does not match");
        Assert.Equal(PaymentStatus.Rejected, rejected.Order.PaymentStatus);
        Assert.Equal(OrderStatus.PendingPayment, rejected.Order.Status);
        Assert.Equal(Harness.Now.AddMinutes(120), rejected.Order.PaymentReservationExpiresAt);
        Assert.Null(rejected.Order.PaymentReservationExpiredAt);
        Assert.Equal("Reference does not match", rejected.Order.PaymentProofs.Single().RejectionReason);
        await Assert.ThrowsAsync<ApiException>(() => harness.Admin.RejectPaymentProofAsync(Harness.AdminId, second.Id, "Again"));
        Assert.Equal(
            Harness.Now.AddMinutes(120),
            (await harness.Db.TagOrders.AsNoTracking().SingleAsync(order => order.Id == second.Id))
                .PaymentReservationExpiresAt);
    }

    [Fact]
    public async Task PaymentProofQueue_SearchesFiltersCountsAndExportsServerSide()
    {
        using var harness = await Harness.CreateAsync();
        var (items, total) = await harness.PaymentProofQuery.ListAsync(new AdminPaymentProofQuery
        {
            Search = "REF-ORDER-123",
            Status = "PendingReview",
            HasMedia = true,
            SortBy = "submittedAt",
            SortDir = "asc"
        });

        var item = Assert.Single(items);
        Assert.Equal(1, total);
        Assert.Equal("MPL-ORD-REVIEW", item.OrderNumber);
        Assert.Equal(PaymentStatus.ProofSubmitted, item.OrderPaymentStatus);
        Assert.True(item.HasMedia);
        Assert.Equal(46m, item.SubmittedAmount);
        Assert.True(item.RequiresAttention);

        var counts = await harness.PaymentProofQuery.CountByStatusAsync(new AdminPaymentProofQuery { Status = "Approved" });
        Assert.Equal(1, counts.All);
        Assert.Equal(1, counts.PendingReview);

        var export = await harness.PaymentProofQuery.ExportAsync(Harness.AdminId, new AdminPaymentProofQuery(), "csv", [item.Id]);
        var text = Encoding.UTF8.GetString(export.Content);
        Assert.Contains("MPL-ORD-REVIEW", text);
        Assert.Contains("Submitted Amount", text);
        Assert.Contains("Difference", text);
        Assert.DoesNotContain(item.Id.ToString(), text);
        Assert.DoesNotContain("StoragePath", text);
    }

    [Fact]
    public async Task OrderSearchAndExportUseTheStoredReceiptNumber()
    {
        using var harness = await Harness.CreateAsync();
        var stored = await harness.Db.TagOrders
            .SingleAsync(order => order.OrderNumber == "MPL-ORD-PAID");
        stored.ReceiptNumber = "MPL-RCP-LEGACY-PAID";
        await harness.Db.SaveChangesAsync();

        var (items, total) = await harness.Query.ListAsync(new AdminOrderQuery
        {
            Search = "RCP-LEGACY",
            ReceiptNumber = "LEGACY-PAID"
        });
        var item = Assert.Single(items);
        Assert.Equal(1, total);
        Assert.Equal("MPL-RCP-LEGACY-PAID", item.ReceiptNumber);

        var export = await harness.Query.ExportAsync(
            Harness.AdminId,
            new AdminOrderQuery { ReceiptNumber = "LEGACY-PAID" },
            "csv",
            null);
        Assert.Contains("MPL-RCP-LEGACY-PAID", Encoding.UTF8.GetString(export.Content));
    }

    [Fact]
    public async Task ConfirmPayment_RetriesAnExistingReceiptReference()
    {
        using var harness = await Harness.CreateAsync();
        var existing = await harness.Db.TagOrders
            .SingleAsync(order => order.OrderNumber == "MPL-ORD-PAID");
        existing.ReceiptNumber = "MPL-RCP-260717140000-4000";
        await harness.Db.SaveChangesAsync();
        var review = await harness.Db.TagOrders
            .SingleAsync(order => order.OrderNumber == "MPL-ORD-REVIEW");

        var confirmed = await harness.Admin.ConfirmPaymentAsync(Harness.AdminId, review.Id);

        Assert.Equal("MPL-RCP-260717140000-4001", confirmed.Order.ReceiptNumber);
        Assert.Equal(Harness.Now, confirmed.Order.PaymentConfirmedAt);
    }

    [Fact]
    public async Task ConfirmPayment_FailsSafelyWhenReceiptReferenceRetriesAreExhausted()
    {
        using var harness = await Harness.CreateAsync();
        var existing = await harness.Db.TagOrders
            .SingleAsync(order => order.OrderNumber == "MPL-ORD-PAID");
        existing.ReceiptNumber = "MPL-RCP-260717140000-4000";
        await harness.Db.SaveChangesAsync();
        var review = await harness.Db.TagOrders
            .SingleAsync(order => order.OrderNumber == "MPL-ORD-REVIEW");

        // The harness suffix source advances after 4000. Occupy every value it
        // can return, including its final repeated value.
        for (var suffix = 4001; suffix <= 4005; suffix++)
        {
            var collision = Harness.Order(
                $"MPL-ORD-COLLISION-{suffix}",
                OrderStatus.PaymentConfirmed,
                PaymentStatus.Confirmed,
                false);
            collision.ReceiptNumber = $"MPL-RCP-260717140000-{suffix}";
            harness.Db.TagOrders.Add(collision);
        }
        await harness.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.ConfirmPaymentAsync(Harness.AdminId, review.Id));

        Assert.Equal("receipt_number_generation_failed", error.Code);
        var unchanged = await harness.Db.TagOrders.AsNoTracking()
            .SingleAsync(order => order.Id == review.Id);
        Assert.Null(unchanged.ReceiptNumber);
        Assert.Null(unchanged.PaymentConfirmedAt);
        Assert.Equal(PaymentStatus.ProofSubmitted, unchanged.PaymentStatus);
    }

    [Fact]
    public async Task ProofIdReviewTargetsOnlyTheLatestPendingProofAndAuditsBothEntities()
    {
        using var harness = await Harness.CreateAsync();
        var order = await harness.Db.TagOrders.Include(item => item.PaymentProofs)
            .SingleAsync(item => item.OrderNumber == "MPL-ORD-REVIEW");
        var latest = order.PaymentProofs.Single();
        latest.UploadedAt = Harness.Now;
        var older = Harness.Proof();
        older.UploadedAt = Harness.Now.AddDays(-2);
        older.OrderId = order.Id;
        older.Order = order;
        harness.Db.MediaFiles.Add(older.MediaFile);
        harness.Db.PaymentProofs.Add(older);
        await harness.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ApiException>(() => harness.Admin.ApprovePaymentProofAsync(Harness.AdminId, older.Id));
        Assert.Equal(PaymentProofStatus.PendingReview, (await harness.Db.PaymentProofs.AsNoTracking().SingleAsync(item => item.Id == older.Id)).Status);

        var result = await harness.Admin.ApprovePaymentProofAsync(Harness.AdminId, latest.Id);
        Assert.Equal(PaymentStatus.Confirmed, result.Order.PaymentStatus);
        var storedLatest = await harness.Db.PaymentProofs.AsNoTracking().SingleAsync(item => item.Id == latest.Id);
        var storedOlder = await harness.Db.PaymentProofs.AsNoTracking().SingleAsync(item => item.Id == older.Id);
        Assert.Equal(PaymentProofStatus.Approved, storedLatest.Status);
        Assert.Equal(PaymentProofStatus.Superseded, storedOlder.Status);
        Assert.Equal((await harness.Db.AdminUsers.SingleAsync()).Id, storedLatest.ReviewedByAdminUserId);
        Assert.NotNull(storedLatest.ReviewedAt);
        var logs = await harness.Db.AuditLogs.ToListAsync();
        Assert.Contains(logs, log => log.Action == "payment-proof.approve" && log.EntityId == latest.Id);
        Assert.Contains(logs, log => log.Action == "order.confirm-payment" && log.EntityId == order.Id);
        await Assert.ThrowsAsync<ApiException>(() => harness.Admin.ApprovePaymentProofAsync(Harness.AdminId, latest.Id));
    }

    [Fact]
    public async Task FulfilmentTransitionsRejectInvalidStatesAndRequireAssignedTag()
    {
        using var harness = await Harness.CreateAsync();
        var pending = await harness.Db.TagOrders.SingleAsync(order => order.Status == OrderStatus.PendingPayment);
        await Assert.ThrowsAsync<ApiException>(() => harness.Admin.MarkOrderPreparingAsync(Harness.AdminId, pending.Id, "AA=="));

        var paid = await harness.Db.TagOrders.SingleAsync(order => order.OrderNumber == "MPL-ORD-PAID");
        await Assert.ThrowsAsync<ApiException>(() => harness.Admin.MarkOrderPreparingAsync(Harness.AdminId, paid.Id, "AA=="));
    }

    [Fact]
    public async Task ManualShipping_UsesValidatedForwardTransitionsServerTimeAndOneNotification()
    {
        using var harness = await Harness.CreateAsync();
        var preparing = await harness.Db.TagOrders
            .Include(order => order.SmartTag)
            .SingleAsync(order => order.Status == OrderStatus.PreparingTag);
        preparing.RowVersion = [1];
        await harness.Db.SaveChangesAsync();

        var ready = await harness.Admin.MarkOrderReadyToShipAsync(
            Harness.AdminId,
            preparing.Id,
            "AQ==");
        Assert.Equal(OrderStatus.ReadyToShip, ready.Order.Status);
        Assert.Equal(Harness.Now, ready.Order.ReadyToShipAt);

        var invalid = new MarkOrderShippedRequest("", null, "", null, null, "AQ==");
        var validation = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.MarkOrderShippedAsync(Harness.AdminId, preparing.Id, invalid));
        Assert.Equal("validation_failed", validation.Code);

        var request = new MarkOrderShippedRequest(
            "J&T Express",
            "Standard Delivery",
            "MY123456789",
            7.50m,
            "Leave at operations counter",
            "AQ==");
        var preShipment = await harness.Admin.UpdateShipmentDetailsAsync(
            Harness.AdminId,
            preparing.Id,
            new UpdateShipmentDetailsRequest(
                request.CourierProvider,
                request.CourierService,
                request.TrackingNumber,
                request.ActualCourierCost,
                request.ShippingNotes,
                request.RowVersion));
        Assert.Equal(OrderStatus.ReadyToShip, preShipment.Order.Status);
        Assert.Equal("J&T Express", preShipment.Order.CourierProvider);
        Assert.Equal("MY123456789", preShipment.Order.TrackingNumber);

        var shipped = await harness.Admin.MarkOrderShippedAsync(
            Harness.AdminId,
            preparing.Id,
            request);

        Assert.Equal(OrderStatus.Shipped, shipped.Order.Status);
        Assert.Equal(Harness.Now, shipped.Order.ShippedAt);
        Assert.Equal("J&T Express", shipped.Order.CourierProvider);
        Assert.Equal("Standard Delivery", shipped.Order.CourierService);
        Assert.Equal("MY123456789", shipped.Order.TrackingNumber);
        Assert.Equal(7.50m, shipped.Shipment.ActualCourierCost);
        Assert.Equal("Leave at operations counter", shipped.Shipment.ShippingNotes);
        Assert.DoesNotContain(
            "ActualCourierCost",
            System.Text.Json.JsonSerializer.Serialize(shipped.Order),
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "ShippingNotes",
            System.Text.Json.JsonSerializer.Serialize(shipped.Order),
            StringComparison.Ordinal);

        var repeated = await harness.Admin.MarkOrderShippedAsync(
            Harness.AdminId,
            preparing.Id,
            request);
        Assert.Equal(shipped.Order.ShippedAt, repeated.Order.ShippedAt);
        var email = Assert.Single(await harness.Db.EmailOutbox
            .Where(item => item.RelatedOrderId == preparing.Id
                           && item.MessageType == EmailMessageType.OrderShipped)
            .ToListAsync());
        Assert.Equal(EmailOutboxStatus.Suppressed, email.Status);

        var corrected = await harness.Admin.UpdateShipmentDetailsAsync(
            Harness.AdminId,
            preparing.Id,
            new UpdateShipmentDetailsRequest(
                "J&T Express",
                "Standard Delivery",
                "MY-CORRECTED-1",
                7.50m,
                "Leave at operations counter",
                "AQ=="));
        Assert.Equal("MY-CORRECTED-1", corrected.Order.TrackingNumber);
        Assert.Contains("MY-CORRECTED-1", email.TemplateDataJson, StringComparison.Ordinal);
        Assert.Equal(EmailOutboxStatus.Suppressed, email.Status);
        Assert.Single(await harness.Db.EmailOutbox
            .Where(item => item.RelatedOrderId == preparing.Id
                           && item.MessageType == EmailMessageType.OrderShipped)
            .ToListAsync());

        email.Status = EmailOutboxStatus.Pending;
        email.AttemptCount = 2;
        await harness.Db.SaveChangesAsync();
        await harness.Admin.UpdateShipmentDetailsAsync(
            Harness.AdminId,
            preparing.Id,
            new UpdateShipmentDetailsRequest(
                "J&T Express",
                "Standard Delivery",
                "MY-CORRECTED-2",
                7.50m,
                "Leave at operations counter",
                "AQ=="));
        Assert.Contains("MY-CORRECTED-2", email.TemplateDataJson, StringComparison.Ordinal);
        Assert.Equal(EmailOutboxStatus.Pending, email.Status);
        Assert.Equal(2, email.AttemptCount);

        email.Status = EmailOutboxStatus.Sending;
        await harness.Db.SaveChangesAsync();
        var claimedSnapshot = email.TemplateDataJson;
        await harness.Admin.UpdateShipmentDetailsAsync(
            Harness.AdminId,
            preparing.Id,
            new UpdateShipmentDetailsRequest(
                "J&T Express", "Standard Delivery", "MY-CORRECTED-3", 7.50m,
                "Leave at operations counter", "AQ=="));
        Assert.Equal(claimedSnapshot, email.TemplateDataJson);
        Assert.Equal(EmailOutboxStatus.Sending, email.Status);

        email.Status = EmailOutboxStatus.Sent;
        await harness.Db.SaveChangesAsync();
        var sentSnapshot = email.TemplateDataJson;
        await harness.Admin.UpdateShipmentDetailsAsync(
            Harness.AdminId,
            preparing.Id,
            new UpdateShipmentDetailsRequest(
                "J&T Express", "Standard Delivery", "MY-CORRECTED-4", 7.50m,
                "Leave at operations counter", "AQ=="));
        Assert.Equal(sentSnapshot, email.TemplateDataJson);
        Assert.Equal(EmailOutboxStatus.Sent, email.Status);

        var delivered = await harness.Admin.MarkOrderDeliveredAsync(
            Harness.AdminId,
            preparing.Id,
            "AQ==");
        Assert.Equal(OrderStatus.Delivered, delivered.Order.Status);
        Assert.Equal(Harness.Now, delivered.Order.DeliveredAt);
        Assert.Contains(
            await harness.Db.AuditLogs.ToListAsync(),
            log => log.Action == "order.mark-ready-to-ship");
        Assert.Contains(
            await harness.Db.AuditLogs.ToListAsync(),
            log => log.Action == "order.update-shipment" || log.Action == "order.mark-shipped");
    }

    [Fact]
    public async Task ManualShipping_RejectsStaleRowVersionAndNegativeCourierCost()
    {
        using var harness = await Harness.CreateAsync();
        var preparing = await harness.Db.TagOrders
            .SingleAsync(order => order.Status == OrderStatus.PreparingTag);
        preparing.RowVersion = [5];
        await harness.Db.SaveChangesAsync();

        var conflict = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.MarkOrderReadyToShipAsync(Harness.AdminId, preparing.Id, "AQ=="));
        Assert.Equal("concurrency_conflict", conflict.Code);

        var invalid = new UpdateShipmentDetailsRequest(
            "Pos Laju",
            null,
            "PL123",
            -0.01m,
            null,
            "BQ==");
        var validation = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.UpdateShipmentDetailsAsync(Harness.AdminId, preparing.Id, invalid));
        Assert.Equal("validation_failed", validation.Code);
    }

    [Fact]
    public async Task CancellingUnshippedOrderRequiresReasonAndReturnsAssignedTagToInventory()
    {
        using var harness = await Harness.CreateAsync();
        var preparing = await harness.Db.TagOrders.Include(order => order.SmartTag)
            .SingleAsync(order => order.Status == OrderStatus.PreparingTag);
        var tagId = preparing.SmartTagId!.Value;

        await Assert.ThrowsAsync<ApiException>(() => harness.Admin.CancelOrderAsync(Harness.AdminId, preparing.Id, ""));
        var cancelled = await harness.Admin.CancelOrderAsync(Harness.AdminId, preparing.Id, "Customer requested cancellation");

        Assert.Equal(OrderStatus.Cancelled, cancelled.Order.Status);
        Assert.Null(cancelled.Order.SmartTagId);
        var tag = await harness.Db.SmartTags.FindAsync(tagId);
        Assert.NotNull(tag);
        Assert.Equal(SmartTagStatus.Unclaimed, tag!.Status);
        Assert.Null(tag.OwnerUserId);
        Assert.Null(tag.PetId);
        Assert.Null(tag.OrderId);
        Assert.Contains(await harness.Db.AuditLogs.ToListAsync(), log => log.Action == "tag.unassign-from-cancelled-order");
    }

    private sealed class Harness : IDisposable
    {
        public static readonly Guid AdminId = Guid.Parse("81111111-1111-1111-1111-111111111111");
        public static readonly Guid OwnerId = Guid.Parse("82222222-2222-2222-2222-222222222222");
        public static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-17T06:00:00Z");
        private static readonly Guid PetId = Guid.Parse("83333333-3333-3333-3333-333333333333");

        public MyPetLinkDbContext Db { get; }
        public AdminOrderQueryService Query { get; }
        public AdminPaymentProofQueryService PaymentProofQuery { get; }
        public AdminService Admin { get; }

        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            var audit = new AuditLogService(db, new HttpContextAccessor());
            var clock = new FixedTimeProvider(Now);
            Query = new AdminOrderQueryService(db, audit);
            PaymentProofQuery = new AdminPaymentProofQueryService(db, audit);
            Admin = new AdminService(
                db,
                audit,
                Options.Create(new FeatureOptions()),
                new EmailOutboxService(
                    db,
                    audit,
                    clock,
                    new EmailTemplateGate(db, Options.Create(new EmailOptions()))),
                new BusinessReferenceGenerator(
                    new SequenceBusinessReferenceSuffixSource(
                        4000, 4001, 4002, 4003, 4004, 4005)),
                clock);
        }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
                new FixedTimeProvider(Now));
            var admin = new User
            {
                Id = AdminId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true }
            };
            var owner = new User
            {
                Id = OwnerId,
                Email = "aina@example.com",
                NormalizedEmail = "AINA@EXAMPLE.COM",
                DisplayName = "Aina Owner",
                Status = UserStatus.Active
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerId,
                OwnerUser = owner,
                Slug = "topu-code",
                Name = "Topu",
                Species = "Cat",
                LifecycleStatus = PetLifecycleStatus.Active
            };

            var orders = new[]
            {
                Order("MPL-ORD-PENDING", OrderStatus.PendingPayment, PaymentStatus.Pending, false),
                Order("MPL-ORD-REVIEW", OrderStatus.PaymentProofSubmitted, PaymentStatus.ProofSubmitted, false),
                Order("MPL-ORD-PAID", OrderStatus.PaymentConfirmed, PaymentStatus.Confirmed, true),
                Order("MPL-ORD-PREPARING", OrderStatus.PreparingTag, PaymentStatus.Confirmed, true),
                Order("MPL-ORD-SHIPPED", OrderStatus.Shipped, PaymentStatus.Confirmed, true),
                Order("MPL-ORD-DELIVERED", OrderStatus.Delivered, PaymentStatus.Confirmed, false),
                Order("MPL-ORD-CANCELLED", OrderStatus.Cancelled, PaymentStatus.Pending, false),
            };
            orders[1].PaymentProofs.Add(Proof());

            var preparingTag = new SmartTag
            {
                Id = Guid.NewGuid(), TagCode = "MPL-PREP-0001", HasNfc = true,
                Variant = TagVariants.Standard, Status = SmartTagStatus.Preparing,
                OwnerUserId = OwnerId, OwnerUser = owner, PetId = PetId, Pet = pet,
                OrderId = orders[3].Id, Order = orders[3]
            };
            orders[3].SmartTagId = preparingTag.Id;
            orders[3].SmartTag = preparingTag;

            db.Users.AddRange(admin, owner);
            db.Pets.Add(pet);
            db.TagOrders.AddRange(orders);
            db.SmartTags.Add(preparingTag);
            await db.SaveChangesAsync();
            return new Harness(db);
        }

        public static TagOrder Order(string number, OrderStatus status, PaymentStatus payment, bool nfc)
        {
            var index = Math.Abs(number.GetHashCode()) % 20;
            return new TagOrder
            {
                Id = Guid.NewGuid(),
                OrderNumber = number,
                OwnerUserId = OwnerId,
                PetId = PetId,
                TagType = nfc ? TagType.QrNfcSmartTag : TagType.QrPetTag,
                Variant = TagVariants.Standard,
                Amount = nfc ? 59m : 39m,
                Currency = "MYR",
                DeliveryFee = 8m,
                Status = status,
                PaymentStatus = payment,
                PaymentConfirmedAt = payment == PaymentStatus.Confirmed ? Now.AddDays(-5) : null,
                ReceiptNumber = payment == PaymentStatus.Confirmed
                    ? number.Replace("-ORD-", "-RCP-", StringComparison.OrdinalIgnoreCase)
                    : null,
                RecipientName = "Aina Owner",
                DeliveryPhoneE164 = "+60123456789",
                AddressLine1 = "1 Jalan Ampang",
                Postcode = "50450",
                City = "Kuala Lumpur",
                State = "Kuala Lumpur",
                TrackingNumber = status is OrderStatus.Shipped or OrderStatus.Delivered ? $"TRK-{index}" : null,
                ShippedAt = status is OrderStatus.Shipped or OrderStatus.Delivered ? Now.AddDays(-2) : null,
                DeliveredAt = status == OrderStatus.Delivered ? Now.AddDays(-1) : null,
                CancelledAt = status == OrderStatus.Cancelled ? Now.AddDays(-1) : null,
                CreatedAt = Now.AddDays(-index),
                UpdatedAt = Now.AddDays(-index)
            };
        }

        public static PaymentProof Proof()
        {
            var mediaId = Guid.NewGuid();
            var media = new MediaFile
            {
                Id = mediaId,
                OwnerUserId = OwnerId,
                OriginalFileName = "payment.jpg",
                StorageFileName = "payment.jpg",
                ContentType = "image/jpeg",
                FileSize = 1024,
                StorageProvider = "CloudflareR2",
                StoragePath = "private/payment.jpg",
                BucketName = "private-test",
                ObjectKey = $"orders/{mediaId:N}/payment.jpg",
                Category = MediaUploadCategory.OrderReceipt,
                MediaType = MediaFileType.Document,
                IsPublic = false,
                UploadStatus = MediaUploadStatus.Ready,
                Sha256 = "abc",
                CreatedAt = Now.AddDays(-4),
                UploadedAt = Now.AddDays(-4),
                CompletedAt = Now.AddDays(-4)
            };
            return new PaymentProof
            {
            Id = Guid.NewGuid(),
            MediaFileId = mediaId,
            MediaFile = media,
            OriginalFileName = "payment.jpg",
            StorageFileName = "payment.jpg",
            ContentType = "image/jpeg",
            FileSize = 1024,
            StorageProvider = "CloudflareR2",
            StoragePath = "private/payment.jpg",
            Sha256 = "abc",
            UploadedAt = Now.AddDays(-4),
            PaymentMethod = "QR Payment",
            SubmittedAmount = 46m,
            PaymentReference = "REF-ORDER-123",
            Status = PaymentProofStatus.PendingReview
            };
        }

        public void Dispose() => Db.Dispose();
    }
}
