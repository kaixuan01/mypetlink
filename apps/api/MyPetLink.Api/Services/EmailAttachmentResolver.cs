using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Resolves server-owned transactional attachments immediately before send.
///
/// A document is produced from the related record's id, never from anything in
/// the outbox payload: no message can name a local path, supply bytes, or ask
/// for a document belonging to a different record. Anything that does not
/// resolve to exactly one valid PDF fails closed.
/// </summary>
public sealed class EmailAttachmentResolver : IEmailAttachmentResolver
{
    internal const int MaxAttachmentBytes = 8 * 1024 * 1024;

    private readonly IOrderDocumentService _documents;
    private readonly IMerchantDocumentService _merchantDocuments;

    public EmailAttachmentResolver(
        IOrderDocumentService documents,
        IMerchantDocumentService merchantDocuments)
    {
        _documents = documents;
        _merchantDocuments = merchantDocuments;
    }

    public async Task<IReadOnlyCollection<EmailAttachment>> ResolveAsync(
        EmailOutbox message,
        CancellationToken cancellationToken = default)
    {
        // Each message type gets exactly the one document it is about. A
        // payment confirmation carries the receipt, never the invoice too.
        var document = message.MessageType switch
        {
            EmailMessageType.PaymentConfirmed => await LoadAsync(
                message.RelatedOrderId,
                id => _documents.GetTransactionalReceiptAsync(id, cancellationToken),
                cancellationToken),

            EmailMessageType.MerchantQuotation => await LoadAsync(
                message.RelatedMerchantQuotationId,
                id => _merchantDocuments.GetQuotationAsync(id, cancellationToken),
                cancellationToken),

            EmailMessageType.MerchantInvoice => await LoadAsync(
                message.RelatedMerchantInvoiceId,
                id => _merchantDocuments.GetInvoiceAsync(id, cancellationToken),
                cancellationToken),

            EmailMessageType.MerchantPaymentConfirmation => await LoadAsync(
                message.RelatedMerchantInvoiceId,
                id => _merchantDocuments.GetReceiptForInvoiceAsync(id, cancellationToken),
                cancellationToken),

            // Welcome and shipped emails carry no attachment. An unknown type
            // gets nothing rather than a guess.
            _ => null,
        };

        if (document is null)
        {
            return [];
        }

        Validate(document);
        return [new EmailAttachment(document.FileName, document.ContentType, document.Content)];
    }

    private static async Task<OrderDocumentResult?> LoadAsync(
        Guid? relatedId,
        Func<Guid, Task<OrderDocumentResult>> load,
        CancellationToken cancellationToken)
    {
        if (!relatedId.HasValue)
        {
            // The message claims to carry a document but names no record. That
            // is a defect in what was queued, so retrying cannot help.
            throw new EmailDeliveryException(
                "The document attachment could not be prepared.", false);
        }

        try
        {
            return await load(relatedId.Value);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new EmailDeliveryException(
                "The document attachment could not be prepared.", true, exception);
        }
    }

    private static void Validate(OrderDocumentResult document)
    {
        var fileName = document.FileName;
        var safeName = Path.GetFileName(fileName);

        if (string.IsNullOrWhiteSpace(fileName)
            // Any directory component means the name is being used as a path.
            || !string.Equals(fileName, safeName, StringComparison.Ordinal)
            || fileName.Contains('\r')
            || fileName.Contains('\n')
            || !fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(document.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase)
            || document.Content.Length is < 5 or > MaxAttachmentBytes
            || !document.Content.AsSpan(0, 5).SequenceEqual("%PDF-"u8))
        {
            throw new EmailDeliveryException(
                "The document attachment could not be prepared.", false);
        }
    }
}
