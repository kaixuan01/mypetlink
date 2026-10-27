using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

public sealed class DirectRetailCommissionRelationalTests
{
    private static readonly DateTimeOffset Now =
        DateTimeOffset.Parse("2026-09-08T00:00:00Z");
    private static readonly Guid AdminUserId =
        Guid.Parse("d1000000-0000-0000-0000-000000000001");

    [RelationalFact]
    public async Task ConcurrentPaymentApprovalCreatesExactlyOneRetailCommission()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid orderId;
        await using (var seed = scope.NewContext())
        {
            orderId = await SeedAsync(seed);
        }

        using var gate = new SemaphoreSlim(0, 2);
        async Task<bool> TryApproveAsync()
        {
            await using var db = scope.NewContext();
            var service = Admin(db);
            await gate.WaitAsync();
            try
            {
                await service.ConfirmPaymentAsync(AdminUserId, orderId);
                return true;
            }
            catch (Exception exception) when (
                exception is ApiException or DbUpdateException or InvalidOperationException)
            {
                return false;
            }
        }

        var first = TryApproveAsync();
        var second = TryApproveAsync();
        gate.Release(2);
        var results = await Task.WhenAll(first, second);

        Assert.Single(results, value => value);
        await using var verify = scope.NewContext();
        Assert.Single(await verify.SalesCommissions.Where(item =>
            item.TagOrderId == orderId
            && item.CommissionType == SalesCommissionType.DirectRetailPercentage
            && item.Status != SalesCommissionStatus.Reversed).ToListAsync());
        Assert.Single(await verify.PaymentProofs.Where(item =>
            item.OrderId == orderId && item.Status == PaymentProofStatus.Approved).ToListAsync());
        var storedOrder = await verify.TagOrders.SingleAsync(item => item.Id == orderId);
        Assert.Equal(PaymentStatus.Confirmed, storedOrder.PaymentStatus);
    }

    [RelationalFact]
    public async Task CancellingAnOrderWhoseCommissionIsInAPreparedPayoutIsRefusedUntilThePayoutIsCancelled()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var orderId = await SeedAsync(db);
        var identity = await db.BusinessIdentitySettings.SingleAsync(item => item.Id == BusinessIdentityService.SettingsId);
        identity.LegalBusinessName = "GBB Software Solutions"; identity.BusinessRegistrationNumber = "AS0515813-P";
        identity.RegisteredAddressLine1 = "12 Jalan Teknologi"; identity.RegisteredPostcode = "57000"; identity.RegisteredCity = "Kuala Lumpur";
        identity.RegisteredState = "Kuala Lumpur"; identity.RegisteredCountry = "Malaysia"; identity.SupportEmail = "support@mypetlink.com.my";
        await db.SaveChangesAsync();
        await Admin(db).ConfirmPaymentAsync(AdminUserId, orderId);
        var commission = await db.SalesCommissions.AsNoTracking().SingleAsync();
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var clock = new FixedTimeProvider(Now);
        var payouts = new CommissionPayoutService(db, new DocumentNumberService(db), new BusinessIdentityService(db, audit, clock), audit, clock);
        var prepared = await payouts.PrepareAsync(AdminUserId, new([commission.Id], commission.SalespersonId,
            Now.AddDays(-1), Now.AddDays(1), commission.CommissionAmount, "retail-cancel-guard"));

        // The reserved commission makes the cancellation refuse as a whole: the order, its tags and the payout are unchanged.
        var refused = await Assert.ThrowsAsync<ApiException>(() => Admin(db).CancelOrderAsync(AdminUserId, orderId, "Customer changed their mind"));
        Assert.Equal(("commission_reserved_for_payout", 409), (refused.Code, refused.StatusCode));
        Assert.Contains(prepared.Summary.PayoutNumber, refused.Message);
        db.ChangeTracker.Clear();
        Assert.NotEqual(OrderStatus.Cancelled, (await db.TagOrders.AsNoTracking().SingleAsync(item => item.Id == orderId)).Status);
        Assert.Equal(SalesCommissionStatus.Payable, (await db.SalesCommissions.AsNoTracking().SingleAsync()).Status);
        var stillPrepared = await payouts.GetAsync(prepared.Summary.Id);
        Assert.Equal("Prepared", stillPrepared.Summary.Status);

        await payouts.CancelAsync(AdminUserId, prepared.Summary.Id, new(stillPrepared.Summary.ConcurrencyToken, "Order is being cancelled"));
        await Admin(db).CancelOrderAsync(AdminUserId, orderId, "Customer changed their mind");
        db.ChangeTracker.Clear();
        var reversed = await db.SalesCommissions.AsNoTracking().SingleAsync();
        Assert.Equal(SalesCommissionStatus.Reversed, reversed.Status);
        Assert.Equal(OrderStatus.Cancelled, (await db.TagOrders.AsNoTracking().SingleAsync(item => item.Id == orderId)).Status);
    }

    [RelationalFact]
    public async Task CancellingAnOrderWaitsForAPayoutHoldingItsCommissionAndDecidesOnThePayoutsResult()
    {
        // A payout holds exactly the row lock it takes before reserving or paying commission, and
        // records the commission paid. The cancellation must wait for that lock and decide (and
        // audit) from the committed row, not from a read that slipped past the lock through an index.
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid orderId, commissionId;
        await using (var db = scope.NewContext())
        {
            orderId = await SeedAsync(db);
            await Admin(db).ConfirmPaymentAsync(AdminUserId, orderId);
            commissionId = (await db.SalesCommissions.AsNoTracking().SingleAsync()).Id;
        }
        await using var payoutSide = scope.NewContext();
        await using (var tx = await payoutSide.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable))
        {
            await payoutSide.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM [SalesCommissions] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {commissionId}");
            await using var cancelSide = scope.NewContext();
            var cancel = Admin(cancelSide).CancelOrderAsync(AdminUserId, orderId, "Customer changed their mind");
            var finishedWhileLocked = await Task.WhenAny(cancel, Task.Delay(TimeSpan.FromSeconds(4))) == cancel;
            await payoutSide.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE [SalesCommissions] SET [Status] = 'Paid', [PaidAt] = SYSDATETIMEOFFSET() WHERE [Id] = {commissionId}");
            await tx.CommitAsync();
            Assert.False(finishedWhileLocked, "The cancellation finished while a payout held the commission row.");
            await cancel;
        }
        await using var check = scope.NewContext();
        var reversal = await check.AuditLogs.AsNoTracking().SingleAsync(item => item.Action == "sales-commission.reversed" && item.EntityId == commissionId);
        Assert.Contains("\"status\":\"Paid\"", reversal.OldValue);
    }

    private static async Task<Guid> SeedAsync(MyPetLinkDbContext db)
    {
        var admin = new User
        {
            Id = AdminUserId,
            Email = "finance@example.com",
            NormalizedEmail = "FINANCE@EXAMPLE.COM",
            DisplayName = "Finance Admin",
            AdminUser = new AdminUser
            {
                UserId = AdminUserId,
                Role = AdminRole.Admin,
                IsActive = true
            }
        };
        var owner = new User
        {
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Retail Owner"
        };
        var pet = new Pet
        {
            OwnerUserId = owner.Id,
            Name = "Milo",
            Species = "Cat",
            Slug = "milo-direct-relational"
        };
        var salesperson = new Salesperson
        {
            SalespersonCode = "SP-DIRECT-REL",
            Name = "Direct Seller"
        };
        var order = new TagOrder
        {
            OrderNumber = "MPL-ORD-DIRECT-REL",
            OwnerUserId = owner.Id,
            PetId = pet.Id,
            SalespersonId = salesperson.Id,
            SalespersonCodeSnapshot = salesperson.SalespersonCode,
            SalespersonNameSnapshot = salesperson.Name,
            Amount = 89.70m,
            TotalAmount = 97.70m,
            DeliveryFee = 8m,
            Currency = "MYR",
            Status = OrderStatus.PaymentProofSubmitted,
            PaymentStatus = PaymentStatus.ProofSubmitted,
            RecipientName = owner.DisplayName,
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Test",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur"
        };
        order.Items.Add(new TagOrderItem
        {
            Order = order,
            SkuSnapshot = "TAG-NFC",
            ProductNameSnapshot = "QR + NFC Smart Tag",
            VariantNameSnapshot = "Standard",
            UnitBasePrice = 29.90m,
            Quantity = 3,
            Subtotal = 89.70m,
            FinalUnitPrice = 29.90m,
            FinalAmount = 89.70m,
            Currency = "MYR"
        });
        var media = new MediaFile
        {
            OwnerUserId = owner.Id,
            OriginalFileName = "proof.jpg",
            StorageFileName = "proof.jpg",
            ContentType = "image/jpeg",
            FileSize = 100,
            StorageProvider = "CloudflareR2",
            StoragePath = "private/proof.jpg",
            BucketName = "private",
            ObjectKey = "proof.jpg",
            Category = MediaUploadCategory.OrderReceipt,
            MediaType = MediaFileType.Document,
            UploadStatus = MediaUploadStatus.Ready,
            Sha256 = "abc"
        };
        order.PaymentProofs.Add(new PaymentProof
        {
            Order = order,
            MediaFile = media,
            MediaFileId = media.Id,
            OriginalFileName = media.OriginalFileName,
            StorageFileName = media.StorageFileName,
            ContentType = media.ContentType,
            FileSize = media.FileSize,
            StorageProvider = media.StorageProvider,
            StoragePath = media.StoragePath,
            Sha256 = media.Sha256,
            Status = PaymentProofStatus.PendingReview,
            UploadedAt = Now
        });

        db.AddRange(admin, owner, pet, salesperson, order, media);
        await db.SaveChangesAsync();
        return order.Id;
    }

    private static AdminService Admin(MyPetLinkDbContext db)
    {
        var clock = new FixedTimeProvider(Now);
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new AdminService(
            db,
            audit,
            Options.Create(new FeatureOptions()),
            new EmailOutboxService(
                db,
                audit,
                clock,
                new EmailTemplateGate(db, Options.Create(new EmailOptions()))),
            new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
            clock);
    }
}
