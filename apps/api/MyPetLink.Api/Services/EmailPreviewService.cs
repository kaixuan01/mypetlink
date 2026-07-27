using System.Text.Json;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Development-only representative previews. Program.cs exposes this service
/// only through a loopback endpoint in the Development environment.
/// </summary>
public sealed class EmailPreviewService : IEmailPreviewService
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private readonly OwnerWelcomeEmailTemplateRenderer _welcome;
    private readonly PaymentConfirmedEmailTemplateRenderer _paymentConfirmed;

    public EmailPreviewService(
        OwnerWelcomeEmailTemplateRenderer welcome,
        PaymentConfirmedEmailTemplateRenderer paymentConfirmed)
    {
        _welcome = welcome;
        _paymentConfirmed = paymentConfirmed;
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
            _ => throw new EmailDeliveryException("The requested email preview was not found.", false)
        };
    }

    private RenderedEmail RenderWelcome(string variant)
    {
        var ownerName = variant switch
        {
            "normal" or "logo-blocked" => "Aina",
            "long-name" => "Alexandria-Catherine-Montgomery-Wellington-Santos",
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

        if (variant != "logo-blocked")
        {
            return rendered;
        }

        const string sourcePrefix = "<img src=\"";
        var start = rendered.HtmlBody.IndexOf(sourcePrefix, StringComparison.Ordinal);
        if (start < 0)
        {
            return rendered;
        }

        start += sourcePrefix.Length;
        var end = rendered.HtmlBody.IndexOf('"', start);
        if (end < 0)
        {
            return rendered;
        }

        var blockedHtml = string.Concat(
            rendered.HtmlBody.AsSpan(0, start),
            "https://email-preview.invalid/logo-blocked.png",
            rendered.HtmlBody.AsSpan(end));
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
            RelatedOrderId = messageType == EmailMessageType.PaymentConfirmed
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
