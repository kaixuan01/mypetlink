using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class OrderShippedEmailTemplateRenderer : IEmailTemplateRenderer
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);
    private readonly EmailOptions _options;
    private readonly TransactionalEmailLayout _layout;

    public OrderShippedEmailTemplateRenderer(
        IOptions<EmailOptions> options,
        TransactionalEmailLayout layout)
    {
        _options = options.Value;
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.OrderShipped)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        OrderShippedEmailTemplateData data;
        try
        {
            data = JsonSerializer.Deserialize<OrderShippedEmailTemplateData>(
                       message.TemplateDataJson,
                       TemplateJson)
                   ?? throw new JsonException("Template data was empty.");
        }
        catch (JsonException exception)
        {
            throw new EmailDeliveryException("The email content could not be prepared.", false, exception);
        }

        var orderUrl = BuildOrderUrl(data.OrderNumber);
        var shippedDate = data.ShippedAt
            .ToOffset(MalaysiaOffset)
            .ToString("dd MMM yyyy, h:mm tt 'MYT'");
        var courier = string.IsNullOrWhiteSpace(data.CourierService)
            ? data.CourierProvider
            : $"{data.CourierProvider} · {data.CourierService}";
        TransactionalEmailDetail[] details =
        [
            new("Order number", data.OrderNumber),
            new("Courier", courier),
            new("Tracking number", data.TrackingNumber),
            new("Shipped", shippedDate)
        ];

        var bodyHtml = new StringBuilder()
            .Append(_layout.Paragraph($"Hi {data.OwnerName},"))
            .Append(_layout.Paragraph("Your MyPetLink tag has been handed to the courier and is on its way."))
            .Append(_layout.InformationCard(
                "Shipment details",
                _layout.StatusBadge("Shipped") + _layout.DetailRows(details)))
            .Append(_layout.Paragraph("You can follow the latest order details in the Owner Portal."))
            .ToString();
        var textBody = new StringBuilder()
            .AppendLine($"Hi {data.OwnerName},")
            .AppendLine()
            .AppendLine("Your MyPetLink tag has been handed to the courier and is on its way.")
            .AppendLine()
            .AppendLine("Shipment details")
            .AppendLine($"Order number: {data.OrderNumber}")
            .AppendLine($"Courier: {courier}")
            .AppendLine($"Tracking number: {data.TrackingNumber}")
            .AppendLine($"Shipped: {shippedDate}")
            .AppendLine()
            .Append(data.TrackingUrl is null
                ? "You can follow the latest order details in the Owner Portal."
                : $"Track parcel: {data.TrackingUrl}")
            .ToString();
        var action = data.TrackingUrl is null
            ? new TransactionalEmailAction("View Order", orderUrl, Wide: true)
            : new TransactionalEmailAction("Track Parcel", data.TrackingUrl, Wide: true);

        return _layout.Render(new TransactionalEmailContent(
            message.Subject,
            $"Order {data.OrderNumber} has shipped with {data.CourierProvider}.",
            Eyebrow: "Delivery update",
            Title: "Your order has shipped",
            bodyHtml,
            textBody,
            action,
            "This transactional email was sent because your MyPetLink order was shipped."));
    }

    private string BuildOrderUrl(string orderNumber)
    {
        var baseUri = new Uri(_options.OwnerPortalBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        return new Uri(baseUri, $"orders/view?order={Uri.EscapeDataString(orderNumber)}").AbsoluteUri;
    }
}
