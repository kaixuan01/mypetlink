using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// A complete merchant sale, built through the real services rather than by
/// inserting rows: merchant, salesperson, quotation, order, invoice, payment,
/// receipt and commission. Document and email tests share it so they exercise
/// the same records an administrator would produce.
/// </summary>
internal sealed class MerchantDocumentHarness : IDisposable
{
    public static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-05T04:00:00Z");

    private MerchantDocumentHarness(
        MyPetLinkDbContext db,
        MerchantSalesService sales,
        MerchantBillingService billing,
        MerchantDocumentService documents,
        MerchantEmailService emails,
        EmailTemplateRenderer renderer,
        EmailAttachmentResolver attachments)
    {
        Db = db;
        Sales = sales;
        Billing = billing;
        Documents = documents;
        Emails = emails;
        Renderer = renderer;
        Attachments = attachments;
    }

    public MyPetLinkDbContext Db { get; }
    public MerchantSalesService Sales { get; }
    public MerchantBillingService Billing { get; }
    public MerchantDocumentService Documents { get; }
    public MerchantEmailService Emails { get; }
    public EmailTemplateRenderer Renderer { get; }
    public EmailAttachmentResolver Attachments { get; }

    public Guid VariantId { get; private set; }
    public Guid SecondVariantId { get; private set; }
    public Guid MerchantId { get; private set; }
    public Guid SalespersonId { get; private set; }

    public static async Task<MerchantDocumentHarness> CreateAsync(
        string merchantName = "Happy Paws Sdn Bhd",
        string addressLine1 = "12 Jalan Perdana",
        bool completeIdentity = true,
        bool emailsEnabled = true,
        bool globalEmailEnabled = true)
    {
        var time = new FixedTimeProvider(Now);
        var db = new MyPetLinkDbContext(
            new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
            time);

        var product = new TagProduct { Name = "Wholesale Tag", Slug = "wholesale-tag", IsPublished = true };
        var variant = new TagProductVariant
        {
            TagProduct = product, PublicKey = "WSQR0000000000001", Sku = "WS-QR-1",
            DisplayName = "Lightweight", SupportsQr = true, TagVariant = "Lightweight",
            BasePrice = 19.90m, Currency = "MYR", IsActive = true, IsPurchasable = true,
            WeightGrams = 4.5m,
        };
        var second = new TagProductVariant
        {
            TagProduct = product, PublicKey = "WSNFC000000000001", Sku = "WS-NFC-1",
            DisplayName = "Standard", SupportsQr = true, SupportsNfc = true, TagVariant = "Standard",
            BasePrice = 39.90m, Currency = "MYR", IsActive = true, IsPurchasable = true,
        };

        db.AddRange(product, variant, second);
        db.BusinessIdentitySettings.Add(new BusinessIdentitySetting
        {
            Id = BusinessIdentityService.SettingsId,
            BrandName = "MyPetLink",
            LegalBusinessName = "GBB Software Solutions",
            BusinessRegistrationNumber = "202603141718 (AS0515813-P)",
            RegisteredAddressLine1 = completeIdentity ? "12 Jalan Teknologi 3/1" : "",
            RegisteredPostcode = completeIdentity ? "57000" : "",
            RegisteredCity = completeIdentity ? "Kuala Lumpur" : "",
            RegisteredState = completeIdentity ? "Kuala Lumpur" : "",
            RegisteredCountry = "Malaysia",
            SupportEmail = "support@mypetlink.com.my",
            BusinessWebsite = "mypetlink.com.my",
            PaymentInstructions =
                "Payment is due on receipt. Please quote the invoice number as your payment reference.",
            BankAccountName = "GBB Software Solutions",
            BankName = "Maybank",
            BankAccountNumber = "512345678901",
            RowVersion = [1, 2, 3],
            UpdatedAt = Now,
        });

        foreach (var messageType in Enum.GetValues<EmailMessageType>())
        {
            db.EmailTemplateSettings.Add(new EmailTemplateSetting
            {
                Id = Guid.NewGuid(),
                MessageType = messageType,
                IsEnabled = emailsEnabled,
                EnabledFromUtc = emailsEnabled ? Now.AddDays(-1) : null,
                RowVersion = [1],
                CreatedAt = Now,
                UpdatedAt = Now,
            });
        }

        await db.SaveChangesAsync();

        var audit = new AuditLogService(db, new HttpContextAccessor());
        var numbers = new DocumentNumberService(db);
        var identity = new BusinessIdentityService(db, audit, time);
        var options = Options.Create(new EmailOptions
        {
            Enabled = globalEmailEnabled,
            FromAddress = "support@mypetlink.com.my",
            FromName = "MyPetLink",
            OwnerPortalBaseUrl = "http://localhost:3000",
        });
        var gate = new EmailTemplateGate(db, options);
        var layout = new TransactionalEmailLayout(options);
        var documents = new MerchantDocumentService(db);
        var emails = new MerchantEmailService(db, gate, audit, time);

        var harness = new MerchantDocumentHarness(
            db,
            new MerchantSalesService(db, numbers, identity, audit, time),
            new MerchantBillingService(db, numbers, identity, emails, audit, time),
            documents,
            emails,
            new EmailTemplateRenderer(
                new PaymentConfirmedEmailTemplateRenderer(options, layout),
                new OwnerWelcomeEmailTemplateRenderer(layout),
                new OrderShippedEmailTemplateRenderer(options, layout),
                new MerchantQuotationEmailTemplateRenderer(layout),
                new MerchantInvoiceEmailTemplateRenderer(layout),
                new MerchantPaymentConfirmationEmailTemplateRenderer(layout)),
            new EmailAttachmentResolver(new OrderDocumentService(db), documents))
        {
            VariantId = variant.Id,
            SecondVariantId = second.Id,
        };

        var salesperson = await harness.Sales.CreateSalespersonAsync(null,
            new UpsertSalespersonRequest("Field Rep", "rep@example.com", "+60123456700", 5m, null),
            default);
        harness.SalespersonId = salesperson.Id;

        var merchant = await harness.Sales.CreateMerchantAsync(null, new UpsertMerchantRequest(
            merchantName, "Happy Paws", "AS0515813-P", null, null,
            "Aina Rahman", "orders@happypaws.example", "+60123456789",
            new MerchantAddressDto(addressLine1, null, "68000", "Ampang", "Selangor", "Malaysia"),
            DeliveryAddressSameAsBilling: true, DeliveryAddress: null,
            AssignedSalespersonId: salesperson.Id, InternalNotes: "Pays on time."), default);
        harness.MerchantId = merchant.Id;

        return harness;
    }

