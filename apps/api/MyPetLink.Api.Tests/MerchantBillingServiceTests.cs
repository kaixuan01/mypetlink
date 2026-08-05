using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public class MerchantBillingServiceTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-05T04:00:00Z");

    // ===================== Issuing =====================

    [Fact]
    public async Task IssuingAnInvoiceCopiesTheOrderTotalsExactly()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync();

        var invoice = await h.IssueAsync(order.Id);

        Assert.Equal("Issued", invoice.Status);
        Assert.Equal(order.MerchandiseSubtotal, invoice.MerchandiseSubtotal);
        Assert.Equal(order.DiscountTotal, invoice.DiscountTotal);
        Assert.Equal(order.DeliveryFee, invoice.DeliveryFee);
        Assert.Equal(order.GrandTotal, invoice.GrandTotal);
        Assert.Equal(order.MerchantOrderNumber, invoice.MerchantOrderNumber);
    }

    [Fact]
    public async Task InvoiceNumbersAreCountedPerDayInTheApprovedFormat()
    {
        using var h = await Harness.CreateAsync();

        var first = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        var second = await h.IssueAsync((await h.AwaitingPaymentOrderAsync("Second Merchant", "AS2222222-B")).Id);

        // 2026-08-05T04:00Z is 2026-08-05 noon in Malaysia.
        Assert.Equal("MPL-INV-260805-0001", first.InvoiceNumber);
        Assert.Equal("MPL-INV-260805-0002", second.InvoiceNumber);
    }

    [Fact]
    public async Task IssuingIsDueOnReceiptSoTheDueDateIsTheInvoiceDate()
    {
        using var h = await Harness.CreateAsync();

        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        Assert.Equal(invoice.InvoiceDate, invoice.DueDate);
        Assert.Equal("Due on receipt", invoice.PaymentTerm);
    }

    [Fact]
    public async Task IssuingTwiceReturnsTheSameInvoiceRatherThanBillingTwice()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync();

        var first = await h.IssueAsync(order.Id);
        var second = await h.IssueAsync(order.Id);

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(first.InvoiceNumber, second.InvoiceNumber);
        Assert.Equal(1, await h.Db.MerchantInvoices.CountAsync());
    }

    [Fact]
    public async Task IssuingIsBlockedUntilTheBusinessIdentityCanCarryAnInvoice()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync();

        // The registered address is removed after the order exists, which is
        // exactly the state an incomplete setup leaves behind.
        var identity = await h.Db.BusinessIdentitySettings.SingleAsync();
        identity.RegisteredAddressLine1 = "";
        identity.RegisteredPostcode = "";
        identity.RegisteredCity = "";
        identity.RegisteredState = "";
        await h.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.IssueAsync(order.Id));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("business_identity_incomplete", error.Code);
        Assert.Empty(await h.Db.MerchantInvoices.ToListAsync());
    }

    [Fact]
    public async Task ACancelledOrderCannotBeInvoiced()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync();
        await h.Sales.CancelMerchantOrderAsync(null, order.Id, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(() => h.IssueAsync(order.Id));

        Assert.Equal("merchant_order_cancelled", error.Code);
    }

    [Fact]
    public async Task TheInvoiceKeepsTheSellerDetailsItWasIssuedWith()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        // Someone corrects the business name afterwards.
        var settings = await h.Db.BusinessIdentitySettings.SingleAsync();
        settings.LegalBusinessName = "Renamed Holdings Sdn Bhd";
        await h.Db.SaveChangesAsync();

        var stored = await h.Db.MerchantInvoices.AsNoTracking()
            .SingleAsync(item => item.Id == invoice.Id);

        Assert.Equal("GBB Software Solutions", stored.Seller.LegalBusinessName);
    }

    // ===================== Payment =====================

    [Fact]
    public async Task RecordingTheExactAmountPaysTheInvoiceAndConfirmsTheOrder()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync();
        var invoice = await h.IssueAsync(order.Id);

        var result = await h.PayAsync(invoice);

        Assert.False(result.AlreadyRecorded);
        Assert.Equal("Paid", result.Invoice.Status);
        Assert.Equal(invoice.GrandTotal, result.Payment.AmountReceived);

        var stored = await h.Db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == order.Id);
        Assert.Equal(MerchantOrderPaymentStatus.PaymentConfirmed, stored.PaymentStatus);
        Assert.NotNull(stored.PaymentConfirmedAt);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1)]
    public async Task APaymentThatIsNotTheExactAmountIsRejected(int delta)
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.PayAsync(invoice, amount: invoice.GrandTotal + delta));

        Assert.Equal(400, error.StatusCode);
        Assert.Equal("validation_failed", error.Code);
        Assert.Empty(await h.Db.MerchantPayments.ToListAsync());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-50)]
    public async Task AZeroOrNegativeAmountIsRejected(int amount)
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var error = await Assert.ThrowsAsync<ApiException>(() => h.PayAsync(invoice, amount: amount));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task AnAmountWithMoreThanTwoDecimalsIsRejected()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.PayAsync(invoice, amount: 1234.5678m));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task RecordingThePaymentTwiceDoesNotTakeTheMoneyTwice()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var first = await h.PayAsync(invoice);
        var second = await h.PayAsync(invoice);

        Assert.False(first.AlreadyRecorded);
        Assert.True(second.AlreadyRecorded);
        Assert.Equal(first.Payment.Id, second.Payment.Id);
        Assert.Equal(1, await h.Db.MerchantPayments.CountAsync());
        Assert.Equal(1, await h.Db.MerchantReceipts.CountAsync());
        Assert.Equal(1, await h.Db.SalesCommissions.CountAsync());
    }

    [Fact]
    public async Task ACancelledInvoiceCannotBePaid()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        await h.Billing.CancelInvoiceAsync(null, invoice.Id, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(() => h.PayAsync(invoice));

        Assert.Equal("merchant_invoice_cancelled", error.Code);
    }

    [Fact]
    public async Task APaidInvoiceCannotBeCancelled()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        await h.PayAsync(invoice);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Billing.CancelInvoiceAsync(null, invoice.Id, null, default));

        Assert.Equal("merchant_invoice_paid", error.Code);
    }

    [Fact]
    public async Task TheTransactionReferenceIsOptional()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var result = await h.PayAsync(invoice, reference: null);

        Assert.Null(result.Payment.TransactionReference);
        Assert.Null(result.Receipt.TransactionReference);
    }

    [Fact]
    public async Task AWhitespaceOnlyReferenceIsStoredAsAbsentRatherThanBlank()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var result = await h.PayAsync(invoice, reference: "   ");

        Assert.Null(result.Payment.TransactionReference);
    }

    [Fact]
    public async Task AFutureDatedPaymentIsRejected()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.PayAsync(invoice, paymentDate: Now.AddDays(5)));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task AStaleEditTokenStopsThePayment()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.PayAsync(invoice, concurrencyToken: Convert.ToBase64String([9, 9, 9])));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("concurrency_conflict", error.Code);
    }

    // ===================== Receipt =====================

    [Fact]
    public async Task PaymentIssuesExactlyOneReceiptInTheApprovedFormat()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);

        var result = await h.PayAsync(invoice);

        Assert.Equal("MPL-RCP-B2B-260805-0001", result.Receipt.ReceiptNumber);
        Assert.Equal(invoice.GrandTotal, result.Receipt.AmountPaid);
    }

    [Fact]
    public async Task TheReceiptCarriesEveryBilledLine()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        await h.PayAsync(invoice);

        var receipt = await h.Db.MerchantReceipts
            .Include(item => item.Items)
            .AsNoTracking()
            .SingleAsync();

        Assert.Equal(invoice.Items.Count, receipt.Items.Count);
        Assert.Equal(invoice.MerchandiseSubtotal, receipt.MerchandiseSubtotal);
        Assert.Equal(invoice.DeliveryFee, receipt.DeliveryFee);
        Assert.Equal(invoice.InvoiceNumber, receipt.InvoiceNumberSnapshot);
    }

    // ===================== Commission =====================

    [Fact]
    public async Task CommissionIsChargedOnWhatWasSoldAndNotOnDelivery()
    {
        using var h = await Harness.CreateAsync();
        // 100 x RM12.50 = 1250, order discount 200, delivery 35 -> total 1085.
        var order = await h.AwaitingPaymentOrderAsync(
            withSalesperson: true, orderDiscount: 200m, deliveryFee: 35m);
        var invoice = await h.IssueAsync(order.Id);

        var result = await h.PayAsync(invoice);

        Assert.NotNull(result.Commission);
        Assert.Equal(1050m, result.Commission!.CommissionBaseAmount);
        Assert.Equal(5m, result.Commission.CommissionPercentage);
        Assert.Equal(52.50m, result.Commission.CommissionAmount);
        Assert.Equal("Payable", result.Commission.Status);
    }

    [Fact]
    public async Task NoSalespersonMeansNoCommissionRecord()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync(
            (await h.AwaitingPaymentOrderAsync(withSalesperson: false)).Id);

        var result = await h.PayAsync(invoice);

        Assert.Null(result.Commission);
        Assert.Empty(await h.Db.SalesCommissions.ToListAsync());
    }

    [Fact]
    public async Task MarkingACommissionPaidTwiceDoesNotPayItTwice()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync(withSalesperson: true)).Id);
        var commission = (await h.PayAsync(invoice)).Commission!;

        var first = await h.Billing.MarkCommissionPaidAsync(null, commission.Id, null, default);
        var second = await h.Billing.MarkCommissionPaidAsync(null, commission.Id, null, default);

        Assert.Equal("Paid", first.Status);
        Assert.Equal("Paid", second.Status);
        Assert.Equal(first.PaidAt, second.PaidAt);
    }

    // ===================== Privacy =====================

    [Fact]
    public async Task TheAuditTrailRecordsAmountsButNotTheAddressOrTheInternalNote()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        await h.PayAsync(invoice, note: "Reconciled against the June statement.");

        var entries = await h.Db.AuditLogs
            .Where(item => item.Action.StartsWith("merchant-"))
            .ToListAsync();
        var payload = string.Join("\n", entries.Select(item => $"{item.OldValue}{item.NewValue}"));

        Assert.Contains("merchant-invoice.issued", entries.Select(item => item.Action));
        Assert.Contains("merchant-payment.recorded", entries.Select(item => item.Action));
        Assert.Contains("merchant-receipt.issued", entries.Select(item => item.Action));
        Assert.DoesNotContain("Reconciled against", payload, StringComparison.Ordinal);
        Assert.DoesNotContain("Jalan Perdana", payload, StringComparison.Ordinal);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(
            MyPetLinkDbContext db,
            MerchantSalesService sales,
            MerchantBillingService billing)
        {
            Db = db;
            Sales = sales;
            Billing = billing;
        }

        public MyPetLinkDbContext Db { get; }
        public MerchantSalesService Sales { get; }
        public MerchantBillingService Billing { get; }
        public Guid VariantId { get; private set; }

        public static async Task<Harness> CreateAsync(bool completeIdentity = true)
        {
            var time = new FixedTime(Now);
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

            db.AddRange(product, variant);
            db.BusinessIdentitySettings.Add(new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId,
                BrandName = "MyPetLink",
                LegalBusinessName = "GBB Software Solutions",
                BusinessRegistrationNumber = "202603141718 (AS0515813-P)",
                RegisteredCountry = "Malaysia",
                SupportEmail = "support@mypetlink.com.my",
                // An incomplete identity is missing exactly the registered
                // address; everything else already satisfies a retail receipt.
                RegisteredAddressLine1 = completeIdentity ? "12 Jalan Teknologi" : "",
                RegisteredPostcode = completeIdentity ? "57000" : "",
                RegisteredCity = completeIdentity ? "Kuala Lumpur" : "",
                RegisteredState = completeIdentity ? "Kuala Lumpur" : "",
                RowVersion = [1, 2, 3],
                UpdatedAt = Now,
            });
            await db.SaveChangesAsync();

            var audit = new AuditLogService(db, new HttpContextAccessor());
            var numbers = new DocumentNumberService(db);
            var identity = new BusinessIdentityService(db, audit, time);
            var gate = new EmailTemplateGate(db, Options.Create(new EmailOptions
            {
                Enabled = true,
                FromAddress = "support@mypetlink.com.my",
                FromName = "MyPetLink",
                OwnerPortalBaseUrl = "http://localhost:3000",
            }));

            return new Harness(
                db,
                new MerchantSalesService(db, numbers, identity, audit, time),
                new MerchantBillingService(
                    db, numbers, identity,
                    new MerchantEmailService(db, gate, audit, time),
                    audit, time))
            {
                VariantId = variant.Id,
            };
        }

        /// <summary>A merchant order that has been converted and is awaiting payment.</summary>
        public async Task<MerchantOrderResponse> AwaitingPaymentOrderAsync(
            string merchantName = "Happy Paws Sdn Bhd",
            string registration = "AS0515813-P",
            bool withSalesperson = true,
            decimal orderDiscount = 0m,
            decimal deliveryFee = 0m)
        {
            Guid? salespersonId = null;
            if (withSalesperson)
            {
                var salesperson = await Sales.CreateSalespersonAsync(null,
                    new UpsertSalespersonRequest(
                        $"Rep {Guid.NewGuid():N}"[..12], $"{Guid.NewGuid():N}@example.com",
                        "+60123456700", 5m, null),
                    default);
                salespersonId = salesperson.Id;
            }

            var merchant = await Sales.CreateMerchantAsync(null, new UpsertMerchantRequest(
                merchantName, "Happy Paws", registration, null, null,
                "Aina Rahman", $"{Guid.NewGuid():N}@happypaws.example", "+60123456789",
                new MerchantAddressDto("12 Jalan Perdana", null, "68000", "Ampang", "Selangor", "Malaysia"),
                DeliveryAddressSameAsBilling: true, DeliveryAddress: null,
                AssignedSalespersonId: salespersonId, InternalNotes: "Pays on time."), default);

            var quotation = await Sales.CreateQuotationAsync(null, new UpsertQuotationRequest(
                merchant.Id, salespersonId, null, orderDiscount, deliveryFee, null, null,
                [new UpsertQuotationItemRequest(VariantId, 100, 12.50m)]), default);

            await Sales.TransitionQuotationAsync(null, quotation.Id, MerchantQuotationStatus.Sent, null, default);
            await Sales.TransitionQuotationAsync(null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);

            var converted = await Sales.ConvertQuotationAsync(null, quotation.Id, null, default);
            return converted.Order;
        }

        public Task<MerchantInvoiceResponse> IssueAsync(Guid merchantOrderId) =>
            Billing.IssueInvoiceAsync(null, merchantOrderId, new IssueMerchantInvoiceRequest(), default);

        public Task<RecordMerchantPaymentResult> PayAsync(
            MerchantInvoiceResponse invoice,
            decimal? amount = null,
            string? reference = "TXN-0001",
            string? note = null,
            DateTimeOffset? paymentDate = null,
            string? concurrencyToken = null) =>
            Billing.RecordPaymentAsync(null, invoice.Id, new RecordMerchantPaymentRequest(
                paymentDate ?? Now,
                amount ?? invoice.GrandTotal,
                "BankTransfer",
                reference,
                note,
                null,
                concurrencyToken), default);

        public void Dispose() => Db.Dispose();
    }

    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
