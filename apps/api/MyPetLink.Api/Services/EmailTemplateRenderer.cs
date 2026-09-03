using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class EmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly PaymentConfirmedEmailTemplateRenderer _paymentConfirmed;
    private readonly OwnerWelcomeEmailTemplateRenderer _ownerWelcome;
    private readonly OrderShippedEmailTemplateRenderer _orderShipped;
    private readonly AdminPaymentProofSubmittedEmailTemplateRenderer _adminPaymentProofSubmitted;
    private readonly PaymentProofRejectedEmailTemplateRenderer _paymentProofRejected;
    private readonly MerchantQuotationEmailTemplateRenderer _merchantQuotation;
    private readonly MerchantInvoiceEmailTemplateRenderer _merchantInvoice;
    private readonly MerchantPaymentConfirmationEmailTemplateRenderer _merchantPaymentConfirmation;
    private readonly MerchantOrderShippedEmailTemplateRenderer _merchantOrderShipped;

    public EmailTemplateRenderer(
        PaymentConfirmedEmailTemplateRenderer paymentConfirmed,
        OwnerWelcomeEmailTemplateRenderer ownerWelcome,
        OrderShippedEmailTemplateRenderer orderShipped,
        AdminPaymentProofSubmittedEmailTemplateRenderer adminPaymentProofSubmitted,
        PaymentProofRejectedEmailTemplateRenderer paymentProofRejected,
        MerchantQuotationEmailTemplateRenderer merchantQuotation,
        MerchantInvoiceEmailTemplateRenderer merchantInvoice,
        MerchantPaymentConfirmationEmailTemplateRenderer merchantPaymentConfirmation,
        MerchantOrderShippedEmailTemplateRenderer merchantOrderShipped)
    {
        _paymentConfirmed = paymentConfirmed;
        _ownerWelcome = ownerWelcome;
        _orderShipped = orderShipped;
        _adminPaymentProofSubmitted = adminPaymentProofSubmitted;
        _paymentProofRejected = paymentProofRejected;
        _merchantQuotation = merchantQuotation;
        _merchantInvoice = merchantInvoice;
        _merchantPaymentConfirmation = merchantPaymentConfirmation;
        _merchantOrderShipped = merchantOrderShipped;
    }

    public RenderedEmail Render(EmailOutbox message) =>
        message.MessageType switch
        {
            EmailMessageType.PaymentConfirmed => _paymentConfirmed.Render(message),
            EmailMessageType.OwnerWelcome => _ownerWelcome.Render(message),
            EmailMessageType.OrderShipped => _orderShipped.Render(message),
            EmailMessageType.AdminPaymentProofSubmitted => _adminPaymentProofSubmitted.Render(message),
            EmailMessageType.PaymentProofRejected => _paymentProofRejected.Render(message),
            EmailMessageType.MerchantQuotation => _merchantQuotation.Render(message),
            EmailMessageType.MerchantInvoice => _merchantInvoice.Render(message),
            EmailMessageType.MerchantOrderShipped => _merchantOrderShipped.Render(message),
            EmailMessageType.MerchantPaymentConfirmation =>
                _merchantPaymentConfirmation.Render(message),
            _ => throw new EmailDeliveryException("The email template is not supported.", false)
        };
}
