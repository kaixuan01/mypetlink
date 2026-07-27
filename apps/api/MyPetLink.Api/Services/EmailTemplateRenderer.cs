using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class EmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly PaymentConfirmedEmailTemplateRenderer _paymentConfirmed;
    private readonly OwnerWelcomeEmailTemplateRenderer _ownerWelcome;

    public EmailTemplateRenderer(
        PaymentConfirmedEmailTemplateRenderer paymentConfirmed,
        OwnerWelcomeEmailTemplateRenderer ownerWelcome)
    {
        _paymentConfirmed = paymentConfirmed;
        _ownerWelcome = ownerWelcome;
    }

    public RenderedEmail Render(EmailOutbox message) =>
        message.MessageType switch
        {
            EmailMessageType.PaymentConfirmed => _paymentConfirmed.Render(message),
            EmailMessageType.OwnerWelcome => _ownerWelcome.Render(message),
            _ => throw new EmailDeliveryException("The email template is not supported.", false)
        };
}
