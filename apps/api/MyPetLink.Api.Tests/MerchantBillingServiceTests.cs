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

    // The Orders screen fetches one page's invoices in a single request. Before
    // this filter existed it asked for the newest invoices globally and kept the
    // ones that happened to match, so a filtered or later page of orders showed
    // "No invoice has been issued yet" for orders that were already invoiced.
    [Fact]
    public async Task ListingInvoicesByMerchantOrderIdsReturnsOnlyThoseOrdersInvoices()
    {
        using var h = await Harness.CreateAsync();
        var first = await h.AwaitingPaymentOrderAsync();
        var second = await h.AwaitingPaymentOrderAsync("Second Merchant", "AS2222222-B");
        var third = await h.AwaitingPaymentOrderAsync("Third Merchant", "AS3333333-C");

        var firstInvoice = await h.IssueAsync(first.Id);
        await h.IssueAsync(second.Id);
        await h.IssueAsync(third.Id);

        // Ask only for the oldest order, exactly as a one-row page would.
        var (items, total) = await h.Billing.ListInvoicesAsync(
            page: 1, pageSize: 1, search: null, status: null, merchantId: null,
            fromDate: null, toDate: null, merchantOrderIds: [first.Id],
            cancellationToken: default);

        Assert.Equal(1, total);
        var only = Assert.Single(items);
        Assert.Equal(firstInvoice.InvoiceNumber, only.InvoiceNumber);
        Assert.Equal(first.Id, only.MerchantOrderId);
    }

    [Fact]
    public async Task ListingInvoicesWithoutMerchantOrderIdsStillReturnsEveryInvoice()
    {
        using var h = await Harness.CreateAsync();
        await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        await h.IssueAsync((await h.AwaitingPaymentOrderAsync("Second Merchant", "AS2222222-B")).Id);

        var (items, total) = await h.Billing.ListInvoicesAsync(
            page: 1, pageSize: 20, search: null, status: null, merchantId: null,
            fromDate: null, toDate: null, merchantOrderIds: null,
            cancellationToken: default);

        Assert.Equal(2, total);
        Assert.Equal(2, items.Count);
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

    [Fact]
    public async Task DirectRetailCommissionUsesTheExistingPayoutAndReversalLifecycle()
    {
        using var h = await Harness.CreateAsync();
        var salesperson = new Salesperson
        {
            SalespersonCode = "SP-DIRECT",
            Name = "Direct Seller"
        };
        var order = new TagOrder
        {
            OrderNumber = "MPL-ORD-DIRECT",
            OwnerUserId = Guid.NewGuid(),
            PetId = Guid.NewGuid(),
            Amount = 29.90m,
            TotalAmount = 37.90m,
            Currency = "MYR",
            DeliveryFee = 8m,
            RecipientName = "Retail Owner",
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Test",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur"
        };
        var commission = new SalesCommission
        {
            SourceType = SalesCommissionSourceType.TagOrder,
            CommissionType = SalesCommissionType.DirectRetailPercentage,
            TagOrder = order,
            TagOrderId = order.Id,
            Salesperson = salesperson,
            SalespersonId = salesperson.Id,
            SalespersonCodeSnapshot = salesperson.SalespersonCode,
            SalespersonNameSnapshot = salesperson.Name,
            CommissionPercentageSnapshot = 15m,
            CommissionBaseAmount = 29.90m,
            CommissionAmount = 4.49m,
            Currency = "MYR",
            Status = SalesCommissionStatus.Payable,
            CalculatedAt = Now
        };
        h.Db.AddRange(salesperson, order, commission);
        await h.Db.SaveChangesAsync();

        var paid = await h.Billing.MarkCommissionPaidAsync(
            null, commission.Id, Convert.ToBase64String(commission.RowVersion), default);
        var repeated = await h.Billing.MarkCommissionPaidAsync(
            null, commission.Id, paid.ConcurrencyToken, default);
        var reversed = await h.Billing.ReverseCommissionAsync(
            null,
            commission.Id,
            new ReverseSalesCommissionRequest("Retail sale invalidated.", repeated.ConcurrencyToken),
            default);

        Assert.Equal("TagOrder", paid.SourceType);
        Assert.Equal("DirectRetailPercentage", paid.CommissionType);
        Assert.Equal(order.Id, paid.TagOrderId);
        Assert.Equal(order.OrderNumber, paid.SourceOrderNumber);
        Assert.Equal(paid.PaidAt, repeated.PaidAt);
        Assert.Equal("Reversed", reversed.Status);
        Assert.Equal(paid.PaidAt, reversed.PaidAt);
        await Assert.ThrowsAsync<ApiException>(() => h.Billing.MarkCommissionPaidAsync(
            null, commission.Id, reversed.ConcurrencyToken, default));
    }

    [Fact]
    public async Task CancellingAndReissuingAnInvoiceCreatesExactlyOneCommission()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync(withSalesperson: true);
        var original = await h.IssueAsync(order.Id);

        await h.Billing.CancelInvoiceAsync(null, original.Id, original.ConcurrencyToken, default);
        var replacement = await h.IssueAsync(order.Id);
        var result = await h.PayAsync(replacement);

        Assert.NotEqual(original.Id, replacement.Id);
        Assert.NotNull(result.Commission);
        Assert.Equal(order.Id, result.Commission!.MerchantOrderId);
        Assert.Equal(2, await h.Db.MerchantInvoices.CountAsync());
        Assert.Equal(1, await h.Db.MerchantInvoices.CountAsync(
            item => item.Status == MerchantInvoiceStatus.Cancelled));
        Assert.Equal(1, await h.Db.MerchantInvoices.CountAsync(
            item => item.Status == MerchantInvoiceStatus.Paid));
        Assert.Equal(1, await h.Db.MerchantPayments.CountAsync());
        Assert.Equal(1, await h.Db.MerchantReceipts.CountAsync());
        Assert.Equal(1, await h.Db.SalesCommissions.CountAsync());
    }

    [Fact]
    public async Task ExistingValidOrderCommissionBlocksAReplacementPayment()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync(withSalesperson: true);
        var original = await h.IssueAsync(order.Id);
        await h.PayAsync(original);

        // Reproduce the legacy inconsistent state that made reissue risky:
        // the document/order are reopened while the first commission survives.
        var storedInvoice = await h.Db.MerchantInvoices.SingleAsync(item => item.Id == original.Id);
        storedInvoice.Status = MerchantInvoiceStatus.Cancelled;
        var storedOrder = await h.Db.MerchantOrders.SingleAsync(item => item.Id == order.Id);
        storedOrder.PaymentStatus = MerchantOrderPaymentStatus.AwaitingPayment;
        await h.Db.SaveChangesAsync();

        var replacement = await h.IssueAsync(order.Id);
        var error = await Assert.ThrowsAsync<ApiException>(() => h.PayAsync(replacement));

        Assert.Equal("merchant_order_commission_exists", error.Code);
        Assert.Equal(1, await h.Db.SalesCommissions.CountAsync());
        Assert.Equal(1, await h.Db.MerchantPayments.CountAsync());
    }

    [Fact]
    public async Task APayableCommissionCanBeReversedWithItsReasonPreserved()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        var commission = (await h.PayAsync(invoice)).Commission!;

        var reversed = await h.Billing.ReverseCommissionAsync(null, commission.Id,
            new ReverseSalesCommissionRequest("Merchant payment was refunded.", commission.ConcurrencyToken),
            default);

        Assert.Equal("Reversed", reversed.Status);
        Assert.NotNull(reversed.ReversedAt);
        Assert.Equal("Merchant payment was refunded.", reversed.ReversalReason);
        Assert.Null(reversed.PaidAt);
        Assert.Contains("merchant-commission.reversed",
            await h.Db.AuditLogs.Select(item => item.Action).ToListAsync());
    }

    [Fact]
    public async Task ReversingAPaidCommissionKeepsItsPayoutHistory()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        var commission = (await h.PayAsync(invoice)).Commission!;
        var paid = await h.Billing.MarkCommissionPaidAsync(
            null, commission.Id, commission.ConcurrencyToken, default);

        var reversed = await h.Billing.ReverseCommissionAsync(null, commission.Id,
            new ReverseSalesCommissionRequest("Settlement was later invalidated.", paid.ConcurrencyToken),
            default);

        Assert.Equal("Reversed", reversed.Status);
        Assert.Equal(paid.PaidAt, reversed.PaidAt);
        Assert.NotNull(reversed.ReversedAt);
    }

    [Fact]
    public async Task AReversedCommissionCannotBePaid()
    {
        using var h = await Harness.CreateAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        var commission = (await h.PayAsync(invoice)).Commission!;
        var reversed = await h.Billing.ReverseCommissionAsync(null, commission.Id,
            new ReverseSalesCommissionRequest("Payment invalidated.", commission.ConcurrencyToken), default);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Billing.MarkCommissionPaidAsync(null, commission.Id, reversed.ConcurrencyToken, default));

        Assert.Equal("commission_reversed", error.Code);
    }

    [Fact]
    public async Task PayoutAndReversalActorsAreStoredWithoutErasingPayoutTime()
    {
        using var h = await Harness.CreateAsync();
        var user = new User
        {
            Email = "finance-admin@example.com",
            NormalizedEmail = "FINANCE-ADMIN@EXAMPLE.COM",
            DisplayName = "Finance Admin",
        };
        var admin = new AdminUser { User = user, UserId = user.Id };
        h.Db.AddRange(user, admin);
        await h.Db.SaveChangesAsync();
        var invoice = await h.IssueAsync((await h.AwaitingPaymentOrderAsync()).Id);
        var commission = (await h.PayAsync(invoice)).Commission!;

        var paid = await h.Billing.MarkCommissionPaidAsync(
            user.Id, commission.Id, commission.ConcurrencyToken, default);
        var reversed = await h.Billing.ReverseCommissionAsync(user.Id, commission.Id,
            new ReverseSalesCommissionRequest("Charge was invalidated.", paid.ConcurrencyToken), default);

        Assert.Equal(admin.Id, paid.PaidByAdminUserId);
        Assert.Equal(admin.Id, reversed.ReversedByAdminUserId);
        Assert.Equal(paid.PaidAt, reversed.PaidAt);
        var payoutAudit = await h.Db.AuditLogs.SingleAsync(
            item => item.Action == "merchant-commission.paid");
        var reversalAudit = await h.Db.AuditLogs.SingleAsync(
            item => item.Action == "merchant-commission.reversed");
        Assert.Equal(user.Id, payoutAudit.ActorId);
        Assert.Equal(user.Id, reversalAudit.ActorId);
    }

    [Fact]
    public async Task HistoricalOrderUsesItsPercentageSnapshotAfterSalespersonChanges()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync(withSalesperson: true);
        var salesperson = await h.Db.Salespersons.SingleAsync(item => item.Id == order.SalespersonId);
        salesperson.DefaultCommissionPercentage = 40m;
        await h.Db.SaveChangesAsync();

        var result = await h.PayAsync(await h.IssueAsync(order.Id));

        Assert.Equal(5m, result.Commission!.CommissionPercentage);
        Assert.Equal(62.50m, result.Commission.CommissionAmount);
    }

    [Fact]
    public async Task AttributionCanBeCorrectedBeforePaymentAndIsAudited()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync(withSalesperson: false);
        var replacement = await h.Sales.CreateSalespersonAsync(null,
            new UpsertSalespersonRequest("Correct Rep", "correct@example.com", "+60123456701", 7.5m, null),
            default);
        var storedOrder = await h.Db.MerchantOrders.SingleAsync(item => item.Id == order.Id);
        storedOrder.RowVersion = [1, 2, 3];
        await h.Db.SaveChangesAsync();

        var corrected = await h.Sales.CorrectMerchantOrderCommissionAttributionAsync(null, order.Id,
            new CorrectMerchantOrderCommissionAttributionRequest(
                replacement.Id, Convert.ToBase64String([1, 2, 3])),
            default);
        var result = await h.PayAsync(await h.IssueAsync(order.Id));

        Assert.Equal(replacement.Id, corrected.SalespersonId);
        Assert.Equal("Correct Rep", corrected.SalespersonName);
        Assert.Equal(7.5m, corrected.CommissionPercentage);
        Assert.Equal(replacement.Id, result.Commission!.SalespersonId);
        var audit = await h.Db.AuditLogs.SingleAsync(
            item => item.Action == "merchant-order.commission-attribution-corrected");
        Assert.Contains(replacement.Id.ToString(), audit.NewValue);
    }

    [Fact]
    public async Task AttributionCannotBeRewrittenAfterCommissionExists()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync(withSalesperson: true);
        await h.PayAsync(await h.IssueAsync(order.Id));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Sales.CorrectMerchantOrderCommissionAttributionAsync(null, order.Id,
                new CorrectMerchantOrderCommissionAttributionRequest(
                    null, Convert.ToBase64String([1])), default));

        Assert.Equal("merchant_order_attribution_finalized", error.Code);
    }

    [Fact]
    public async Task AttributionCorrectionRejectsAStaleRowVersion()
    {
        using var h = await Harness.CreateAsync();
        var order = await h.AwaitingPaymentOrderAsync(withSalesperson: false);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Sales.CorrectMerchantOrderCommissionAttributionAsync(null, order.Id,
                new CorrectMerchantOrderCommissionAttributionRequest(
                    null, Convert.ToBase64String([9, 9, 9])), default));

        Assert.Equal("concurrency_conflict", error.Code);
    }

    // ===================== Reseller acquisition and repeat =====================

    [Theory]
    [InlineData(9, null)]
    [InlineData(10, 50)]
    [InlineData(19, 50)]
    [InlineData(20, 80)]
    [InlineData(49, 80)]
    [InlineData(50, 150)]
    [InlineData(99, 150)]
    [InlineData(100, 250)]
    public async Task FirstQualifyingQuantityUsesTheEffectiveAcquisitionTier(
        int quantity, int? expectedBonus)
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var order = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: quantity);

        var result = await h.PayAsync(await h.IssueAsync(order.Id));
        var merchant = await h.Db.Merchants.SingleAsync(item => item.Id == order.MerchantId);

        if (expectedBonus.HasValue)
        {
            Assert.NotNull(result.Commission);
            Assert.Equal("ResellerAcquisitionBonus", result.Commission!.CommissionType);
            Assert.Equal(expectedBonus.Value, result.Commission.CommissionAmount);
            Assert.Equal(order.Id, merchant.FirstQualifyingMerchantOrderId);
            Assert.Equal(3m, merchant.RepeatCommissionPercentageSnapshot);
            Assert.Equal(Now.AddMonths(3), merchant.RepeatCommissionEligibleUntil);
        }
        else
        {
            Assert.Null(result.Commission);
            Assert.Null(merchant.FirstQualifyingMerchantOrderId);
            Assert.Null(merchant.FirstQualifyingPaidOrderAt);
        }
        Assert.DoesNotContain(await h.Db.SalesCommissions.ToListAsync(),
            item => item.CommissionType == SalesCommissionType.MerchantOrderPercentage);
    }

    [Fact]
    public async Task ASubTierOrderDoesNotActivateAndALaterQualifyingOrderDoes()
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var first = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 5);
        await h.PayAsync(await h.IssueAsync(first.Id));
        var second = await h.AwaitingPaymentOrderForMerchantAsync(
            first.MerchantId, first.SalespersonId, 15);

        var result = await h.PayAsync(await h.IssueAsync(second.Id));

        Assert.Equal("ResellerAcquisitionBonus", result.Commission!.CommissionType);
        Assert.Equal(50m, result.Commission.CommissionAmount);
        var merchant = await h.Db.Merchants.SingleAsync(item => item.Id == first.MerchantId);
        Assert.Equal(second.Id, merchant.FirstQualifyingMerchantOrderId);
        Assert.Equal(1, await h.Db.SalesCommissions.CountAsync());
    }

    [Fact]
    public async Task NewMerchantUsesAcquisitionPlanAndLocksCorrectedOwnerAtActivation()
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var order = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 10);
        var replacement = await h.Sales.CreateSalespersonAsync(null,
            new UpsertSalespersonRequest("Acquisition Owner", null, null, 9m, null), default);
        var merchant = await h.Db.Merchants.SingleAsync(item => item.Id == order.MerchantId);
        Assert.Equal(MerchantCommissionPlan.AcquisitionAndRepeat, merchant.CommissionPlan);
        Assert.Equal(order.SalespersonId, merchant.AcquiredBySalespersonId);
        merchant.RowVersion = [7, 8, 9];
        await h.Db.SaveChangesAsync();

        await h.Sales.CorrectMerchantAcquisitionAttributionAsync(null, merchant.Id,
            new CorrectMerchantAcquisitionAttributionRequest(
                replacement.Id, Convert.ToBase64String([7, 8, 9])), default);
        var result = await h.PayAsync(await h.IssueAsync(order.Id));
        var activated = await h.Db.Merchants.SingleAsync(item => item.Id == merchant.Id);

        Assert.Equal(replacement.Id, result.Commission!.SalespersonId);
        Assert.Equal(replacement.Id, activated.AcquiredBySalespersonId);
        Assert.Equal("Acquisition Owner", activated.AcquiredBySalespersonNameSnapshot);
        Assert.Contains("merchant.acquisition-attribution-corrected",
            await h.Db.AuditLogs.Select(item => item.Action).ToListAsync());
        Assert.Contains("merchant.acquisition-activated",
            await h.Db.AuditLogs.Select(item => item.Action).ToListAsync());

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Sales.CorrectMerchantAcquisitionAttributionAsync(null, merchant.Id,
                new CorrectMerchantAcquisitionAttributionRequest(
                    null, Convert.ToBase64String(activated.RowVersion)), default));
        Assert.Equal("merchant_acquisition_locked", error.Code);
    }

    [Fact]
    public async Task RepeatCommissionUsesFrozenTermsAndNetMerchandiseOnly()
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var activation = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 10);
        var acquisition = await h.PayAsync(await h.IssueAsync(activation.Id));
        Assert.Equal("ResellerAcquisitionBonus", acquisition.Commission!.CommissionType);

        h.Time.UtcNow = Now.AddMonths(1);
        var repeat = await h.AwaitingPaymentOrderForMerchantAsync(
            activation.MerchantId, activation.SalespersonId, 10,
            unitPrice: 100m, orderDiscount: 100m, deliveryFee: 75m);
        var result = await h.PayAsync(await h.IssueAsync(repeat.Id));

        Assert.Equal("ResellerRepeatPercentage", result.Commission!.CommissionType);
        Assert.Equal(900m, result.Commission.CommissionBaseAmount);
        Assert.Equal(27m, result.Commission.CommissionAmount);
        Assert.Equal(3m, result.Commission.CommissionPercentage);
        Assert.Equal(2, await h.Db.SalesCommissions.CountAsync());
    }

    [Theory]
    [InlineData(-1, true)]
    [InlineData(0, false)]
    [InlineData(1, false)]
    public async Task RepeatWindowUsesAHalfOpenEndBoundary(int ticksFromEnd, bool expected)
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var activation = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 10);
        await h.PayAsync(await h.IssueAsync(activation.Id));

        var paymentAt = Now.AddMonths(3).AddTicks(ticksFromEnd);
        h.Time.UtcNow = paymentAt;
        var repeat = await h.AwaitingPaymentOrderForMerchantAsync(
            activation.MerchantId, activation.SalespersonId, 10);
        var result = await h.PayAsync(await h.IssueAsync(repeat.Id), paymentDate: paymentAt);

        Assert.Equal(expected, result.Commission is not null);
        if (expected) Assert.Equal("ResellerRepeatPercentage", result.Commission!.CommissionType);
    }

    [Fact]
    public async Task RuleChangesDoNotRewriteAnActivatedResellersTerms()
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var activation = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 10);
        await h.PayAsync(await h.IssueAsync(activation.Id));

        var oldRepeat = await h.Db.CommissionRules.SingleAsync(
            item => item.CommissionType == SalesCommissionType.ResellerRepeatPercentage);
        oldRepeat.EffectiveTo = Now.AddDays(1);
        h.Db.CommissionRules.Add(new CommissionRule
        {
            CommissionType = SalesCommissionType.ResellerRepeatPercentage,
            Percentage = 5m,
            EligibilityMonths = 6,
            Currency = "MYR",
            EffectiveFrom = Now.AddDays(1),
            IsActive = true,
        });
        await h.Db.SaveChangesAsync();

        h.Time.UtcNow = Now.AddMonths(1);
        var repeat = await h.AwaitingPaymentOrderForMerchantAsync(
            activation.MerchantId, activation.SalespersonId, 10, unitPrice: 100m);
        var result = await h.PayAsync(await h.IssueAsync(repeat.Id));
        var merchant = await h.Db.Merchants.SingleAsync(item => item.Id == activation.MerchantId);

        Assert.Equal(3m, result.Commission!.CommissionPercentage);
        Assert.Equal(30m, result.Commission.CommissionAmount);
        Assert.Equal(3, merchant.RepeatCommissionEligibilityMonthsSnapshot);
        Assert.Equal(Now.AddMonths(3), merchant.RepeatCommissionEligibleUntil);

        var newActivation = await h.AwaitingPaymentOrderAsync(
            merchantName: "New Rule Reseller Sdn Bhd",
            registration: "NEW-RULE-REG",
            acquisitionAndRepeat: true,
            quantity: 10);
        await h.PayAsync(await h.IssueAsync(newActivation.Id));
        var newMerchant = await h.Db.Merchants.SingleAsync(
            item => item.Id == newActivation.MerchantId);
        Assert.Equal(5m, newMerchant.RepeatCommissionPercentageSnapshot);
        Assert.Equal(6, newMerchant.RepeatCommissionEligibilityMonthsSnapshot);
        Assert.Equal(h.Time.UtcNow.AddMonths(6), newMerchant.RepeatCommissionEligibleUntil);
    }

    [Fact]
    public async Task RepeatCommissionUsesTheNormalReversalLifecycle()
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var activation = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 10);
        await h.PayAsync(await h.IssueAsync(activation.Id));
        h.Time.UtcNow = Now.AddMonths(1);
        var repeat = await h.AwaitingPaymentOrderForMerchantAsync(
            activation.MerchantId, activation.SalespersonId, 10);
        var earned = await h.PayAsync(await h.IssueAsync(repeat.Id));

        var reversed = await h.Billing.ReverseCommissionAsync(null, earned.Commission!.Id,
            new ReverseSalesCommissionRequest(
                "Repeat payment invalidated.", earned.Commission.ConcurrencyToken), default);

        Assert.Equal("Reversed", reversed.Status);
        Assert.Equal("Repeat payment invalidated.", reversed.ReversalReason);
        Assert.NotNull(reversed.ReversedAt);
        Assert.Null(reversed.PaidAt);
    }

    [Fact]
    public async Task InactiveSalespersonBlocksActivationButNotAnEstablishedRepeatEntitlement()
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var activation = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 10);
        var salesperson = await h.Db.Salespersons.SingleAsync(item => item.Id == activation.SalespersonId);
        salesperson.IsActive = false;
        await h.Db.SaveChangesAsync();

        var blocked = await h.PayAsync(await h.IssueAsync(activation.Id));
        Assert.Null(blocked.Commission);
        Assert.Null((await h.Db.Merchants.SingleAsync(item => item.Id == activation.MerchantId))
            .FirstQualifyingMerchantOrderId);

        salesperson.IsActive = true;
        await h.Db.SaveChangesAsync();
        h.Time.UtcNow = Now.AddHours(1);
        var qualifying = await h.AwaitingPaymentOrderForMerchantAsync(
            activation.MerchantId, activation.SalespersonId, 10);
        await h.PayAsync(await h.IssueAsync(qualifying.Id));
        salesperson.IsActive = false;
        var merchant = await h.Db.Merchants.SingleAsync(item => item.Id == activation.MerchantId);
        merchant.AssignedSalespersonId = null;
        await h.Db.SaveChangesAsync();
        h.Time.UtcNow = Now.AddMonths(1);
        var repeat = await h.AwaitingPaymentOrderForMerchantAsync(
            activation.MerchantId, null, 10);

        var result = await h.PayAsync(await h.IssueAsync(repeat.Id));
        Assert.Equal("ResellerRepeatPercentage", result.Commission!.CommissionType);
        Assert.Equal(salesperson.Id, result.Commission.SalespersonId);
    }

    [Fact]
    public async Task ReversingAcquisitionDoesNotClearOrRestartTheRelationship()
    {
        using var h = await Harness.CreateAsync();
        await h.SeedResellerRulesAsync();
        var activation = await h.AwaitingPaymentOrderAsync(
            acquisitionAndRepeat: true, quantity: 10);
        var acquisition = await h.PayAsync(await h.IssueAsync(activation.Id));
        await h.Billing.ReverseCommissionAsync(null, acquisition.Commission!.Id,
            new ReverseSalesCommissionRequest("Payment invalidated.", acquisition.Commission.ConcurrencyToken),
            default);

        h.Time.UtcNow = Now.AddMonths(1);
        var repeat = await h.AwaitingPaymentOrderForMerchantAsync(
            activation.MerchantId, activation.SalespersonId, 10);
        var result = await h.PayAsync(await h.IssueAsync(repeat.Id));
        var merchant = await h.Db.Merchants.SingleAsync(item => item.Id == activation.MerchantId);

        Assert.Equal(activation.Id, merchant.FirstQualifyingMerchantOrderId);
        Assert.Equal("ResellerRepeatPercentage", result.Commission!.CommissionType);
        Assert.Single(await h.Db.SalesCommissions.Where(item =>
            item.CommissionType == SalesCommissionType.ResellerAcquisitionBonus).ToListAsync());
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
            MerchantBillingService billing,
            MutableTime time)
        {
            Db = db;
            Sales = sales;
            Billing = billing;
            Time = time;
        }

        public MyPetLinkDbContext Db { get; }
        public MerchantSalesService Sales { get; }
        public MerchantBillingService Billing { get; }
        public MutableTime Time { get; }
        public Guid VariantId { get; private set; }

        public static async Task<Harness> CreateAsync(bool completeIdentity = true)
        {
            var time = new MutableTime(Now);
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
                time);

            var product = new TagProduct { Name = "Wholesale Tag", Slug = "wholesale-tag", IsPublished = true };
            var variant = new TagProductVariant
            {
                TagProduct = product, PublicKey = "WSQR0000000000001", Sku = "WS-QR-1",
                DisplayName = "Lightweight", SupportsQr = true, SupportsNfc = true, TagVariant = "Lightweight",
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
                    audit, time),
                time)
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
            decimal deliveryFee = 0m,
            bool acquisitionAndRepeat = false,
            int quantity = 100,
            decimal unitPrice = 12.50m)
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

            // Most tests in this fixture protect the frozen Phase 2 legacy
            // path. Phase 3C cases opt into the new plan explicitly.
            if (!acquisitionAndRepeat)
            {
                var storedMerchant = await Db.Merchants.SingleAsync(item => item.Id == merchant.Id);
                storedMerchant.CommissionPlan = MerchantCommissionPlan.LegacyPercentage;
                storedMerchant.AcquiredBySalespersonId = null;
                storedMerchant.AcquisitionAttributedAt = null;
                await Db.SaveChangesAsync();
            }

            var quotation = await Sales.CreateQuotationAsync(null, new UpsertQuotationRequest(
                merchant.Id, salespersonId, null, orderDiscount, deliveryFee, null, null,
                [new UpsertQuotationItemRequest(VariantId, quantity, unitPrice)]), default);

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
                paymentDate ?? Time.GetUtcNow(),
                amount ?? invoice.GrandTotal,
                "BankTransfer",
                reference,
                note,
                null,
                concurrencyToken), default);

        public async Task SeedResellerRulesAsync(
            decimal repeatPercentage = 3m,
            int eligibilityMonths = 3,
            DateTimeOffset? effectiveFrom = null)
        {
            var from = effectiveFrom ?? DateTimeOffset.Parse("2026-01-01T00:00:00Z");
            Db.CommissionRules.AddRange(
                AcquisitionRule(10, 19, 50m, from),
                AcquisitionRule(20, 49, 80m, from),
                AcquisitionRule(50, 99, 150m, from),
                AcquisitionRule(100, null, 250m, from),
                new CommissionRule
                {
                    CommissionType = SalesCommissionType.ResellerRepeatPercentage,
                    Percentage = repeatPercentage,
                    EligibilityMonths = eligibilityMonths,
                    Currency = "MYR",
                    EffectiveFrom = from,
                    IsActive = true,
                    CreatedAt = from,
                    UpdatedAt = from,
                });
            await Db.SaveChangesAsync();
        }

        public async Task<MerchantOrderResponse> AwaitingPaymentOrderForMerchantAsync(
            Guid merchantId,
            Guid? salespersonId,
            int quantity,
            decimal unitPrice = 12.50m,
            decimal orderDiscount = 0m,
            decimal deliveryFee = 0m)
        {
            var quotation = await Sales.CreateQuotationAsync(null, new UpsertQuotationRequest(
                merchantId, salespersonId, null, orderDiscount, deliveryFee, null, null,
                [new UpsertQuotationItemRequest(VariantId, quantity, unitPrice)]), default);
            await Sales.TransitionQuotationAsync(null, quotation.Id, MerchantQuotationStatus.Sent, null, default);
            await Sales.TransitionQuotationAsync(null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);
            return (await Sales.ConvertQuotationAsync(null, quotation.Id, null, default)).Order;
        }

        private static CommissionRule AcquisitionRule(
            int min, int? max, decimal amount, DateTimeOffset effectiveFrom) => new()
        {
            CommissionType = SalesCommissionType.ResellerAcquisitionBonus,
            FixedAmount = amount,
            MinQuantity = min,
            MaxQuantity = max,
            Currency = "MYR",
            EffectiveFrom = effectiveFrom,
            IsActive = true,
            CreatedAt = effectiveFrom,
            UpdatedAt = effectiveFrom,
        };

        public void Dispose() => Db.Dispose();
    }

    private sealed class MutableTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => UtcNow;
    }
}
