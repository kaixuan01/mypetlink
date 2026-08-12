using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public class MerchantSalesServiceTests
{
    // ===================== Money =====================

    [Fact]
    public void LineSubtotalIsPriceTimesQuantityLessTheLineDiscount()
    {
        var line = MerchantSalesTotals.CalculateLine(
            new MerchantSalesTotals.LineInput(Quantity: 100, WholesaleUnitPrice: 12.50m, LineDiscount: 50m));

        Assert.Equal(1250m, line.GrossLineAmount);
        Assert.Equal(1200m, line.LineSubtotal);
    }

    [Fact]
    public void GrandTotalSubtractsTheOrderDiscountOnceAndAddsDelivery()
    {
        var totals = MerchantSalesTotals.Calculate(
            [
                new MerchantSalesTotals.LineInput(100, 12.50m, 50m),   // 1200.00
                new MerchantSalesTotals.LineInput(50, 20.00m, 0m),     // 1000.00
            ],
            orderDiscount: 200m,
            deliveryFee: 35m);

        Assert.Equal(2200m, totals.MerchandiseSubtotal);
        Assert.Equal(200m, totals.DiscountTotal);
        Assert.Equal(35m, totals.DeliveryFee);
        // A line discount already reduced its line; the order discount applies
        // once more at the top. Nothing is subtracted twice.
        Assert.Equal(2035m, totals.GrandTotal);
    }

    [Fact]
    public void MoneyRoundsToSenSoATotalMatchesTheLinesByHand()
    {
        var totals = MerchantSalesTotals.Calculate(
            [new MerchantSalesTotals.LineInput(3, 0.335m, 0m)],
            orderDiscount: 0m,
            deliveryFee: 0m);

        Assert.Equal(1.01m, totals.MerchandiseSubtotal);
        Assert.Equal(1.01m, totals.GrandTotal);
    }

    // ===================== Merchants =====================

    [Fact]
    public async Task CreatingAMerchantAllocatesACodeAndDefaultsToPrepaid()
    {
        using var h = Harness.Create();

        var merchant = await h.CreateMerchantAsync();

        Assert.Equal("MPL-MER-00001", merchant.MerchantCode);
        Assert.Equal(MerchantPaymentTerm.Prepaid, merchant.PaymentTerm);
        Assert.True(merchant.IsActive);
    }

    [Fact]
    public async Task MerchantCodesAreSequentialAndUnique()
    {
        using var h = Harness.Create();

        var first = await h.CreateMerchantAsync(name: "Alpha Pets", registration: "AS1111111-A");
        var second = await h.CreateMerchantAsync(name: "Beta Grooming", registration: "AS2222222-B");

        Assert.Equal("MPL-MER-00001", first.MerchantCode);
        Assert.Equal("MPL-MER-00002", second.MerchantCode);
    }

    [Fact]
    public async Task DeliveryAddressMirrorsBillingWhenAskedTo()
    {
        using var h = Harness.Create();

        var merchant = await h.CreateMerchantAsync();

        Assert.True(merchant.DeliveryAddressSameAsBilling);
        Assert.Equal(merchant.BillingAddress.AddressLine1, merchant.DeliveryAddress.AddressLine1);
        Assert.Equal(merchant.BillingAddress.Postcode, merchant.DeliveryAddress.Postcode);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("missing@domain")]
    [InlineData("")]
    public async Task AnInvalidContactEmailIsRejected(string email)
    {
        using var h = Harness.Create();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.CreateMerchantAsync(null, h.MerchantRequest(email: email), default));

        Assert.Equal(400, error.StatusCode);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("+60-12")]
    public async Task AnInvalidContactPhoneIsRejected(string phone)
    {
        using var h = Harness.Create();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.CreateMerchantAsync(null, h.MerchantRequest(phone: phone), default));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task ASecondMerchantCannotReuseABusinessRegistrationNumber()
    {
        using var h = Harness.Create();
        await h.CreateMerchantAsync(registration: "AS0515813-P");

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateMerchantAsync(
            null, h.MerchantRequest(name: "Copycat", registration: "AS0515813-P"), default));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("merchant_registration_duplicate", error.Code);
    }

    [Fact]
    public async Task DuplicateRegistrationDetectionIgnoresCaseAndPunctuation()
    {
        using var h = Harness.Create();
        await h.CreateMerchantAsync(registration: "AS 0515813-P");

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateMerchantAsync(
            null, h.MerchantRequest(name: "Copycat", registration: "as0515813p"), default));

        Assert.Equal("merchant_registration_duplicate", error.Code);
    }

    [Fact]
    public async Task SeveralMerchantsMayLeaveTheRegistrationNumberBlank()
    {
        using var h = Harness.Create();

        await h.CreateMerchantAsync(name: "One", registration: null);
        var second = await h.CreateMerchantAsync(name: "Two", registration: null);

        Assert.Equal("MPL-MER-00002", second.MerchantCode);
    }

    [Fact]
    public async Task DeactivatingAMerchantIsIdempotent()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var once = await h.Service.SetMerchantActiveAsync(null, merchant.Id, false, null, default);
        var twice = await h.Service.SetMerchantActiveAsync(null, merchant.Id, false, null, default);

        Assert.False(once.IsActive);
        Assert.False(twice.IsActive);
    }

    [Fact]
    public async Task AStaleEditTokenIsRefused()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.UpdateMerchantAsync(
            null, merchant.Id,
            h.MerchantRequest(name: "Renamed") with { ConcurrencyToken = Convert.ToBase64String([9, 9, 9, 9]) },
            default));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("concurrency_conflict", error.Code);
    }

    // ===================== Salespersons =====================

    [Fact]
    public async Task CreatingASalespersonAllocatesASequentialCode()
    {
        using var h = Harness.Create();

        var first = await h.CreateSalespersonAsync();
        var second = await h.CreateSalespersonAsync(name: "Second Rep");

        Assert.Equal("MPL-SALES-001", first.SalespersonCode);
        Assert.Equal("MPL-SALES-002", second.SalespersonCode);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(100.01)]
    public async Task CommissionOutsideZeroToOneHundredIsRejected(decimal percentage)
    {
        using var h = Harness.Create();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateSalespersonAsync(
            null,
            new UpsertSalespersonRequest("Rep", null, null, percentage, null),
            default));

        Assert.Equal(400, error.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(100)]
    public async Task CommissionAtTheBoundariesIsAccepted(decimal percentage)
    {
        using var h = Harness.Create();

        var rep = await h.Service.CreateSalespersonAsync(
            null, new UpsertSalespersonRequest("Rep", null, null, percentage, null), default);

        Assert.Equal(percentage, rep.DefaultCommissionPercentage);
    }

    [Fact]
    public async Task AnInactiveSalespersonCannotBeAttachedToANewMerchant()
    {
        using var h = Harness.Create();
        var rep = await h.CreateSalespersonAsync();
        await h.Service.SetSalespersonActiveAsync(null, rep.Id, false, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateMerchantAsync(
            null, h.MerchantRequest(salespersonId: rep.Id), default));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task AnInactiveSalespersonStaysOnRecordsThatAlreadyNameThem()
    {
        using var h = Harness.Create();
        var rep = await h.CreateSalespersonAsync();
        var merchant = await h.CreateMerchantAsync(salespersonId: rep.Id);
        var quotation = await h.CreateQuotationAsync(merchant.Id, salespersonId: rep.Id);

        await h.Service.SetSalespersonActiveAsync(null, rep.Id, false, null, default);

        var reloaded = await h.Service.GetQuotationAsync(quotation.Id, default);
        Assert.Equal("MPL-SALES-001", reloaded.SalespersonCode);
        Assert.Equal("First Rep", reloaded.SalespersonName);
    }

    // ===================== Quotations =====================

    [Fact]
    public async Task AQuotationNumberCarriesTheMalaysianDateAndADailySequence()
    {
        using var h = Harness.Create(new DateTimeOffset(2026, 8, 5, 2, 0, 0, TimeSpan.Zero));
        var merchant = await h.CreateMerchantAsync();

        var quotation = await h.CreateQuotationAsync(merchant.Id);

        // 02:00 UTC is 10:00 in Malaysia on the same day.
        Assert.Equal("MPL-QT-260805-0001", quotation.QuotationNumber);
    }

    [Fact]
    public async Task ProductDetailsComeFromTheCatalogNotTheRequest()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var quotation = await h.CreateQuotationAsync(merchant.Id);

        var line = Assert.Single(quotation.Items);
        Assert.Equal("Wholesale Tag", line.ProductName);
        Assert.Equal("WS-QR-1", line.SkuCode);
        Assert.True(line.SupportsQr);
    }

    [Fact]
    public async Task TheServerCalculatesTotalsFromItsOwnLineMath()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var quotation = await h.Service.CreateQuotationAsync(null, new UpsertQuotationRequest(
            merchant.Id, null, null,
            DiscountTotal: 100m,
            DeliveryFee: 25m,
            CustomerNotes: null, InternalNotes: null,
            Items:
            [
                new UpsertQuotationItemRequest(h.VariantId, 200, 10m, 0m),
                new UpsertQuotationItemRequest(h.SecondVariantId, 100, 15m, 50m),
            ]), default);

        Assert.Equal(2000m + 1450m, quotation.MerchandiseSubtotal);
        Assert.Equal(100m, quotation.DiscountTotal);
        Assert.Equal(25m, quotation.DeliveryFee);
        Assert.Equal(3375m, quotation.GrandTotal);
    }

    [Fact]
    public async Task AQuotationNeedsAtLeastOneLine()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(
            null,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null, []),
            default));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task AnUnknownTagOptionIsRejected()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(
            null,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(Guid.NewGuid(), 1, 10m)]),
            default));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task ALineDiscountCannotExceedItsOwnLine()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(
            null,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(h.VariantId, 2, 10m, LineDiscount: 25m)]),
            default));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task AnOrderDiscountCannotExceedTheMerchandiseSubtotal()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(
            null,
            new UpsertQuotationRequest(merchant.Id, null, null, DiscountTotal: 9999m, DeliveryFee: 0m,
                CustomerNotes: null, InternalNotes: null,
                Items: [new UpsertQuotationItemRequest(h.VariantId, 1, 10m)]),
            default));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task NegativeQuantityPriceOrFeesAreRejected()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(null,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(h.VariantId, 0, 10m)]), default));

        await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(null,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(h.VariantId, 1, -1m)]), default));

        await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(null,
            new UpsertQuotationRequest(merchant.Id, null, null, -5m, 0m, null, null,
                [new UpsertQuotationItemRequest(h.VariantId, 1, 10m)]), default));

        await Assert.ThrowsAsync<ApiException>(() => h.Service.CreateQuotationAsync(null,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, -5m, null, null,
                [new UpsertQuotationItemRequest(h.VariantId, 1, 10m)]), default));
    }

    [Fact]
    public async Task AnInactiveMerchantCannotReceiveANewQuotation()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        await h.Service.SetMerchantActiveAsync(null, merchant.Id, false, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.CreateQuotationAsync(merchant.Id));

        Assert.Equal(400, error.StatusCode);
    }

    [Fact]
    public async Task ADraftQuotationCanBeRepriced()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);

        var updated = await h.Service.UpdateQuotationAsync(null, quotation.Id,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(h.VariantId, 10, 9m)]), default);

        Assert.Equal(90m, updated.GrandTotal);
    }

    [Fact]
    public async Task ASentQuotationsMoneyIsFrozen()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);
        await h.Service.TransitionQuotationAsync(null, quotation.Id, MerchantQuotationStatus.Sent, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.UpdateQuotationAsync(
            null, quotation.Id,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(h.VariantId, 1, 1m)]), default));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("quotation_not_editable", error.Code);
    }

    // ============ Catalog sellability on new quotation lines ============
    // The Admin editor hides retired SKUs, but the server owns the rule: a SKU
    // the shop cannot sell is not a SKU a merchant can be quoted for either.

    [Fact]
    public async Task ASellableSkuIsAcceptedOnANewQuotationLine()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var quotation = await h.CreateQuotationAsync(merchant.Id);

        Assert.Single(quotation.Items);
        Assert.Equal("WS-QR-1", quotation.Items.Single().SkuCode);
    }

    [Theory]
    [InlineData("inactive")]
    [InlineData("not-purchasable")]
    [InlineData("archived")]
    [InlineData("product-archived")]
    [InlineData("product-unpublished")]
    public async Task ANonSellableSkuIsRefusedOnANewQuotationLine(string state)
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        await h.MakeVariantNonSellableAsync(h.VariantId, state);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.CreateQuotationAsync(merchant.Id));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("merchant_sku_unavailable", error.Code);
        Assert.Equal(
            "This tag option is no longer available for new quotations. Choose another option.",
            error.Message);
        // Named per line so the editor can highlight the offending row.
        Assert.True(error.Details!.ContainsKey("items[0].productVariantId"));
        // Nothing about the catalog's internal state leaks into the message.
        Assert.DoesNotContain("Archived", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Purchasable", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AnUnknownSkuStillReportsThatItNoLongerExists()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Service.CreateQuotationAsync(null, new UpsertQuotationRequest(
                merchant.Id, null, null, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(Guid.NewGuid(), 1, 10m)]), default));

        Assert.Equal(400, error.StatusCode);
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task ADraftCannotBeSavedAfterItsSkuIsRetired()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);

        await h.MakeVariantNonSellableAsync(h.VariantId, "archived");

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Service.UpdateQuotationAsync(null, quotation.Id,
                new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
                    [new UpsertQuotationItemRequest(h.VariantId, 2, 10m)]), default));

        Assert.Equal("merchant_sku_unavailable", error.Code);
    }

    [Fact]
    public async Task ADraftCannotBeSentAfterItsSkuIsRetired()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);

        await h.MakeVariantNonSellableAsync(h.VariantId, "archived");

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Service.TransitionQuotationAsync(
                null, quotation.Id, MerchantQuotationStatus.Sent, null, default));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("merchant_sku_unavailable", error.Code);

        // The refusal leaves the draft exactly as it was — no half-sent state.
        var after = await h.Service.GetQuotationAsync(quotation.Id, default);
        Assert.Equal(MerchantQuotationStatus.Draft, after.Status);
        Assert.Null(after.SentAt);
    }

    [Fact]
    public async Task AQuotationSentBeforeArchivalStaysReadableAndCanStillProgress()
    {
        using var h = Harness.Create();
        var sent = await h.SentQuotationAsync();

        // The SKU is retired only after the merchant already has the offer.
        await h.MakeVariantNonSellableAsync(h.VariantId, "archived");

        var reread = await h.Service.GetQuotationAsync(sent.Id, default);
        Assert.Equal("WS-QR-1", reread.Items.Single().SkuCode);
        Assert.Equal("Wholesale Tag", reread.Items.Single().ProductName);

        // Already a commitment: accepting and converting must not be blocked by
        // a catalog change that happened afterwards.
        await h.Service.TransitionQuotationAsync(
            null, sent.Id, MerchantQuotationStatus.Accepted, null, default);
        var converted = await h.Service.ConvertQuotationAsync(null, sent.Id, null, default);

        Assert.Equal("WS-QR-1", converted.Order.Items.Single().SkuCode);
        Assert.Equal("Wholesale Tag", converted.Order.Items.Single().ProductName);
    }

    // ===================== Transitions =====================

    [Theory]
    [InlineData(MerchantQuotationStatus.Sent)]
    [InlineData(MerchantQuotationStatus.Cancelled)]
    public async Task ADraftMayBeSentOrCancelled(MerchantQuotationStatus target)
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);

        var result = await h.Service.TransitionQuotationAsync(null, quotation.Id, target, null, default);

        Assert.Equal(target, result.Status);
    }

    [Theory]
    [InlineData(MerchantQuotationStatus.Accepted)]
    [InlineData(MerchantQuotationStatus.Rejected)]
    [InlineData(MerchantQuotationStatus.Expired)]
    [InlineData(MerchantQuotationStatus.Cancelled)]
    public async Task ASentQuotationMayReachEveryOutcome(MerchantQuotationStatus target)
    {
        using var h = Harness.Create();
        var quotation = await h.SentQuotationAsync();

        var result = await h.Service.TransitionQuotationAsync(null, quotation.Id, target, null, default);

        Assert.Equal(target, result.Status);
    }

    [Fact]
    public async Task EachTransitionStampsItsOwnTimestamp()
    {
        using var h = Harness.Create();
        var quotation = await h.SentQuotationAsync();

        var accepted = await h.Service.TransitionQuotationAsync(
            null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);

        Assert.NotNull(accepted.SentAt);
        Assert.NotNull(accepted.AcceptedAt);
        Assert.Null(accepted.RejectedAt);
    }

    [Theory]
    [InlineData(MerchantQuotationStatus.Accepted)]
    [InlineData(MerchantQuotationStatus.Rejected)]
    [InlineData(MerchantQuotationStatus.Expired)]
    public async Task ADraftCannotSkipStraightToAnOutcome(MerchantQuotationStatus target)
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Service.TransitionQuotationAsync(null, quotation.Id, target, null, default));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("invalid_quotation_transition", error.Code);
    }

    [Fact]
    public async Task ARejectedQuotationIsFinal()
    {
        using var h = Harness.Create();
        var quotation = await h.SentQuotationAsync();
        await h.Service.TransitionQuotationAsync(null, quotation.Id, MerchantQuotationStatus.Rejected, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.TransitionQuotationAsync(
            null, quotation.Id, MerchantQuotationStatus.Accepted, null, default));

        Assert.Equal("invalid_quotation_transition", error.Code);
    }

    [Fact]
    public async Task RepeatingATransitionSucceedsWithoutChangingAnything()
    {
        using var h = Harness.Create();
        var quotation = await h.SentQuotationAsync();

        var once = await h.Service.TransitionQuotationAsync(
            null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);
        var twice = await h.Service.TransitionQuotationAsync(
            null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);

        Assert.Equal(MerchantQuotationStatus.Accepted, twice.Status);
        Assert.Equal(once.AcceptedAt, twice.AcceptedAt);
    }

    // ===================== Conversion =====================

    [Fact]
    public async Task AnAcceptedQuotationBecomesAnOrderWithIdenticalMoney()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();

        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        Assert.False(result.AlreadyConverted);
        Assert.StartsWith("MPL-B2B-ORD-", result.Order.MerchantOrderNumber);
        Assert.Equal(quotation.MerchandiseSubtotal, result.Order.MerchandiseSubtotal);
        Assert.Equal(quotation.DiscountTotal, result.Order.DiscountTotal);
        Assert.Equal(quotation.DeliveryFee, result.Order.DeliveryFee);
        Assert.Equal(quotation.GrandTotal, result.Order.GrandTotal);
        Assert.Equal(MerchantOrderPaymentStatus.AwaitingPayment, result.Order.PaymentStatus);
    }

    [Fact]
    public async Task ConversionCarriesTheApprovedPricesNotTodaysRetailPrice()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync(unitPrice: 7.25m);

        // Retail moves after the quotation was agreed.
        var variant = await h.Db.TagProductVariants.SingleAsync(v => v.Id == h.VariantId);
        variant.BasePrice = 99.90m;
        await h.Db.SaveChangesAsync();

        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        Assert.Equal(7.25m, Assert.Single(result.Order.Items).WholesaleUnitPrice);
    }

    [Fact]
    public async Task ConversionLinksBothSidesAndMarksTheQuotationConverted()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();

        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);
        var reloaded = await h.Service.GetQuotationAsync(quotation.Id, default);

        Assert.Equal(MerchantQuotationStatus.Converted, reloaded.Status);
        Assert.Equal(result.Order.Id, reloaded.ConvertedMerchantOrderId);
        Assert.NotNull(reloaded.ConvertedAt);
        Assert.Equal(quotation.Id, result.Order.SourceQuotationId);
    }

    [Fact]
    public async Task ConvertingTwiceReturnsTheSameOrder()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();

        var first = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);
        var second = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        Assert.False(first.AlreadyConverted);
        Assert.True(second.AlreadyConverted);
        Assert.Equal(first.Order.Id, second.Order.Id);
        Assert.Equal(1, await h.Db.MerchantOrders.CountAsync());
    }

    [Theory]
    [InlineData(MerchantQuotationStatus.Draft)]
    [InlineData(MerchantQuotationStatus.Sent)]
    public async Task OnlyAnAcceptedQuotationConverts(MerchantQuotationStatus status)
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);

        if (status == MerchantQuotationStatus.Sent)
        {
            await h.Service.TransitionQuotationAsync(
                null, quotation.Id, MerchantQuotationStatus.Sent, null, default);
        }

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.ConvertQuotationAsync(null, quotation.Id, null, default));

        Assert.Equal("quotation_not_convertible", error.Code);
        Assert.Equal(0, await h.Db.MerchantOrders.CountAsync());
    }

    [Fact]
    public async Task ARejectedQuotationCannotConvert()
    {
        using var h = Harness.Create();
        var quotation = await h.SentQuotationAsync();
        await h.Service.TransitionQuotationAsync(null, quotation.Id, MerchantQuotationStatus.Rejected, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.ConvertQuotationAsync(null, quotation.Id, null, default));

        Assert.Equal("quotation_not_convertible", error.Code);
    }

    [Fact]
    public async Task AQuotationPastItsValidUntilDateCannotConvert()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync(validUntil: DateTimeOffset.UtcNow.AddDays(-1));

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.ConvertQuotationAsync(null, quotation.Id, null, default));

        Assert.Equal("quotation_expired", error.Code);
    }

    [Fact]
    public async Task AMerchantDeactivatedAfterAcceptanceBlocksConversion()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();
        await h.Service.SetMerchantActiveAsync(null, quotation.MerchantId, false, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.ConvertQuotationAsync(null, quotation.Id, null, default));

        Assert.Equal("merchant_inactive", error.Code);
        Assert.Equal(0, await h.Db.MerchantOrders.CountAsync());
    }

    [Fact]
    public async Task AnOrderKeepsItsSnapshotsWhenTheMerchantIsRenamedLater()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();
        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        var merchant = await h.Db.Merchants.SingleAsync(m => m.Id == quotation.MerchantId);
        merchant.LegalBusinessName = "Renamed Holdings Sdn Bhd";
        merchant.BillingCity = "Somewhere Else";
        await h.Db.SaveChangesAsync();

        var reloaded = await h.Service.GetMerchantOrderAsync(result.Order.Id, default);

        Assert.Equal("Happy Paws Sdn Bhd", reloaded.MerchantLegalName);
        Assert.Equal("Ampang", reloaded.BillingAddress.City);
    }

    [Fact]
    public async Task ConversionRecordsAuditOnBothSides()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();

        await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        var actions = await h.Db.AuditLogs.Select(log => log.Action).ToListAsync();
        Assert.Contains("quotation.converted", actions);
        Assert.Contains("merchant-order.created", actions);
    }

    // ===================== Merchant orders =====================

    [Fact]
    public async Task AnUnpaidOrderCanBeCancelled()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();
        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        var cancelled = await h.Service.CancelMerchantOrderAsync(null, result.Order.Id, null, default);

        Assert.Equal(MerchantOrderPaymentStatus.Cancelled, cancelled.PaymentStatus);
        Assert.NotNull(cancelled.CancelledAt);
    }

    [Fact]
    public async Task CancellingTwiceIsHarmless()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();
        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        var once = await h.Service.CancelMerchantOrderAsync(null, result.Order.Id, null, default);
        var twice = await h.Service.CancelMerchantOrderAsync(null, result.Order.Id, null, default);

        Assert.Equal(once.CancelledAt, twice.CancelledAt);
    }

    [Fact]
    public async Task AConfirmedOrderCannotBeCancelledInThisPhase()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();
        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        // Payment recording arrives in a later commit; set the state directly.
        var order = await h.Db.MerchantOrders.SingleAsync(o => o.Id == result.Order.Id);
        order.PaymentStatus = MerchantOrderPaymentStatus.PaymentConfirmed;
        await h.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => h.Service.CancelMerchantOrderAsync(null, result.Order.Id, null, default));

        Assert.Equal("merchant_order_not_cancellable", error.Code);
    }

    [Fact]
    public async Task OrdersCanBeFilteredByPaymentStatusAndMerchant()
    {
        using var h = Harness.Create();
        var quotation = await h.AcceptedQuotationAsync();
        var result = await h.Service.ConvertQuotationAsync(null, quotation.Id, null, default);

        var (awaiting, awaitingTotal) = await h.Service.ListMerchantOrdersAsync(
            1, 20, null, MerchantOrderPaymentStatus.AwaitingPayment, null, null, null, null,
            null, null, null, default);
        var (cancelled, cancelledTotal) = await h.Service.ListMerchantOrdersAsync(
            1, 20, null, MerchantOrderPaymentStatus.Cancelled, null, null, null, null,
            null, null, null, default);

        Assert.Equal(1, awaitingTotal);
        Assert.Equal(result.Order.Id, Assert.Single(awaiting).Id);
        Assert.Equal(0, cancelledTotal);
    }

    [Fact]
    public async Task QuotationsCanBeSearchedByNumber()
    {
        using var h = Harness.Create();
        var merchant = await h.CreateMerchantAsync();
        var quotation = await h.CreateQuotationAsync(merchant.Id);

        var (items, total) = await h.Service.ListQuotationsAsync(
            1, 20, quotation.QuotationNumber, null, null, null, null, null, null, default);

        Assert.Equal(1, total);
        Assert.Equal(quotation.Id, Assert.Single(items).Id);
    }

    // ===================== Harness =====================

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db, MerchantSalesService service, Guid variantId, Guid secondVariantId)
        {
            Db = db;
            Service = service;
            VariantId = variantId;
            SecondVariantId = secondVariantId;
        }

        public MyPetLinkDbContext Db { get; }
        public MerchantSalesService Service { get; }
        public Guid VariantId { get; }
        public Guid SecondVariantId { get; }

        public static Harness Create(DateTimeOffset? now = null)
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options);

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
            // Sending a quotation freezes the seller identity, so the harness
            // needs the same configured business a real deployment has.
            db.BusinessIdentitySettings.Add(new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId,
                BrandName = "MyPetLink",
                LegalBusinessName = "GBB Software Solutions",
                BusinessRegistrationNumber = "202603141718 (AS0515813-P)",
                RegisteredAddressLine1 = "12 Jalan Teknologi 3/1",
                RegisteredPostcode = "57000",
                RegisteredCity = "Kuala Lumpur",
                RegisteredState = "Kuala Lumpur",
                RegisteredCountry = "Malaysia",
                SupportEmail = "support@mypetlink.com.my",
                RowVersion = [1, 2, 3],
            });
            db.SaveChanges();

            var time = now.HasValue
                ? new FixedTimeProvider(now.Value)
                : (TimeProvider)TimeProvider.System;

            var audit = new AuditLogService(db, new HttpContextAccessor());
            var service = new MerchantSalesService(
                db, new DocumentNumberService(db),
                new BusinessIdentityService(db, audit, time), audit, time);

            return new Harness(db, service, variant.Id, second.Id);
        }

        public UpsertMerchantRequest MerchantRequest(
            string name = "Happy Paws Sdn Bhd",
            string email = "orders@happypaws.example",
            string phone = "+60123456789",
            string? registration = "AS0515813-P",
            Guid? salespersonId = null) =>
            new(name, "Happy Paws", registration, null, null,
                "Aina Rahman", email, phone,
                new MerchantAddressDto("12 Jalan Perdana", null, "68000", "Ampang", "Selangor", "Malaysia"),
                DeliveryAddressSameAsBilling: true, DeliveryAddress: null,
                AssignedSalespersonId: salespersonId, InternalNotes: "Pays on time.");

        public Task<MerchantResponse> CreateMerchantAsync(
            string name = "Happy Paws Sdn Bhd",
            string? registration = "AS0515813-P",
            Guid? salespersonId = null) =>
            Service.CreateMerchantAsync(null,
                MerchantRequest(name: name, registration: registration, salespersonId: salespersonId), default);

        public Task<SalespersonResponse> CreateSalespersonAsync(string name = "First Rep") =>
            Service.CreateSalespersonAsync(null,
                new UpsertSalespersonRequest(name, "rep@example.com", "+60123456700", 5m, null), default);

        public Task<QuotationResponse> CreateQuotationAsync(
            Guid merchantId,
            Guid? salespersonId = null,
            decimal unitPrice = 12.50m,
            DateTimeOffset? validUntil = null) =>
            Service.CreateQuotationAsync(null, new UpsertQuotationRequest(
                merchantId, salespersonId, validUntil, 0m, 0m, null, null,
                [new UpsertQuotationItemRequest(VariantId, 100, unitPrice)]), default);

        /// <summary>
        /// Puts one variant into a state the catalog treats as not sellable,
        /// mirroring what the catalog service does for each case.
        /// </summary>
        public async Task MakeVariantNonSellableAsync(Guid variantId, string state)
        {
            var variant = await Db.TagProductVariants
                .Include(item => item.TagProduct)
                .SingleAsync(item => item.Id == variantId);

            switch (state)
            {
                case "inactive":
                    variant.IsActive = false;
                    break;
                case "not-purchasable":
                    variant.IsPurchasable = false;
                    break;
                case "archived":
                    // ArchiveVariantAsync clears all three together.
                    variant.ArchivedAt = DateTimeOffset.UtcNow;
                    variant.IsActive = false;
                    variant.IsPurchasable = false;
                    break;
                case "product-archived":
                    // ArchiveProductAsync unpublishes and de-lists its SKUs.
                    variant.TagProduct.IsArchived = true;
                    variant.TagProduct.IsPublished = false;
                    break;
                case "product-unpublished":
                    variant.TagProduct.IsPublished = false;
                    break;
                default:
                    throw new ArgumentOutOfRangeException(nameof(state), state, "Unknown SKU state.");
            }

            await Db.SaveChangesAsync();
        }

        public async Task<QuotationResponse> SentQuotationAsync()
        {
            var merchant = await CreateMerchantAsync();
            var quotation = await CreateQuotationAsync(merchant.Id);
            return await Service.TransitionQuotationAsync(
                null, quotation.Id, MerchantQuotationStatus.Sent, null, default);
        }

        public async Task<QuotationResponse> AcceptedQuotationAsync(
            decimal unitPrice = 12.50m, DateTimeOffset? validUntil = null)
        {
            var merchant = await CreateMerchantAsync();
            var quotation = await CreateQuotationAsync(merchant.Id, unitPrice: unitPrice, validUntil: validUntil);
            await Service.TransitionQuotationAsync(
                null, quotation.Id, MerchantQuotationStatus.Sent, null, default);
            return await Service.TransitionQuotationAsync(
                null, quotation.Id, MerchantQuotationStatus.Accepted, null, default);
        }

        public void Dispose() => Db.Dispose();
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
