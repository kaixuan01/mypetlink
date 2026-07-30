using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class EmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly PaymentConfirmedEmailTemplateRenderer _paymentConfirmed;
    private readonly OwnerWelcomeEmailTemplateRenderer _ownerWelcome;
    private readonly OrderShippedEmailTemplateRenderer _orderShipped;

    public EmailTemplateRenderer(
        PaymentConfirmedEmailTemplateRenderer paymentConfirmed,
        OwnerWelcomeEmailTemplateRenderer ownerWelcome,
        OrderShippedEmailTemplateRenderer orderShipped)
    {
        _paymentConfirmed = paymentConfirmed;
        _ownerWelcome = ownerWelcome;
        _orderShipped = orderShipped;
    }

    public RenderedEmail Render(EmailOutbox message) =>
        message.MessageType switch
        {
            EmailMessageType.PaymentConfirmed => _paymentConfirmed.Render(message),
            EmailMessageType.OwnerWelcome => _ownerWelcome.Render(message),
            EmailMessageType.OrderShipped => _orderShipped.Render(message),
            _ => throw new EmailDeliveryException("The email template is not supported.", false)
        };
}