    // --- Records -----------------------------------------------------------

    public Task<QuotationResponse> DraftQuotationAsync(
        int lineCount = 1,
        bool twoLines = false,
        decimal lineDiscount = 0m,
        decimal orderDiscount = 0m,
        decimal deliveryFee = 0m,
        string? customerNotes = null,
        string? internalNotes = null,
        bool longProductName = false)
    {
        var items = new List<UpsertQuotationItemRequest>();

        if (lineCount > 1)
        {
            // Real distinct SKUs, so a pagination test can prove every line
            // survived the page break rather than just the first page.
            foreach (var variantId in EnsureVariants(lineCount))
            {
                items.Add(new UpsertQuotationItemRequest(variantId, 120, 12.50m, lineDiscount));
            }
        }
        else
        {
            items.Add(new UpsertQuotationItemRequest(VariantId, 100, 12.50m, lineDiscount));
            if (twoLines)
            {
                items.Add(new UpsertQuotationItemRequest(SecondVariantId, 25, 20.00m, 0m));
            }
        }

        if (longProductName)
        {
            RenameProductsForLongNameTest();
        }

        return Sales.CreateQuotationAsync(null, new UpsertQuotationRequest(
            MerchantId, SalespersonId, null, orderDiscount, deliveryFee,
            customerNotes, internalNotes, items), default);
    }

    public async Task<QuotationResponse> SentQuotationAsync(
        int lineCount = 1,
        bool twoLines = false,
        decimal lineDiscount = 0m,
        decimal orderDiscount = 0m,
        decimal deliveryFee = 0m,
        string? customerNotes = null,
        string? internalNotes = null,
        bool longProductName = false)
    {
        var quotation = await DraftQuotationAsync(
            lineCount, twoLines, lineDiscount, orderDiscount, deliveryFee,
            customerNotes, internalNotes, longProductName);

        return await Sales.TransitionQuotationAsync(
            null, quotation.Id, MerchantQuotationStatus.Sent, null, default);
    }

