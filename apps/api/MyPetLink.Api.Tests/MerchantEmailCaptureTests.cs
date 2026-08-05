using System.Text;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Writes the rendered merchant emails and their attachments to a local folder
/// so they can be opened and looked at, and asserts what a reviewer would check
/// by eye. Capture is opt-in via MYPETLINK_EMAIL_CAPTURE_DIR; the assertions
/// run either way, so the suite never depends on the environment.
///
/// Nothing here sends anything: the outbox is read directly and no sender is
/// involved.
/// </summary>
public sealed class MerchantEmailCaptureTests
{
    private static string? CaptureDirectory =>
        Environment.GetEnvironmentVariable("MYPETLINK_EMAIL_CAPTURE_DIR");

    [Fact]
    public async Task EveryMerchantEmailRendersWithExactlyOneCorrectAttachment()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();

        var paid = await h.PaidInvoiceAsync(twoLines: true, orderDiscount: 200m, deliveryFee: 35m);
        await h.Emails.QueueInvoiceAsync(null, paid.Invoice.Id);

        var quotation = await h.SentQuotationAsync(
            twoLines: true, orderDiscount: 200m, deliveryFee: 35m,
            customerNotes: "Bulk pricing held for your three clinics.");
        await h.Emails.QueueQuotationAsync(null, quotation.Id);

        var directory = CaptureDirectory;
        if (directory is not null) Directory.CreateDirectory(directory);

        var expected = new Dictionary<EmailMessageType, string>
        {
            [EmailMessageType.MerchantQuotation] = "Quotation",
            [EmailMessageType.MerchantInvoice] = "Invoice",
            [EmailMessageType.MerchantPaymentConfirmation] = "Receipt",
        };

        foreach (var (messageType, documentWord) in expected)
        {
            var message = await h.OutboxAsync(messageType);
            var rendered = h.Renderer.Render(message);
            var attachments = await h.Attachments.ResolveAsync(message);

            var attachment = Assert.Single(attachments);
            Assert.Equal("application/pdf", attachment.ContentType);
            Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(attachment.Content, 0, 5));
            Assert.Contains(documentWord, attachment.FileName);

            // Both alternatives must stand on their own: an email client that
            // blocks HTML still has to convey the whole message.
            Assert.Contains("Happy Paws", rendered.HtmlBody);
            Assert.Contains("Happy Paws", rendered.TextBody);
            Assert.Contains("support@mypetlink.com.my", rendered.TextBody);
            Assert.DoesNotContain("{{", rendered.HtmlBody);
            Assert.DoesNotContain("{0}", rendered.HtmlBody);
            Assert.DoesNotContain("System.", rendered.HtmlBody);

            if (directory is null) continue;

            var stem = Path.Combine(directory, messageType.ToString());
            await File.WriteAllTextAsync($"{stem}.html", rendered.HtmlBody);
            await File.WriteAllTextAsync($"{stem}.txt",
                $"Subject: {message.Subject}\nTo: {message.RecipientName} <{message.RecipientEmail}>\n"
                + $"Attachment: {attachment.FileName} ({attachment.ContentType}, "
                + $"{attachment.Content.Length} bytes)\n\n{rendered.TextBody}");
            await File.WriteAllBytesAsync(
                Path.Combine(directory, attachment.FileName), attachment.Content);
        }
    }

    [Fact]
    public async Task TheHtmlAndPlainTextCarryTheSameFigures()
    {
        using var h = await MerchantDocumentHarness.CreateAsync();
        var paid = await h.PaidInvoiceAsync(orderDiscount: 200m, deliveryFee: 35m);

        var rendered = h.Renderer.Render(
            await h.OutboxAsync(EmailMessageType.MerchantPaymentConfirmation));

        var amount = $"MYR {paid.Payment.AmountReceived:N2}";
        foreach (var body in new[] { rendered.HtmlBody, rendered.TextBody })
        {
            Assert.Contains(amount, body);
            Assert.Contains(paid.Receipt.ReceiptNumber, body);
            Assert.Contains(paid.Invoice.InvoiceNumber, body);
        }
    }
}
