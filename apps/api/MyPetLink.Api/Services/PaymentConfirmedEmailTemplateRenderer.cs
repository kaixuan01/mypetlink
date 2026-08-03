using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class PaymentConfirmedEmailTemplateRenderer : IEmailTemplateRenderer
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);
    private readonly EmailOptions _options;
    private readonly TransactionalEmailLayout _layout;

    public PaymentConfirmedEmailTemplateRenderer(
        IOptions<EmailOptions> options,
        TransactionalEmailLayout layout)
    {
        _options = options.Value;
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.PaymentConfirmed)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        PaymentConfirmedEmailTemplateData data;
        try
        {
            data = JsonSerializer.Deserialize<PaymentConfirmedEmailTemplateData>(
                       message.TemplateDataJson,
                       TemplateJson)
                   ?? throw new JsonException("Template data was empty.");
        }
        catch (JsonException exception)
        {
            throw new EmailDeliveryException("The email content could not be prepared.", false, exception);
        }

        var receiptUrl = BuildReceiptUrl(data.OrderNumber);
        var date = data.PaymentConfirmedAt
            .ToOffset(MalaysiaOffset)
            .ToString("dd MMM yyyy, h:mm tt 'MYT'");
        var amount = $"{data.Currency} {data.AmountPaid:0.00}";
        var product = CustomerOrderDisplay.Product(data.ProductName, data.VariantName);
        var details = new List<TransactionalEmailDetail>
        {
            new TransactionalEmailDetail("Order number", data.OrderNumber),
            new TransactionalEmailDetail("Amount paid", amount),
            new TransactionalEmailDetail("Confirmed", date)
        };
        var items = data.Items?.Where(item => item.Quantity > 0).ToArray() ?? [];
        if (items.Length == 0)
        {
            details.Add(new TransactionalEmailDetail("Tag", product));
            details.Add(new TransactionalEmailDetail("For", data.PetName));
        }
        else
        {
            for (var index = 0; index < items.Length; index++)
            {
                var item = items[index];
                var label = items.Length == 1 ? "Tag" : $"Tag {index + 1}";
                var itemProduct = CustomerOrderDisplay.Product(item.ProductName, item.VariantName);
                details.Add(new TransactionalEmailDetail(
                    label,
                    $"{item.Quantity} × {itemProduct} for {item.PetName} — {data.Currency} {item.LineTotal:0.00}"));
            }
        }
        if (data.MerchandiseSubtotal.HasValue)
        {
            details.Add(new TransactionalEmailDetail(
                "Merchandise subtotal",
                $"{data.Currency} {data.MerchandiseSubtotal.Value:0.00}"));
        }
        if (data.DiscountTotal is > 0m)
        {
            details.Add(new TransactionalEmailDetail(
                "Discount",
                $"− {data.Currency} {data.DiscountTotal.Value:0.00}"));
        }
        if (data.DeliveryFee.HasValue)
        {
            details.Add(new TransactionalEmailDetail(
                "Delivery",
                data.DeliveryFee.Value <= 0m ? "Free" : $"{data.Currency} {data.DeliveryFee.Value:0.00}"));
        }

        var bodyHtml = new StringBuilder()
            .Append(_layout.Paragraph($"Hi {data.OwnerName},"))
            .Append(_layout.Paragraph("We’ve received your payment. Your MyPetLink order is now confirmed."))
            .Append(_layout.InformationCard(
                "Payment details",
                _layout.StatusBadge("Paid") + _layout.DetailRows(details)))
            .Append(_layout.Paragraph(
                "Our team will prepare the next fulfilment step. You can continue to follow your order and download the Official Receipt from the Owner Portal."))
            .ToString();
        var textBody = new StringBuilder()
            .AppendLine($"Hi {data.OwnerName},")
            .AppendLine()
            .AppendLine("We’ve received your payment. Your MyPetLink order is now confirmed.")
            .AppendLine()
            .AppendLine("Payment details")
            .AppendLine("Status: Paid")
            .AppendLine($"Order number: {data.OrderNumber}")
            .AppendLine($"Amount paid: {amount}")
            .AppendLine($"Confirmed: {date}")
            .AppendJoin(
                Environment.NewLine,
                details.Skip(3).Select(detail => $"{detail.Label}: {detail.Value}"))
            .AppendLine()
            .AppendLine()
            .Append("Our team will prepare the next fulfilment step. You can continue to follow your order and download the Official Receipt from the Owner Portal.")
            .ToString();

        return _layout.Render(new TransactionalEmailContent(
            message.Subject,
            $"Payment confirmed for order {data.OrderNumber}.",
            Eyebrow: "Order update",
            Title: "Payment confirmed",
            bodyHtml,
            textBody,
            new TransactionalEmailAction("Download Official Receipt", receiptUrl),
            "This transactional email was sent because payment for your MyPetLink order was confirmed."));
    }

    private string BuildReceiptUrl(string orderNumber)
    {
        var baseUri = new Uri(_options.OwnerPortalBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        return new Uri(baseUri, $"orders/view?order={Uri.EscapeDataString(orderNumber)}&document=receipt").AbsoluteUri;
    }
}
