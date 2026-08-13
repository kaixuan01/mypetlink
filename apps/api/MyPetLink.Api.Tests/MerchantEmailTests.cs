using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

// The three merchant emails, checked as a merchant would receive them: the
// rendered HTML and plain text, and the attachment actually resolved at send
// time. Nothing is asserted against internal DTOs.
[Collection("PDF document rendering")]
public sealed class MerchantEmailTests
{
    // ===================== Quotation =====================

    [Fact]
    public async Task QuotationEmail_IsAddressedToTheContactOnTheQuotation()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync();

        var result = await h.Emails.QueueQuotationAsync(null, quotation.Id);
        var message = await h.OutboxAsync(EmailMessageType.MerchantQuotation);

        Assert.False(result.AlreadyQueued);
        Assert.Equal("orders@happypaws.example", message.RecipientEmail);
        Assert.Equal($"MyPetLink Quotation {quotation.QuotationNumber}", message.Subject);
    }

    [Fact]
    public async Task QuotationEmail_ShowsTheMerchantNumberValidityAndTotal()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync(orderDiscount: 200m, deliveryFee: 35m);
        await h.Emails.QueueQuotationAsync(null, quotation.Id);

        var rendered = h.Renderer.Render(await h.OutboxAsync(EmailMessageType.MerchantQuotation));

        foreach (var body in new[] { rendered.HtmlBody, rendered.TextBody })
        {
            Assert.Contains("Happy Paws Sdn Bhd", body);
            Assert.Contains(quotation.QuotationNumber, body);
            Assert.Contains("MYR 1,085.00", body);
            Assert.Contains("Due on receipt", body);
            Assert.Contains("support@mypetlink.com.my", body);
        }
    }

    [Fact]
    public async Task QuotationEmail_CarriesExactlyOneQuotationPdf()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync();
        await h.Emails.QueueQuotationAsync(null, quotation.Id);

        var attachments = await h.Attachments.ResolveAsync(
            await h.OutboxAsync(EmailMessageType.MerchantQuotation));

        var attachment = Assert.Single(attachments);
        Assert.Equal("application/pdf", attachment.ContentType);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(attachment.Content, 0, 5));
        Assert.Contains(quotation.QuotationNumber.Replace("-", ""),
            attachment.FileName.Replace("-", ""));
    }

    [Fact]
    public async Task QuotationEmail_CannotBeSentForADraft()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var draft = await h.DraftQuotationAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Emails.QueueQuotationAsync(null, draft.Id));

        Assert.Equal(409, error.StatusCode);
        Assert.Empty(await h.Db.EmailOutbox.ToListAsync());
    }

    [Fact]
    public async Task QuotationEmail_IsQueuedOnceHoweverOftenItIsAskedFor()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync();

        var first = await h.Emails.QueueQuotationAsync(null, quotation.Id);
        var second = await h.Emails.QueueQuotationAsync(null, quotation.Id);

        Assert.False(first.AlreadyQueued);
        Assert.True(second.AlreadyQueued);
        Assert.Equal(first.OutboxId, second.OutboxId);
        Assert.Equal(1, await h.Db.EmailOutbox.CountAsync());
    }

    // ===================== Invoice =====================

    [Fact]
    public async Task InvoiceEmail_ShowsWhatIsOwedAndHowToPay()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync(orderDiscount: 200m, deliveryFee: 35m);
        await h.Emails.QueueInvoiceAsync(null, invoice.Id);

        var message = await h.OutboxAsync(EmailMessageType.MerchantInvoice);
        var rendered = h.Renderer.Render(message);

        Assert.Equal($"MyPetLink Invoice {invoice.InvoiceNumber}", message.Subject);
        foreach (var body in new[] { rendered.HtmlBody, rendered.TextBody })
        {
            Assert.Contains("Happy Paws Sdn Bhd", body);
            Assert.Contains(invoice.InvoiceNumber, body);
            Assert.Contains(invoice.MerchantOrderNumber, body);
            Assert.Contains("MYR 1,085.00", body);
            Assert.Contains("Due on receipt", body);
            Assert.Contains("quote the invoice number", body);
        }
    }

    [Fact]
    public async Task InvoiceEmail_CarriesExactlyOneInvoicePdf()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();
        await h.Emails.QueueInvoiceAsync(null, invoice.Id);

        var attachments = await h.Attachments.ResolveAsync(
            await h.OutboxAsync(EmailMessageType.MerchantInvoice));

        var attachment = Assert.Single(attachments);
        Assert.Contains("Invoice", attachment.FileName);
        Assert.DoesNotContain("Receipt", attachment.FileName);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(attachment.Content, 0, 5));
    }

    [Fact]
    public async Task InvoiceEmail_IsQueuedOnceHoweverOftenItIsAskedFor()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();

        var first = await h.Emails.QueueInvoiceAsync(null, invoice.Id);
        var second = await h.Emails.QueueInvoiceAsync(null, invoice.Id);

        Assert.False(first.AlreadyQueued);
        Assert.True(second.AlreadyQueued);
        Assert.Equal(1, await h.Db.EmailOutbox
            .CountAsync(item => item.MessageType == EmailMessageType.MerchantInvoice));
    }

    [Fact]
    public async Task InvoiceEmail_CannotBeSentForACancelledInvoice()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();
        await h.Billing.CancelInvoiceAsync(null, invoice.Id, null, default);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            h.Emails.QueueInvoiceAsync(null, invoice.Id));

        Assert.Equal(409, error.StatusCode);
    }

    // ===================== Payment confirmation =====================

    [Fact]
    public async Task PaymentConfirmation_IsQueuedByRecordingThePayment()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync();

        var message = await h.OutboxAsync(EmailMessageType.MerchantPaymentConfirmation);
        var rendered = h.Renderer.Render(message);

        Assert.Equal($"Payment received for {paid.Invoice.InvoiceNumber}", message.Subject);
        Assert.Equal("orders@happypaws.example", message.RecipientEmail);
        foreach (var body in new[] { rendered.HtmlBody, rendered.TextBody })
        {
            Assert.Contains(paid.Receipt.ReceiptNumber, body);
            Assert.Contains(paid.Invoice.InvoiceNumber, body);
            Assert.Contains(paid.Invoice.MerchantOrderNumber, body);
            Assert.Contains("Bank transfer", body);
        }
    }

    [Fact]
    public async Task PaymentConfirmation_CarriesTheReceiptAndNotTheInvoice()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync();

        var attachments = await h.Attachments.ResolveAsync(
            await h.OutboxAsync(EmailMessageType.MerchantPaymentConfirmation));

        var attachment = Assert.Single(attachments);
        Assert.Contains("Receipt", attachment.FileName);
        Assert.DoesNotContain("Invoice", attachment.FileName);
        Assert.Equal("application/pdf", attachment.ContentType);
        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(attachment.Content, 0, 5));

        var text = MerchantDocumentServiceTests.Squash(
            MerchantDocumentServiceTests.ExtractText(attachment.Content));
        Assert.Contains(MerchantDocumentServiceTests.Squash("Official Receipt"), text);
        Assert.Contains(MerchantDocumentServiceTests.Squash(paid.Receipt.ReceiptNumber), text);
    }

    [Fact]
    public async Task PaymentConfirmation_IsQueuedExactlyOnceEvenIfPaymentIsSubmittedAgain()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var invoice = await h.IssuedInvoiceAsync();

        await h.Billing.RecordPaymentAsync(null, invoice.Id, new DTOs.RecordMerchantPaymentRequest(
            MerchantDocumentHarness.Now, invoice.GrandTotal, "BankTransfer", "FT-1"), default);
        await h.Billing.RecordPaymentAsync(null, invoice.Id, new DTOs.RecordMerchantPaymentRequest(
            MerchantDocumentHarness.Now, invoice.GrandTotal, "BankTransfer", "FT-1"), default);

        Assert.Equal(1, await h.Db.EmailOutbox
            .CountAsync(item => item.MessageType == EmailMessageType.MerchantPaymentConfirmation));
    }

    // ===================== Template governance =====================

    [Fact]
    public async Task ADisabledTemplateRecordsTheEventWithoutEverSendingIt()
    {
        using var h = await MerchantDocumentHarness.CreateAsync(emailsEnabled: false);
        var quotation = await h.SentQuotationAsync();

        await h.Emails.QueueQuotationAsync(null, quotation.Id);
        var message = await h.OutboxAsync(EmailMessageType.MerchantQuotation);

        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
        Assert.Equal(EmailSuppressionReasons.TemplateDisabled, message.SuppressionReason);
    }

    [Fact]
    public async Task SwitchingATemplateOnLaterDoesNotReleaseWhatWasSuppressedBefore()
    {
        using var h = await MerchantDocumentHarness.CreateAsync(emailsEnabled: false);
        var quotation = await h.SentQuotationAsync();
        await h.Emails.QueueQuotationAsync(null, quotation.Id);

        var setting = await h.Db.EmailTemplateSettings
            .SingleAsync(item => item.MessageType == EmailMessageType.MerchantQuotation);
        setting.IsEnabled = true;
        setting.EnabledFromUtc = MerchantDocumentHarness.Now;
        await h.Db.SaveChangesAsync();

        var message = await h.OutboxAsync(EmailMessageType.MerchantQuotation);

        // Suppressed is terminal. A historical backlog must never be released
        // by a later business decision.
        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
    }

    [Fact]
    public async Task APausedGlobalSwitchStillQueuesTheWorkAsPending()
    {
        using var h = await MerchantDocumentHarness.CreateAsync(globalEmailEnabled: false);
        var quotation = await h.SentQuotationAsync();

        await h.Emails.QueueQuotationAsync(null, quotation.Id);
        var message = await h.OutboxAsync(EmailMessageType.MerchantQuotation);

        // A global pause holds delivery; it is not a business decision to
        // suppress, so the message stays visible as queued work.
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        Assert.Null(message.SuppressionReason);
    }

    // ===================== Privacy =====================

    [Fact]
    public async Task NoMerchantEmailCarriesInternalNotesCommissionOrIdentifiers()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync(internalNote: "Chase finance on Friday.");
        var quotation = await h.SentQuotationAsync(
            internalNotes: "Margin is thin, do not discount further.");
        await h.Emails.QueueQuotationAsync(null, quotation.Id);
        await h.Emails.QueueInvoiceAsync(null, paid.Invoice.Id);

        var messages = await h.Db.EmailOutbox.AsNoTracking().ToListAsync();
        Assert.Equal(3, messages.Count);

        foreach (var message in messages)
        {
            var rendered = h.Renderer.Render(message);
            foreach (var body in new[] { rendered.HtmlBody, rendered.TextBody, message.TemplateDataJson })
            {
                Assert.DoesNotContain("Chase finance", body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("Margin is thin", body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("commission", body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("rowversion", body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("/admin", body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain(paid.Invoice.Id.ToString(), body, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public async Task ARecipientNameCannotSmuggleASecondHeaderLine()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var quotation = await h.SentQuotationAsync();

        var stored = await h.Db.MerchantQuotations.SingleAsync(item => item.Id == quotation.Id);
        stored.ContactPersonSnapshot = "Aina\r\nBcc: attacker@example.com";
        await h.Db.SaveChangesAsync();

        await h.Emails.QueueQuotationAsync(null, quotation.Id);
        var message = await h.OutboxAsync(EmailMessageType.MerchantQuotation);

        Assert.DoesNotContain('\r', message.RecipientName);
        Assert.DoesNotContain('\n', message.RecipientName);
        Assert.DoesNotContain('\r', message.Subject);
        Assert.DoesNotContain('\n', message.Subject);
    }

    [Fact]
    public async Task AMessageThatNamesNoRecordCannotProduceAnAttachment()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();

        var orphan = new EmailOutbox
        {
            Id = Guid.NewGuid(),
            MessageType = EmailMessageType.MerchantInvoice,
            RecipientEmail = "orders@happypaws.example",
            RecipientName = "Aina",
            Subject = "MyPetLink Invoice",
            TemplateDataJson = "{}",
        };

        var error = await Assert.ThrowsAsync<EmailDeliveryException>(() =>
            h.Attachments.ResolveAsync(orphan));

        // Nothing to retry: what was queued is wrong, not the moment.
        Assert.False(error.IsTransient);
    }
}