    public async Task<MerchantOrderResponse> AwaitingPaymentOrderAsync(
        bool twoLines = false, decimal orderDiscount = 0m, decimal deliveryFee = 0m)
    {
        var quotation = await SentQuotationAsync(
            twoLines: twoLines, orderDiscount: orderDiscount, deliveryFee: deliveryFee);
        await Sales.TransitionQuotationAsync(
            null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);
        var converted = await Sales.ConvertQuotationAsync(null, quotation.Id, null, default);
        return converted.Order;
    }

    public async Task<MerchantInvoiceResponse> IssuedInvoiceAsync(
        bool twoLines = false,
        decimal orderDiscount = 0m,
        decimal deliveryFee = 0m,
        string? internalNotes = null)
    {
        var order = await AwaitingPaymentOrderAsync(twoLines, orderDiscount, deliveryFee);
        return await Billing.IssueInvoiceAsync(
            null, order.Id, new IssueMerchantInvoiceRequest(InternalNotes: internalNotes), default);
    }

    public async Task<RecordMerchantPaymentResult> PaidInvoiceAsync(
        bool twoLines = false,
        decimal orderDiscount = 0m,
        decimal deliveryFee = 0m,
        string? reference = "FT26080500001",
        string? internalNote = null)
    {
        var invoice = await IssuedInvoiceAsync(twoLines, orderDiscount, deliveryFee);
        return await Billing.RecordPaymentAsync(null, invoice.Id, new RecordMerchantPaymentRequest(
            Now, invoice.GrandTotal, "BankTransfer", reference, internalNote), default);
    }

    // --- Document text -----------------------------------------------------

    public async Task<string> QuotationTextAsync(Guid quotationId) =>
        MerchantDocumentServiceTests.ExtractText(
            (await Documents.GetQuotationAsync(quotationId)).Content);

    public async Task<string> InvoiceTextAsync(Guid invoiceId) =>
        MerchantDocumentServiceTests.ExtractText(
            (await Documents.GetInvoiceAsync(invoiceId)).Content);

    public async Task<string> ReceiptTextAsync(Guid invoiceId) =>
        MerchantDocumentServiceTests.ExtractText(
            (await Documents.GetReceiptForInvoiceAsync(invoiceId)).Content);

    public Task<EmailOutbox> OutboxAsync(EmailMessageType messageType) =>
        Db.EmailOutbox.AsNoTracking().SingleAsync(item => item.MessageType == messageType);

    /// <summary>
    /// Adds as many catalog options as the test needs, each with its own SKU.
    /// </summary>
    private List<Guid> EnsureVariants(int count)
    {
        var product = Db.TagProducts.Include(item => item.Variants).Single();
        var created = new List<Guid>();

        for (var index = 1; index <= count; index++)
        {
            var sku = $"WS-SKU-{index:00}";
            var existing = product.Variants.FirstOrDefault(item => item.Sku == sku);
            if (existing is not null)
            {
                created.Add(existing.Id);
                continue;
            }

            var variant = new TagProductVariant
            {
                TagProductId = product.Id,
                PublicKey = $"WSBULK{index:0000000000}",
                Sku = sku,
                DisplayName = $"Bulk Option {index:00}",
                SupportsQr = true,
                TagVariant = index % 2 == 0 ? "Standard" : "Lightweight",
                BasePrice = 19.90m,
                Currency = "MYR",
                IsActive = true,
                IsPurchasable = true,
            };
            Db.TagProductVariants.Add(variant);
            created.Add(variant.Id);
        }

        Db.SaveChanges();
        return created;
    }

    private void RenameProductsForLongNameTest()
    {
        var product = Db.TagProducts.Single();
        product.Name = "Premium Stainless Steel Engraved Wholesale Identification Smart Tag";
        Db.SaveChanges();
    }

    public void Dispose() => Db.Dispose();

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
