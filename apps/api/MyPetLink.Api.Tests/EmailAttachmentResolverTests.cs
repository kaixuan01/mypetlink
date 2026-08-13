using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

[Collection("PDF document rendering")]
public sealed class EmailAttachmentResolverTests
{
    [Fact]
    public async Task PaymentConfirmation_ReceivesExactlyOneServerGeneratedReceipt()
    {
        var orderId = Guid.NewGuid();
        var documents = new FakeDocuments(new OrderDocumentResult(
            "%PDF-1.7 receipt for MPL-ORD-TEST MYR 47.90"u8.ToArray(),
            "MyPetLink-Official-Receipt-MPL-ORD-TEST.pdf"));
        var resolver = new EmailAttachmentResolver(documents, new FakeMerchantDocuments());

        var attachments = await resolver.ResolveAsync(Message(EmailMessageType.PaymentConfirmed, orderId));

        var attachment = Assert.Single(attachments);
        Assert.Equal("MyPetLink-Official-Receipt-MPL-ORD-TEST.pdf", attachment.FileName);
        Assert.Equal("application/pdf", attachment.ContentType);
        Assert.StartsWith("%PDF-", System.Text.Encoding.ASCII.GetString(attachment.Content));
        Assert.Equal(orderId, documents.RequestedOrderId);
    }

    [Fact]
    public async Task ShippedEmail_HasNoReceiptAttachment()
    {
        var documents = new FakeDocuments(new OrderDocumentResult("%PDF-test"u8.ToArray(), "receipt.pdf"));
        var attachments = await new EmailAttachmentResolver(documents, new FakeMerchantDocuments())
            .ResolveAsync(Message(EmailMessageType.OrderShipped, Guid.NewGuid()));

        Assert.Empty(attachments);
        Assert.Null(documents.RequestedOrderId);
    }

    [Theory]
    [InlineData("../receipt.pdf")]
    [InlineData("receipt.txt")]
    [InlineData("receipt.pdf\r\nBcc: attacker@example.com")]
    public async Task RejectsUnsafeOrIncorrectReceiptNames(string fileName)
    {
        var resolver = new EmailAttachmentResolver(
            new FakeDocuments(new OrderDocumentResult("%PDF-test"u8.ToArray(), fileName)),
            new FakeMerchantDocuments());

        var error = await Assert.ThrowsAsync<EmailDeliveryException>(() =>
            resolver.ResolveAsync(Message(EmailMessageType.PaymentConfirmed, Guid.NewGuid())));

        Assert.False(error.IsTransient);
    }

    [Fact]
    public async Task GenerationFailure_IsRetryableAndDoesNotExposeTheUnderlyingError()
    {
        var resolver = new EmailAttachmentResolver(
            new FakeDocuments(new InvalidOperationException("private path C:\\secret")),
            new FakeMerchantDocuments());
        var error = await Assert.ThrowsAsync<EmailDeliveryException>(() =>
            resolver.ResolveAsync(Message(EmailMessageType.PaymentConfirmed, Guid.NewGuid())));

        Assert.True(error.IsTransient);
        Assert.DoesNotContain("secret", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static EmailOutbox Message(EmailMessageType type, Guid orderId) => new()
    {
        Id = Guid.NewGuid(),
        MessageType = type,
        RelatedOrderId = orderId,
        RecipientEmail = "owner@example.com",
        RecipientName = "Owner",
        Subject = "Test",
        TemplateDataJson = "{}"
    };

    private sealed class FakeDocuments : IOrderDocumentService
    {
        private readonly OrderDocumentResult? _result;
        private readonly Exception? _exception;

        public FakeDocuments(OrderDocumentResult result) => _result = result;
        public FakeDocuments(Exception exception) => _exception = exception;
        public Guid? RequestedOrderId { get; private set; }

        public Task<OrderDocumentResult> GetTransactionalReceiptAsync(Guid orderId, CancellationToken cancellationToken = default)
        {
            RequestedOrderId = orderId;
            return _exception is null
                ? Task.FromResult(_result!)
                : Task.FromException<OrderDocumentResult>(_exception);
        }

        public Task<OrderDocumentResult> GetOwnerSummaryAsync(Guid? currentUserId, string orderKey, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<OrderDocumentResult> GetOwnerReceiptAsync(Guid? currentUserId, string orderKey, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<OrderDocumentResult> GetAdminSummaryAsync(Guid orderId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<OrderDocumentResult> GetAdminReceiptAsync(Guid orderId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    /// <summary>
    /// Merchant documents are covered by their own tests; here they only need
    /// to exist so the resolver can be built.
    /// </summary>
    private sealed class FakeMerchantDocuments : IMerchantDocumentService
    {
        public Task<OrderDocumentResult> GetQuotationAsync(Guid quotationId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<OrderDocumentResult> GetInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<OrderDocumentResult> GetReceiptAsync(Guid receiptId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<OrderDocumentResult> GetReceiptForInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<OrderDocumentResult> GetDeliveryOrderAsync(Guid deliveryOrderId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
