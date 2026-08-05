using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using UglyToad.PdfPig;

namespace MyPetLink.Api.Tests;

// Covers the three merchant documents by rendering the real PDF and reading
// its text, rather than inspecting internal models. What a merchant actually
// sees is the thing under test.
public sealed class MerchantDocumentServiceTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-08-05T04:00:00Z");

    // ===================== Quotation =====================

    [Fact]
    public async Task Quotation_ShowsTheSellerIdentityItWasIssuedWith()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync();

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.Contains(Squash("GBB Software Solutions"), text);
        Assert.Contains(Squash("202603141718 (AS0515813-P)"), text);
        Assert.Contains(Squash("12 Jalan Teknologi"), text);
        Assert.Contains(Squash("support@mypetlink.com.my"), text);
    }

    [Fact]
    public async Task Quotation_ShowsTheMerchantItWasAddressedTo()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync();

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.Contains(Squash("Happy Paws Sdn Bhd"), text);
        Assert.Contains(Squash("Aina Rahman"), text);
        Assert.Contains(Squash("Jalan Perdana"), text);
    }

    [Fact]
    public async Task Quotation_ShowsEveryLineWithQuantityPriceAndDiscount()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync(twoLines: true, lineDiscount: 50m);

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.Contains(Squash("Wholesale Tag"), text);
        Assert.Contains(Squash("WS-QR-1"), text);
        Assert.Contains(Squash("WS-NFC-1"), text);
        Assert.Contains(Squash("MYR 12.50"), text);
        Assert.Contains(Squash("MYR 50.00"), text);
    }

    [Fact]
    public async Task Quotation_ShowsTotalsIncludingOrderDiscountAndDelivery()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync(orderDiscount: 200m, deliveryFee: 35m);

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.Contains(Squash("Merchandise subtotal"), text);
        Assert.Contains(Squash("MYR 1,250.00"), text);
        Assert.Contains(Squash("Order discount"), text);
        Assert.Contains(Squash("MYR 200.00"), text);
        Assert.Contains(Squash("MYR 35.00"), text);
        Assert.Contains(Squash("MYR 1,085.00"), text);
    }

    [Fact]
    public async Task Quotation_ShowsFreeDeliveryRatherThanAZeroCharge()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync(deliveryFee: 0m);

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.Contains(Squash("Free"), text);
    }

    [Fact]
    public async Task Quotation_ShowsValidUntilAndTheCustomerNotes()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync(customerNotes: "Bulk pricing for your clinic.");

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.Contains(Squash("Valid until"), text);
        Assert.Contains(Squash("Bulk pricing for your clinic."), text);
    }

    [Fact]
    public async Task Quotation_SaysPlainlyThatItIsNotAnInvoiceOrAReceipt()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync();

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.Contains(Squash("Quotation"), text);
        Assert.Contains(Squash("not an invoice and not proof of payment"), text);
    }

    [Fact]
    public async Task Quotation_NeverCarriesInternalNotesOrCommission()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync(
            internalNotes: "Margin is thin, do not discount further.");

        var text = Squash(await h.QuotationTextAsync(quotation.Id));

        Assert.DoesNotContain(Squash("Margin is thin"), text);
        Assert.DoesNotContain(Squash("commission"), text.ToLowerInvariant());
        Assert.DoesNotContain(Squash("RowVersion"), text);
        Assert.DoesNotContain(quotation.Id.ToString("N"), Squash(text));
    }

    [Fact]
    public async Task Quotation_CannotBeProducedWhileItIsStillADraft()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var draft = await h.DraftQuotationAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Documents.GetQuotationAsync(draft.Id));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("quotation_not_issued", error.Code);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(10)]
    [InlineData(20)]
    public async Task Quotation_RendersCleanlyAtRealisticLineCounts(int lines)
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync(lineCount: lines);

        var document = await h.Documents.GetQuotationAsync(quotation.Id);
        using var pdf = PdfDocument.Open(document.Content);

        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(document.Content, 0, 5));
        Assert.True(pdf.NumberOfPages >= 1);
        var text = Squash(ExtractText(document.Content));
        // Every line must survive pagination, not just the ones on page one.
        for (var index = 1; index <= lines; index++)
        {
            Assert.Contains(Squash($"WS-SKU-{index:00}"), text);
        }
    }

    [Fact]
    public async Task Quotation_KeepsLongMerchantAndProductNamesInsideTheDocument()
    {
        using var h = await MerchantDocumentHarness.CreateAsync(
            merchantName: "Extraordinarily Long Veterinary And Grooming Holdings Berhad Malaysia",
            addressLine1: "Lot 12345, Jalan Perindustrian Teknologi Tinggi Seksyen 7 Fasa 3");
        var quotation = await h.SentQuotationAsync(longProductName: true);

        var document = await h.Documents.GetQuotationAsync(quotation.Id);
        var text = Squash(ExtractText(document.Content));

        Assert.Contains(Squash("Extraordinarily Long Veterinary"), text);
        Assert.Contains(Squash("Jalan Perindustrian Teknologi"), text);
        Assert.Contains(Squash("Premium Stainless Steel Engraved"), text);
    }

    // ===================== Invoice =====================

    [Fact]
    public async Task Invoice_ShowsItsNumberDatesAndReferences()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();

        var text = Squash(await h.InvoiceTextAsync(invoice.Id));

        Assert.Contains(Squash("Invoice"), text);
        Assert.Contains(Squash(invoice.InvoiceNumber), text);
        Assert.Contains(Squash(invoice.MerchantOrderNumber), text);
        Assert.Contains(Squash(invoice.SourceQuotationNumber!), text);
        Assert.Contains(Squash("Due on receipt"), text);
    }

    [Fact]
    public async Task Invoice_IsNeverLabelledATaxInvoiceAndAddsNoTax()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();

        var text = Squash(await h.InvoiceTextAsync(invoice.Id));

        Assert.DoesNotContain(Squash("Tax Invoice"), text);
        // The same wording retail documents already use.
        Assert.Contains(Squash("SST"), text);
        Assert.Contains(Squash("Not applicable"), text);
    }

    [Fact]
    public async Task Invoice_ShowsHowToPayWithASafeReference()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();

        var text = Squash(await h.InvoiceTextAsync(invoice.Id));

        Assert.Contains(Squash("Maybank"), text);
        Assert.Contains(Squash("512345678901"), text);
        Assert.Contains(Squash("Payment reference"), text);
        Assert.Contains(Squash(invoice.InvoiceNumber), text);
        Assert.Contains(Squash("quote the invoice number"), text);
    }

    [Fact]
    public async Task Invoice_TotalsMatchTheOrderExactly()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync(orderDiscount: 200m, deliveryFee: 35m);

        var text = Squash(await h.InvoiceTextAsync(invoice.Id));

        Assert.Contains(Squash("MYR 1,250.00"), text);
        Assert.Contains(Squash("MYR 200.00"), text);
        Assert.Contains(Squash("MYR 35.00"), text);
        Assert.Contains(Squash("MYR 1,085.00"), text);
        Assert.Equal(1085m, invoice.GrandTotal);
    }

    [Fact]
    public async Task Invoice_KeepsItsSellerDetailsWhenTheBusinessIdentityChangesLater()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();
        var before = Squash(await h.InvoiceTextAsync(invoice.Id));

        var settings = await h.Db.BusinessIdentitySettings.SingleAsync();
        settings.LegalBusinessName = "Renamed Holdings Sdn Bhd";
        settings.RegisteredAddressLine1 = "99 Somewhere Else";
        settings.BankAccountNumber = "999999999999";
        await h.Db.SaveChangesAsync();

        var after = Squash(await h.InvoiceTextAsync(invoice.Id));

        Assert.Equal(before, after);
        Assert.Contains(Squash("GBB Software Solutions"), after);
        Assert.DoesNotContain(Squash("Renamed Holdings"), after);
        Assert.DoesNotContain(Squash("999999999999"), after);
    }

    [Fact]
    public async Task Invoice_KeepsItsPricesWhenTheCatalogChangesLater()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();

        var variant = await h.Db.TagProductVariants.SingleAsync(item => item.Id == h.VariantId);
        variant.BasePrice = 999m;
        variant.DisplayName = "Renamed Option";
        await h.Db.SaveChangesAsync();

        var text = Squash(await h.InvoiceTextAsync(invoice.Id));

        Assert.Contains(Squash("MYR 12.50"), text);
        Assert.DoesNotContain(Squash("999.00"), text);
        Assert.DoesNotContain(Squash("Renamed Option"), text);
    }

    [Fact]
    public async Task Invoice_NeverCarriesInternalNotesOrCommission()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync(internalNotes: "Chase finance on Friday.");

        var text = Squash(await h.InvoiceTextAsync(invoice.Id));

        Assert.DoesNotContain(Squash("Chase finance"), text);
        Assert.DoesNotContain(Squash("commission"), text.ToLowerInvariant());
        Assert.DoesNotContain(invoice.Id.ToString("N"), text);
    }

    // ===================== Official receipt =====================

    [Fact]
    public async Task Receipt_ShowsItsNumbersAmountAndPaymentDetails()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync();

        var text = Squash(await h.ReceiptTextAsync(paid.Invoice.Id));

        Assert.Contains(Squash("Official Receipt"), text);
        Assert.Contains(Squash(paid.Receipt.ReceiptNumber), text);
        Assert.Contains(Squash(paid.Invoice.InvoiceNumber), text);
        Assert.Contains(Squash(paid.Invoice.MerchantOrderNumber), text);
        Assert.Contains(Squash("Bank transfer"), text);
        Assert.Contains(Squash("PAID"), text);
    }

    [Fact]
    public async Task Receipt_ShowsTheTransactionReferenceWhenTheMerchantGaveOne()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync(reference: "FT26080512345");

        var text = Squash(await h.ReceiptTextAsync(paid.Invoice.Id));

        Assert.Contains(Squash("Transaction reference"), text);
        Assert.Contains(Squash("FT26080512345"), text);
    }

    [Fact]
    public async Task Receipt_OmitsTheTransactionRowEntirelyWhenThereIsNone()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync(reference: null);

        var text = Squash(await h.ReceiptTextAsync(paid.Invoice.Id));

        // A placeholder here would read like a reference the merchant could
        // quote back to their bank.
        Assert.DoesNotContain(Squash("Transaction reference"), text);
        Assert.DoesNotContain(Squash("Not provided"), text);
    }

    [Fact]
    public async Task Receipt_ShowsEveryPaidLineAndTheTotalPaid()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync(twoLines: true, orderDiscount: 200m, deliveryFee: 35m);

        var text = Squash(await h.ReceiptTextAsync(paid.Invoice.Id));

        Assert.Contains(Squash("WS-QR-1"), text);
        Assert.Contains(Squash("WS-NFC-1"), text);
        Assert.Contains(Squash("Total paid"), text);
        Assert.Contains(Squash(paid.Receipt.AmountPaid.ToString("N2")), text);
    }

    [Fact]
    public async Task Receipt_NeverCarriesInternalNotesOrCommission()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync(internalNote: "Reconciled against the June statement.");

        var text = Squash(await h.ReceiptTextAsync(paid.Invoice.Id));

        Assert.DoesNotContain(Squash("Reconciled against"), text);
        Assert.DoesNotContain(Squash("commission"), text.ToLowerInvariant());
        Assert.DoesNotContain(Squash("App_Data"), text);
    }

    [Fact]
    public async Task Receipt_ProducesTheSameDocumentEveryTimeItIsDownloaded()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync();

        var first = await h.Documents.GetReceiptForInvoiceAsync(paid.Invoice.Id);
        var second = await h.Documents.GetReceiptForInvoiceAsync(paid.Invoice.Id);

        Assert.Equal(Squash(ExtractText(first.Content)), Squash(ExtractText(second.Content)));
        Assert.Equal(first.FileName, second.FileName);
        // Downloading is not an event: it must not touch the financial record.
        var invoice = await h.Db.MerchantInvoices.AsNoTracking()
            .SingleAsync(item => item.Id == paid.Invoice.Id);
        Assert.Equal(MerchantInvoiceStatus.Paid, invoice.Status);
    }

    // ===================== Filenames and format =====================

    [Fact]
    public async Task EveryDocumentIsAValidPdfWithASafeFilename()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync();

        var documents = new[]
        {
            await h.Documents.GetInvoiceAsync(paid.Invoice.Id),
            await h.Documents.GetReceiptForInvoiceAsync(paid.Invoice.Id),
        };

        foreach (var document in documents)
        {
            Assert.Equal("application/pdf", document.ContentType);
            Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(document.Content, 0, 5));
            Assert.EndsWith(".pdf", document.FileName);
            Assert.Equal(document.FileName, Path.GetFileName(document.FileName));
            Assert.DoesNotContain('\r', document.FileName);
            Assert.DoesNotContain('\n', document.FileName);
            Assert.True(document.Content.Length is > 1000 and < 4 * 1024 * 1024);
        }
    }

    [Fact]
    public async Task AMissingRecordIsReportedAsNotFound()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();

        var quotation = await Assert.ThrowsAsync<ApiException>(() =>
            h.Documents.GetQuotationAsync(Guid.NewGuid()));
        var invoice = await Assert.ThrowsAsync<ApiException>(() =>
            h.Documents.GetInvoiceAsync(Guid.NewGuid()));
        var receipt = await Assert.ThrowsAsync<ApiException>(() =>
            h.Documents.GetReceiptAsync(Guid.NewGuid()));

        Assert.Equal(404, quotation.StatusCode);
        Assert.Equal(404, invoice.StatusCode);
        Assert.Equal(404, receipt.StatusCode);
    }

    internal static string ExtractText(byte[] pdf)
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
    // whitespace-free form.
    internal static string Squash(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            if (!char.IsWhiteSpace(character))
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }
}
