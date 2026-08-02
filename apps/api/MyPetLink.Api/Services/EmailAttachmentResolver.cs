using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Resolves server-owned transactional attachments immediately before send.
/// No outbox payload can name a local path or provide arbitrary bytes.
/// </summary>
public sealed class EmailAttachmentResolver : IEmailAttachmentResolver
{
    internal const int MaxAttachmentBytes = 8 * 1024 * 1024;
    private readonly IOrderDocumentService _documents;

    public EmailAttachmentResolver(IOrderDocumentService documents)
    {
        _documents = documents;
    }

    public async Task<IReadOnlyCollection<EmailAttachment>> ResolveAsync(
        EmailOutbox message,
        CancellationToken cancellationToken = default)
    {
        if (message.MessageType != EmailMessageType.PaymentConfirmed)
        {
            return [];
        }

        if (!message.RelatedOrderId.HasValue)
        {
            throw new EmailDeliveryException(
                "The receipt attachment could not be prepared.",
                false);
        }

        OrderDocumentResult receipt;
        try
        {
            receipt = await _documents.GetTransactionalReceiptAsync(
                message.RelatedOrderId.Value,
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new EmailDeliveryException(
                "The receipt attachment could not be prepared.",
                true,
                exception);
        }

        ValidateReceipt(receipt);
        return [new EmailAttachment(receipt.FileName, receipt.ContentType, receipt.Content)];
    }

    private static void ValidateReceipt(OrderDocumentResult receipt)
    {
        var fileName = receipt.FileName;
        var safeName = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(fileName)
            || !string.Equals(fileName, safeName, StringComparison.Ordinal)
            || fileName.Contains('\r')
            || fileName.Contains('\n')
            || !fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(receipt.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase)
            || receipt.Content.Length is < 5 or > MaxAttachmentBytes
            || !receipt.Content.AsSpan(0, 5).SequenceEqual("%PDF-"u8))
        {
            throw new EmailDeliveryException(
                "The receipt attachment could not be prepared.",
                false);
        }
    }
}
