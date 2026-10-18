using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

[Collection("PDF document rendering")]
public sealed class ConsignmentCorrectnessTests
{
    [Theory]
    [InlineData("24.905", "0", "0", "0")]
    [InlineData("24.90", "0.001", "0", "0")]
    [InlineData("24.90", "0", "0.005", "0")]
    [InlineData("24.90", "0", "0", "0.005")]
    public async Task QuotationRejectsExcessPrecisionBeforeCreatingInconsistentMoney(string price,string lineDiscount,string discount,string delivery)
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        static decimal Money(string text) => decimal.Parse(text,System.Globalization.CultureInfo.InvariantCulture);
        var failure = await Assert.ThrowsAsync<ApiException>(() => h.Sales.CreateQuotationAsync(null,
            new(h.MerchantId,null,null,Money(discount),Money(delivery),null,null,
                [new(h.VariantId,10,Money(price),Money(lineDiscount))]),default));
        Assert.Equal("validation_failed",failure.Code);
        Assert.Empty(h.Db.MerchantQuotations);
    }

    [Fact]
    public async Task CancelledInvoiceHasNoPayableInstructionsAndCannotBeMistakenForReplacement()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();
        await h.Billing.CancelInvoiceAsync(null,invoice.Id,invoice.ConcurrencyToken,default);
        var text = MerchantDocumentServiceTests.Squash(await h.InvoiceTextAsync(invoice.Id));
        Assert.Contains("Cancelled",text);
        Assert.Contains("Donotmakepayment",text);
        Assert.DoesNotContain("Awaitingpayment",text);
        Assert.DoesNotContain("Amountdue",text);
        Assert.DoesNotContain("Paymentreference",text);
        var replacement = await h.Billing.IssueInvoiceAsync(null,invoice.MerchantOrderId,new(),default);
        Assert.NotEqual(invoice.InvoiceNumber,replacement.InvoiceNumber);
    }
}
