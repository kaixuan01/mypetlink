using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using UglyToad.PdfPig;

namespace MyPetLink.Api.Tests;

// QuestPDF reads its license from a global static that Program.cs sets at API
// startup. Tests never run Program, so declare the same free Community tier once
// when the test assembly loads.
internal static class OrderDocumentTestModuleInitializer
{
    [System.Runtime.CompilerServices.ModuleInitializer]
    public static void Init()
    {
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;
    }
}

// Covers the customer-facing Order Summary and Official Receipt PDFs: document
// availability, ownership, immutable-snapshot behaviour, capability-aware
// wording, discounts, and that nothing internal leaks. Assertions render the
// real PDF and read its text rather than inspecting internal DTOs.
public sealed class OrderDocumentServiceTests
{
    // --- Availability -----------------------------------------------------

    [Fact]
    public async Task Summary_IsAvailableBeforePaymentConfirmation()
    {
        using var h = await Harness.CreateAsync();
        var result = await h.Service.GetOwnerSummaryAsync(Harness.OwnerAId, "MPL-ORD-PENDING");

        var text = ExtractText(result.Content);
        Assert.Contains("Order Summary", text);
        Assert.Contains(Squash("not an official receipt"), Squash(text), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Receipt_IsUnavailableBeforePaymentConfirmation()
    {
        using var h = await Harness.CreateAsync();
        var ex = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-PENDING"));

        Assert.Equal(StatusCodes.Status422UnprocessableEntity, ex.StatusCode);
        Assert.Equal("receipt_not_available", ex.Code);
    }

    [Fact]
    public async Task Receipt_BecomesAvailableAfterPaymentConfirmation()
    {
        using var h = await Harness.CreateAsync();
        var result = await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC");

        Assert.Equal("application/pdf", result.ContentType);
        Assert.Equal("MyPetLink-Receipt-MPL-ORD-NFC.pdf", result.FileName);
        Assert.Contains("Official Receipt", ExtractText(result.Content));
    }

    // --- Authorization ----------------------------------------------------

    [Fact]
    public async Task Owner_CanDownloadTheirOwnSummaryAndReceipt()
    {
        using var h = await Harness.CreateAsync();

        var summary = await h.Service.GetOwnerSummaryAsync(Harness.OwnerAId, "MPL-ORD-NFC");
        var receipt = await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC");

        Assert.NotEmpty(summary.Content);
        Assert.NotEmpty(receipt.Content);
    }

    [Fact]
    public async Task AnotherOwner_ReceivesPrivacyPreservingNotFound()
    {
        using var h = await Harness.CreateAsync();

        var ex = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.GetOwnerReceiptAsync(Harness.OwnerBId, "MPL-ORD-NFC"));

        Assert.Equal(StatusCodes.Status404NotFound, ex.StatusCode);
        Assert.Equal("not_found", ex.Code);
    }

    [Fact]
    public async Task OtherOwner_IsRejectedBeforeReceiptAvailabilityIsRevealed()
    {
        // Ownership must be checked before the confirmed/unconfirmed state, so a
        // stranger cannot even learn that an unpaid order exists.
        using var h = await Harness.CreateAsync();

        var ex = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.GetOwnerReceiptAsync(Harness.OwnerBId, "MPL-ORD-PENDING"));

        Assert.Equal(StatusCodes.Status404NotFound, ex.StatusCode);
    }

    [Fact]
    public async Task AnonymousRequest_IsUnauthorized()
    {
        using var h = await Harness.CreateAsync();

        var ex = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.GetOwnerReceiptAsync(null, "MPL-ORD-NFC"));

