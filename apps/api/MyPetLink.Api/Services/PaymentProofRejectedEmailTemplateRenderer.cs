using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class PaymentProofRejectedEmailTemplateRenderer : IEmailTemplateRenderer
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);
    private readonly EmailOptions _options;
    private readonly TransactionalEmailLayout _layout;

    public PaymentProofRejectedEmailTemplateRenderer(
        IOptions<EmailOptions> options,
        TransactionalEmailLayout layout)
    {
        _options = options.Value;
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.PaymentProofRejected)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        PaymentProofRejectedEmailTemplateData data;
        try
        {
            data = JsonSerializer.Deserialize<PaymentProofRejectedEmailTemplateData>(
                       message.TemplateDataJson,
                       TemplateJson)
                   ?? throw new JsonException("Template data was empty.");
        }
        catch (JsonException exception)
        {
            throw new EmailDeliveryException("The email content could not be prepared.", false, exception);
        }

        var details = new List<TransactionalEmailDetail>
        {
            new("Order number", data.OrderNumber),
            new("What needs attention", data.RejectionReason)
        };
        if (data.PaymentDeadline.HasValue)
        {
            details.Add(new TransactionalEmailDetail(
                "Submit by",
                data.PaymentDeadline.Value.ToOffset(MalaysiaOffset).ToString("dd MMM yyyy, h:mm tt 'MYT'")));
        }

        var bodyHtml = new StringBuilder()
            .Append(_layout.Paragraph($"Hi {data.OwnerName},"))
            .Append(_layout.Paragraph("We could not approve the payment proof for your MyPetLink order."))
            .Append(_layout.InformationCard(
                "What to update",
                _layout.StatusBadge("Action needed") + _layout.DetailRows(details)))
            .Append(_layout.Paragraph("Please open your order and submit a new payment proof before the deadline shown above."))
            .ToString();
        var textBody = new StringBuilder()
            .AppendLine($"Hi {data.OwnerName},")
            .AppendLine()
            .AppendLine("We could not approve the payment proof for your MyPetLink order.")
            .AppendLine()
            .AppendLine($"Order number: {data.OrderNumber}")
            .AppendLine($"What needs attention: {data.RejectionReason}");
        if (data.PaymentDeadline.HasValue)
        {
            textBody.AppendLine($"Submit by: {data.PaymentDeadline.Value.ToOffset(MalaysiaOffset):dd MMM yyyy, h:mm tt} MYT");
        }
        textBody.AppendLine()
            .Append("Please open your order and submit a new payment proof before the deadline shown above.");

        return _layout.Render(new TransactionalEmailContent(
            message.Subject,
            $"A new payment proof is needed for order {data.OrderNumber}.",
            Eyebrow: "Order update",
            Title: "Please resubmit your payment proof",
            bodyHtml,
            textBody.ToString(),
            new TransactionalEmailAction("View Order and Resubmit", BuildOrderUrl(data.OrderNumber), Wide: true),
            "This transactional email was sent because your payment proof needs to be resubmitted."));
    }

    private string BuildOrderUrl(string orderNumber)
    {
        var baseUri = new Uri(_options.OwnerPortalBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        return new Uri(baseUri, $"orders/view?order={Uri.EscapeDataString(orderNumber)}").AbsoluteUri;
    }
}
