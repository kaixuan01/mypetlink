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
