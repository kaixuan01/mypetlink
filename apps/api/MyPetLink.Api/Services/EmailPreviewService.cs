using System.Text.Json;
using System.Text.RegularExpressions;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Development-only representative previews. Program.cs exposes this service
/// only through a loopback endpoint in the Development environment.
/// </summary>
public sealed class EmailPreviewService : IEmailPreviewService
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private static readonly Regex ImageSource = new(
        "(<img\\b[^>]*\\bsrc=\")[^\"]+(\")",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private readonly OwnerWelcomeEmailTemplateRenderer _welcome;
    private readonly PaymentConfirmedEmailTemplateRenderer _paymentConfirmed;
    private readonly OrderShippedEmailTemplateRenderer _orderShipped;

    public EmailPreviewService(
        OwnerWelcomeEmailTemplateRenderer welcome,
        PaymentConfirmedEmailTemplateRenderer paymentConfirmed,
        OrderShippedEmailTemplateRenderer orderShipped)
    {
        _welcome = welcome;
        _paymentConfirmed = paymentConfirmed;
        _orderShipped = orderShipped;
    }

    public RenderedEmail Render(string template, string variant)
    {
        var normalizedTemplate = template.Trim().ToLowerInvariant();
        var normalizedVariant = variant.Trim().ToLowerInvariant();

        return normalizedTemplate switch
        {
            "welcome" => RenderWelcome(normalizedVariant),
            "payment-confirmed" when normalizedVariant == "normal" =>
                _paymentConfirmed.Render(Message(
                    EmailMessageType.PaymentConfirmed,
                    "Payment confirmed for order MPL-ORD-260727123029-9916",
                    new PaymentConfirmedEmailTemplateData(
                        "Aina",
                        "MPL-ORD-260727123029-9916",
                        67m,
                        "MYR",
                        DateTimeOffset.Parse("2026-07-27T06:14:23Z"),
                        "MyPetLink QR + NFC Pet Tag",
                        "Standard",
                        "Topu"))),
            "order-shipped" when normalizedVariant == "normal" =>
                _orderShipped.Render(Message(
                    EmailMessageType.OrderShipped,
                    "Your MyPetLink order MPL-ORD-260727123029-9916 has shipped",
                    new OrderShippedEmailTemplateData(
                        "Aina",
                        "MPL-ORD-260727123029-9916",
                        "J&T Express",
                        "Standard Delivery",
                        "MY123456789",
                        DateTimeOffset.Parse("2026-07-30T06:00:00Z")))),
            _ => throw new EmailDeliveryException("The requested email preview was not found.", false)
        };
    }

    private RenderedEmail RenderWelcome(string variant)
    {
        var ownerName = variant switch
        {
            "normal" or "logo-blocked" or "images-blocked" => "Aina",
            "long-name" => "Chua Kai Xuan Alexandria-Catherine-Montgomery-Wellington-Santos",
            "missing-name" => "",
            _ => throw new EmailDeliveryException("The requested email preview was not found.", false)
        };
        var rendered = _welcome.Render(Message(
            EmailMessageType.OwnerWelcome,
            "Welcome to MyPetLink",
            new OwnerWelcomeEmailTemplateData(
                ownerName,
                "https://mypetlink.com.my/pets/new",
                DateTimeOffset.Parse("2026-07-27T06:00:00Z"),
                SmartTagsEnabled: false)));

        if (variant is not ("logo-blocked" or "images-blocked"))
        {
            return rendered;
        }

        var index = 0;
        var blockedHtml = ImageSource.Replace(
            rendered.HtmlBody,
            match =>
            {
                index++;
                return string.Concat(
                    match.Groups[1].Value,
                    $"https://email-preview.invalid/blocked-{index}.png",
                    match.Groups[2].Value);
            });
        return rendered with { HtmlBody = blockedHtml };
    }

    private static EmailOutbox Message<T>(
        EmailMessageType messageType,
        string subject,
        T data)
    {
        var now = DateTimeOffset.Parse("2026-07-27T06:00:00Z");
        return new EmailOutbox
        {
            Id = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
            MessageType = messageType,
            RecipientEmail = "preview.owner@example.test",
            RecipientName = "Preview Owner",
            Subject = subject,
            TemplateDataJson = JsonSerializer.Serialize(data, TemplateJson),
            RelatedUserId = messageType == EmailMessageType.OwnerWelcome
                ? Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
                : null,
            RelatedOrderId = messageType is EmailMessageType.PaymentConfirmed or EmailMessageType.OrderShipped
                ? Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
                : null,
            Status = EmailOutboxStatus.Pending,
            MaxAttempts = 5,
            NextAttemptAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };
    }
}
