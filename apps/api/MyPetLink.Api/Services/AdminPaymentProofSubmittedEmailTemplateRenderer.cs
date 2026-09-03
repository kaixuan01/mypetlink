using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class AdminPaymentProofSubmittedEmailTemplateRenderer : IEmailTemplateRenderer
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);
    private readonly EmailOptions _options;
    private readonly TransactionalEmailLayout _layout;

    public AdminPaymentProofSubmittedEmailTemplateRenderer(
        IOptions<EmailOptions> options,
        TransactionalEmailLayout layout)
    {
        _options = options.Value;
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.AdminPaymentProofSubmitted)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        AdminPaymentProofSubmittedEmailTemplateData data;
        try
        {
            data = JsonSerializer.Deserialize<AdminPaymentProofSubmittedEmailTemplateData>(
                       message.TemplateDataJson,
                       TemplateJson)
                   ?? throw new JsonException("Template data was empty.");
        }
        catch (JsonException exception)
        {
            throw new EmailDeliveryException("The email content could not be prepared.", false, exception);
        }

        var submitted = data.SubmittedAt
            .ToOffset(MalaysiaOffset)
            .ToString("dd MMM yyyy, h:mm tt 'MYT'");
        var details = new List<TransactionalEmailDetail>
        {
            new("Order number", data.OrderNumber),
            new("Customer", $"{data.CustomerName} ({data.CustomerEmail})"),
            new("Amount submitted", $"{data.Currency} {data.Amount:0.00}"),
            new("Payment reference", string.IsNullOrWhiteSpace(data.PaymentReference) ? "Not provided" : data.PaymentReference),
            new("Submitted", submitted)
        };
        foreach (var item in data.Items.Where(item => item.Quantity > 0))
        {
            details.Add(new TransactionalEmailDetail(
                "Tag",
                $"{item.Quantity} × {CustomerOrderDisplay.Product(item.ProductName, item.VariantName)} for {item.PetName}"));
        }

        var bodyHtml = new StringBuilder()
            .Append(_layout.Paragraph("A customer has submitted payment proof and it is waiting for review."))
            .Append(_layout.InformationCard(
                "Review details",
                _layout.StatusBadge("Awaiting review") + _layout.DetailRows(details)))
            .Append(_layout.Paragraph("Open the payment proof to compare it with the order before approving or rejecting it."))
            .ToString();
        var textBody = new StringBuilder()
            .AppendLine("A customer has submitted payment proof and it is waiting for review.")
            .AppendLine()
            .AppendLine("Review details")
            .AppendJoin(Environment.NewLine, details.Select(detail => $"{detail.Label}: {detail.Value}"))
            .AppendLine()
            .AppendLine()
            .Append("Open the payment proof to compare it with the order before approving or rejecting it.")
            .ToString();

        return _layout.Render(new TransactionalEmailContent(
            message.Subject,
            $"Payment proof for order {data.OrderNumber} is awaiting review.",
            Eyebrow: "Operations alert",
            Title: "Payment proof awaiting review",
            bodyHtml,
            textBody,
            new TransactionalEmailAction("Review Payment Proof", BuildReviewUrl(data.PaymentProofId), Wide: true),
            "This operational email was sent because a customer submitted payment proof for review."));
    }

    private string BuildReviewUrl(Guid paymentProofId)
    {
        var baseUri = new Uri(_options.OwnerPortalBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        return new Uri(baseUri, $"admin/payment-proofs?proof={Uri.EscapeDataString(paymentProofId.ToString())}").AbsoluteUri;
    }
}