        Assert.Equal(StatusCodes.Status401Unauthorized, ex.StatusCode);
    }

    [Fact]
    public async Task Admin_CanDownloadTheAuthorizedDocumentByOrderId()
    {
        // Admin endpoints are gated by the Admin authorization policy at the
        // controller; the service resolves the order by id for any owner.
        using var h = await Harness.CreateAsync();
        var orderId = await h.OrderIdAsync("MPL-ORD-NFC");

        var receipt = await h.Service.GetAdminReceiptAsync(orderId);

        Assert.Equal("MyPetLink-Receipt-MPL-ORD-NFC.pdf", receipt.FileName);
        Assert.Contains("Official Receipt", ExtractText(receipt.Content));
    }

    [Fact]
    public async Task OwnerAndAdminEndpoints_ProduceTheSameCanonicalDocument()
    {
        using var h = await Harness.CreateAsync();
        var orderId = await h.OrderIdAsync("MPL-ORD-NFC");

        var owner = await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC");
        var admin = await h.Service.GetAdminReceiptAsync(orderId);

        Assert.Equal(ExtractText(owner.Content), ExtractText(admin.Content));
    }

    // --- Content ----------------------------------------------------------

    [Fact]
    public async Task Receipt_ShowsStableNumberOrderNumberTotalDateAndPaidStatus()
    {
        using var h = await Harness.CreateAsync();

        var first = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC")).Content);
        var second = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC")).Content);

        Assert.Contains("MPL-RCP-NFC", Squash(first));       // receipt number derived from order number
        Assert.Contains("MPL-ORD-NFC", first);               // order number present
        Assert.Contains("RM59.00", Squash(first));           // total correct
        Assert.Contains("2026", first);                      // confirmation date present
        Assert.Contains("Paid", first, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(Squash(first), Squash(second));         // number/totals stable across downloads
    }

    [Fact]
    public async Task Receipt_EmbedsGraphicalLogoAndDeliverySnapshot()
    {
        using var h = await Harness.CreateAsync();
        var result = await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC");
        var text = Squash(ExtractText(result.Content));
        using var pdf = PdfDocument.Open(result.Content);

        Assert.Contains("Delivery", text);
        Assert.Contains("StandardDelivery", text);
        Assert.Contains("KualaLumpur", text);
        Assert.Contains("50000", text);
        Assert.Contains("PaymentReference", text);
        Assert.DoesNotContain("TransactionID", text);
        Assert.True(pdf.GetPages().SelectMany(page => page.GetImages()).Any());
    }

    [Fact]
    public async Task QrOnlyDocument_UsesQrOnlyDisclaimerAndNoNfcWording()
    {
        using var h = await Harness.CreateAsync();
        var text = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-QR")).Content);

        Assert.Contains(
            Squash("MyPetLink QR Pet Tags do not provide GPS tracking or real-time location monitoring"),
            Squash(text));
        Assert.DoesNotContain("NFC", text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task QrNfcDocument_UsesQrNfcDisclaimer()
    {
        using var h = await Harness.CreateAsync();
        var text = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC")).Content);

        Assert.Contains(
            Squash("MyPetLink QR + NFC Pet Tags do not provide GPS tracking or real-time location monitoring"),
            Squash(text));
    }

    [Fact]
    public async Task Receipt_DoesNotLeakProofPathReviewerOrInternalIds()
    {
        using var h = await Harness.CreateAsync();
        var text = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC")).Content);
        var squashed = Squash(text);

        Assert.DoesNotContain("private/secret-proof", squashed, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Harness.ReviewerAdminId.ToString("N"), squashed, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Harness.ReviewerAdminId.ToString(), text, StringComparison.OrdinalIgnoreCase);
        var orderId = (await h.OrderIdAsync("MPL-ORD-NFC")).ToString("N");
        Assert.DoesNotContain(orderId, squashed, StringComparison.OrdinalIgnoreCase);
    }

    // --- Discounts --------------------------------------------------------

    [Fact]
    public async Task DiscountedReceipt_ShowsSubtotalDiscountAndFinalTotal()
    {
        using var h = await Harness.CreateAsync();
        var text = Squash(ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-QR")).Content));

        Assert.Contains("RM25.00", text);      // original subtotal
        Assert.Contains("-RM5.00", text);      // discount
        Assert.Contains("RM20.00", text);      // final total
        Assert.Contains("LaunchDiscount", text); // promotion name from the snapshot
    }

    [Fact]
    public async Task MultiUnitOrder_RendersQuantityAndLineTotalFromSnapshot()
    {
        using var h = await Harness.CreateAsync();
        var text = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-QTY")).Content);

        Assert.Contains("RM40.00", Squash(text)); // 2 x RM20.00
        Assert.Contains("2", text);               // quantity column
    }

    // --- Historical snapshot behaviour ------------------------------------

    [Fact]
    public async Task CatalogEdits_DoNotChangeAnExistingReceipt()
    {
        using var h = await Harness.CreateAsync();
        var before = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-QR")).Content);

        // Mutate the current catalog SKU that the order was bought from.
        var variant = await h.Db.TagProductVariants.SingleAsync(v => v.Sku == "SKU-QR-ONLY");
        variant.BasePrice = 999m;
        variant.SupportsNfc = true;
        variant.DisplayName = "Totally Different NFC SKU";
        variant.TagVariant = "Standard";
        await h.Db.SaveChangesAsync();

        var after = ExtractText((await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-QR")).Content);

        Assert.Equal(Squash(before), Squash(after));
        Assert.Contains("RM20.00", Squash(after));           // snapshot price, not 999
        Assert.DoesNotContain("NFC", after, StringComparison.OrdinalIgnoreCase); // snapshot capability
    }

    [Fact]
    public async Task ReceiptDownload_DoesNotWriteToTheDatabase()
    {
        using var h = await Harness.CreateAsync();

        await h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-NFC");

        // The service reads with AsNoTracking, so its context tracks nothing and
        // has no pending writes.
        Assert.Empty(h.ServiceDb.ChangeTracker.Entries());
        Assert.False(h.ServiceDb.ChangeTracker.HasChanges());
    }

    // --- Defensive guards -------------------------------------------------

    [Fact]
    public async Task Order_WithInvalidItemQuantity_FailsClearly()
    {
        using var h = await Harness.CreateAsync();

        var ex = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-BADQTY"));

        Assert.Equal(StatusCodes.Status500InternalServerError, ex.StatusCode);
        Assert.Equal("order_document_unavailable", ex.Code);
    }

    [Fact]
    public async Task Order_WhereItemsDoNotReconcileWithAmount_FailsClearly()
    {
        using var h = await Harness.CreateAsync();

        var ex = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.GetOwnerReceiptAsync(Harness.OwnerAId, "MPL-ORD-MISMATCH"));

        Assert.Equal("order_document_unavailable", ex.Code);
    }

    // --- Helpers ----------------------------------------------------------

    private static string ExtractText(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        var builder = new StringBuilder();
        foreach (var page in document.GetPages())
        {
            builder.AppendLine(page.Text);
        }

        return builder.ToString();
    }

    // PdfPig can drop the spaces between glyph runs, so compare against a
    // whitespace-free form for content that includes spacing.
    private static string Squash(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (!char.IsWhiteSpace(ch))
            {
                builder.Append(ch);
            }
        }

        return builder.ToString();
    }

    private sealed class Harness : IDisposable
    {
        public static readonly Guid OwnerAId = Guid.Parse("70d5b712-2f8d-484b-8963-738c25b6abd3");
        public static readonly Guid OwnerBId = Guid.Parse("b2937cd3-2b93-412c-9d81-a5630f01fb61");
        public static readonly Guid ReviewerAdminId = Guid.Parse("b1ead540-f6cc-4083-bc8e-63b26b022342");
        private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-20T02:30:00Z");
        private static readonly Guid PetId = Guid.Parse("83333333-3333-3333-3333-333333333333");

        // One shared root keeps EF's internal service provider stable across all
        // harness instances (a fresh root per harness would build a new provider
        // each time and trip ManyServiceProvidersCreatedWarning). A unique
        // database name per harness still isolates each test's data.
        private static readonly InMemoryDatabaseRoot SharedRoot = new();

        private readonly List<MyPetLinkDbContext> _contexts = new();
        private readonly string _databaseName = $"order-document-tests-{Guid.NewGuid():N}";

        public MyPetLinkDbContext Db { get; }
        public MyPetLinkDbContext ServiceDb { get; }
        public OrderDocumentService Service { get; }

        private Harness()
        {
            Db = NewContext();
            ServiceDb = NewContext();
            Service = new OrderDocumentService(ServiceDb);
        }

        private MyPetLinkDbContext NewContext()
        {
            var context = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(_databaseName, SharedRoot)
                .Options);
            _contexts.Add(context);
            return context;
        }

        public async Task<Guid> OrderIdAsync(string orderNumber)
        {
            return await Db.TagOrders.Where(o => o.OrderNumber == orderNumber).Select(o => o.Id).SingleAsync();
        }

        public static async Task<Harness> CreateAsync()
        {
            var harness = new Harness();
            var db = harness.Db;

            var ownerA = new User
            {
                Id = OwnerAId,
                Email = "owner.a@example.com",
                NormalizedEmail = "OWNER.A@EXAMPLE.COM",
                DisplayName = "Owner A",
                Status = UserStatus.Active
            };
            var ownerB = new User
            {
                Id = OwnerBId,
                Email = "owner.b@example.com",
                NormalizedEmail = "OWNER.B@EXAMPLE.COM",
                DisplayName = "Owner B",
                Status = UserStatus.Active
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerAId,
                OwnerUser = ownerA,
                Slug = "buddy-code",
                Name = "Buddy",
                Species = "Dog",
                LifecycleStatus = PetLifecycleStatus.Active
            };

            var qrOnlyVariant = new TagProductVariant
            {
                Id = Guid.NewGuid(),
                Sku = "SKU-QR-ONLY",
                PublicKey = "pk-qr-only",
                DisplayName = "QR Pet Tag - Lightweight",
                SupportsQr = true,
                SupportsNfc = false,
                TagVariant = "Lightweight",
                BasePrice = 25m,
                Currency = "MYR"
            };
            db.Users.AddRange(ownerA, ownerB);
            db.Pets.Add(pet);
            db.TagProductVariants.Add(qrOnlyVariant);

            // Legacy QR + NFC confirmed order (no item snapshot rows).
            var nfc = ConfirmedOrder("MPL-ORD-NFC", TagType.QrNfcSmartTag, 59m);
            nfc.PaymentProofs.Add(Proof());

            // QR-only confirmed order with a launch discount, from an item snapshot.
            var qr = ConfirmedOrder("MPL-ORD-QR", TagType.QrPetTag, 20m);
            qr.Items.Add(new TagOrderItem
            {
                OrderId = qr.Id,
                ProductVariantId = qrOnlyVariant.Id,
                SkuSnapshot = "SKU-QR-ONLY",
                ProductNameSnapshot = "MyPetLink QR Pet Tag",
                VariantNameSnapshot = "QR Pet Tag - Lightweight",
                SupportsQrSnapshot = true,
                SupportsNfcSnapshot = false,
                UnitBasePrice = 25m,
                Quantity = 1,
                Subtotal = 25m,
                PromotionNameSnapshot = "Launch Discount",
                DiscountAmount = 5m,
                FinalUnitPrice = 20m,
                FinalAmount = 20m,
                Currency = "MYR"
            });

            // QR + NFC confirmed order with an item snapshot (no discount).
            var nfcItem = ConfirmedOrder("MPL-ORD-NFC-ITEM", TagType.QrNfcSmartTag, 59m);
            nfcItem.Items.Add(SimpleItem(nfcItem.Id, nfc: true, unit: 59m, qty: 1, final: 59m));

            // Multi-unit order to exercise the quantity path.
            var qty = ConfirmedOrder("MPL-ORD-QTY", TagType.QrPetTag, 40m);
            qty.Items.Add(SimpleItem(qty.Id, nfc: false, unit: 20m, qty: 2, final: 40m));

            // Pending order (receipt must be unavailable).
            var pending = new TagOrder
            {
                Id = Guid.NewGuid(),
                OrderNumber = "MPL-ORD-PENDING",
                OwnerUserId = OwnerAId,
                PetId = PetId,
                TagType = TagType.QrPetTag,
                Variant = "Lightweight",
                Amount = 19.90m,
                Currency = "MYR",
                DeliveryFee = 0m,
                Status = OrderStatus.PendingPayment,
                PaymentStatus = PaymentStatus.Pending,
                RecipientName = "Owner A",
                DeliveryPhoneE164 = "+60123456789",
                AddressLine1 = "1 Jalan Test",
                Postcode = "50000",
                City = "Kuala Lumpur",
                State = "Kuala Lumpur",
                StateCode = "KUL",
                Country = "Malaysia",
                DeliveryZoneName = "Peninsular",
                DeliveryMethodName = "Standard Delivery",
                FreeShippingReason = "Free delivery for this zone.",
                CreatedAt = Now,
                UpdatedAt = Now
            };

            // Guard fixtures.
            var badQty = ConfirmedOrder("MPL-ORD-BADQTY", TagType.QrPetTag, 20m);
            badQty.Items.Add(SimpleItem(badQty.Id, nfc: false, unit: 20m, qty: 0, final: 20m));

            var mismatch = ConfirmedOrder("MPL-ORD-MISMATCH", TagType.QrPetTag, 999m);
            mismatch.Items.Add(SimpleItem(mismatch.Id, nfc: false, unit: 20m, qty: 1, final: 20m));

            db.TagOrders.AddRange(nfc, qr, nfcItem, qty, pending, badQty, mismatch);
            await db.SaveChangesAsync();
            return harness;
        }

        private static TagOrder ConfirmedOrder(string number, TagType tagType, decimal amount)
        {
            return new TagOrder
            {
                Id = Guid.NewGuid(),
                OrderNumber = number,
                OwnerUserId = OwnerAId,
                PetId = PetId,
                TagType = tagType,
                Variant = tagType == TagType.QrNfcSmartTag ? "Standard" : "Lightweight",
                Amount = amount,
                Currency = "MYR",
                DeliveryFee = 0m,
                Status = OrderStatus.PaymentConfirmed,
                PaymentStatus = PaymentStatus.Confirmed,
                PaymentConfirmedAt = Now.AddHours(1),
                StateCode = "KUL",
                Country = "Malaysia",
                DeliveryZoneName = "Peninsular",
                DeliveryMethodName = "Standard Delivery",
                FreeShippingReason = "Free delivery for this zone.",
                RecipientName = "Owner A",
                DeliveryPhoneE164 = "+60123456789",
                AddressLine1 = "1 Jalan Test",
                Postcode = "50000",
                City = "Kuala Lumpur",
                State = "Kuala Lumpur",
                CreatedAt = Now,
                UpdatedAt = Now
            };
        }

        private static TagOrderItem SimpleItem(Guid orderId, bool nfc, decimal unit, int qty, decimal final)
        {
            return new TagOrderItem
            {
                OrderId = orderId,
                SkuSnapshot = nfc ? "SKU-NFC" : "SKU-QR",
                ProductNameSnapshot = nfc ? "MyPetLink QR + NFC Smart Tag" : "MyPetLink QR Pet Tag",
                VariantNameSnapshot = nfc ? "Standard" : "Lightweight",
                SupportsQrSnapshot = true,
                SupportsNfcSnapshot = nfc,
                UnitBasePrice = unit,
                Quantity = qty,
                Subtotal = unit * qty,
                DiscountAmount = 0m,
                FinalUnitPrice = unit,
                FinalAmount = final,
                Currency = "MYR"
            };
        }

        private static PaymentProof Proof()
        {
            var mediaId = Guid.NewGuid();
            return new PaymentProof
            {
                Id = Guid.NewGuid(),
                MediaFileId = mediaId,
                MediaFile = new MediaFile
                {
                    Id = mediaId,
                    OwnerUserId = OwnerAId,
                    OriginalFileName = "receipt.png",
                    StorageFileName = "receipt.png",
                    ContentType = "image/png",
                    StorageProvider = "Local",
                    StoragePath = "private/secret-proof-path.png",
                    Sha256 = "abc123"
                },
                OriginalFileName = "receipt.png",
                StorageFileName = "receipt.png",
                ContentType = "image/png",
                StorageProvider = "Local",
                StoragePath = "private/secret-proof-path.png",
                Sha256 = "abc123",
                UploadedAt = Now.AddMinutes(30),
                PaymentMethod = "DuitNow QR",
                PaymentReference = "TXN-REF-1234",
                Status = PaymentProofStatus.Approved,
                ReviewedByAdminUserId = ReviewerAdminId,
                ReviewedAt = Now.AddHours(1)
            };
        }

        public void Dispose()
        {
            foreach (var context in _contexts)
            {
                context.Dispose();
            }
        }
    }
}
