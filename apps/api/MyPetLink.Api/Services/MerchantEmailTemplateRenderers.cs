using System.Text.Json;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Merchant-facing emails. They reuse the shared transactional layout so a
// business buyer gets the same MyPetLink shell an owner does, and they carry
// only what the attached document already shows. No Admin URL, no internal
// note, no commission, no identifier a merchant has no use for.

internal static class MerchantEmailJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static T Read<T>(EmailOutbox message)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(message.TemplateDataJson, Options)
                ?? throw new JsonException("Template data was empty.");
        }
        catch (JsonException exception)
        {
            throw new EmailDeliveryException(
                "The email content could not be prepared.", false, exception);
        }
    }

    public static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);

    public static string Date(DateTimeOffset value) =>
        value.ToOffset(MalaysiaOffset).ToString("dd MMM yyyy");

    public static string Money(string currency, decimal amount) => $"{currency} {amount:N2}";
}

public sealed class MerchantQuotationEmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly TransactionalEmailLayout _layout;

    public MerchantQuotationEmailTemplateRenderer(TransactionalEmailLayout layout)
    {
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.MerchantQuotation)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        var data = MerchantEmailJson.Read<MerchantQuotationEmailTemplateData>(message);
        var total = MerchantEmailJson.Money(data.Currency, data.GrandTotal);
        var validUntil = MerchantEmailJson.Date(data.ValidUntil);

        var details = new List<TransactionalEmailDetail>
        {
            new("Quotation number", data.QuotationNumber),
            new("Quotation date", MerchantEmailJson.Date(data.QuotationDate)),
            new("Valid until", validUntil),
            new("Quotation total", total),
            new("Payment term", data.PaymentTerm),
        };

        var body =
            _layout.Paragraph($"Hi {data.ContactPerson},")
            + _layout.Paragraph(
                $"Thank you for your interest in MyPetLink Smart Tags. Your quotation for "
                + $"{data.MerchantName} is attached as a PDF.")
            + _layout.DetailRows(details)
            + _layout.Paragraph(
                $"These prices are held until {validUntil}. Reply to this email to accept the "
                + "quotation and we will raise your invoice.")
            + _layout.Paragraph(
                "This quotation is not an invoice and is not proof of payment.", subdued: true);

        var text = string.Join("\n", new[]
        {
            $"Hi {data.ContactPerson},",
            "",
            $"Your MyPetLink quotation for {data.MerchantName} is attached as a PDF.",
            "",
            $"Quotation number: {data.QuotationNumber}",
            $"Quotation date: {MerchantEmailJson.Date(data.QuotationDate)}",
            $"Valid until: {validUntil}",
            $"Quotation total: {total}",
            $"Payment term: {data.PaymentTerm}",
            "",
            $"These prices are held until {validUntil}. Reply to this email to accept the",
            "quotation and we will raise your invoice.",
            "",
            "This quotation is not an invoice and is not proof of payment.",
            "",
            $"Questions? Email {data.SupportEmail}.",
        });

        return _layout.Render(new TransactionalEmailContent(
            Subject: message.Subject,
            Preheader: $"Quotation {data.QuotationNumber} — valid until {validUntil}.",
            Eyebrow: "Quotation",
            Title: $"Your quotation is ready",
            BodyHtml: body,
            TextBody: text,
            PrimaryAction: null,
            TransactionReason:
                "You are receiving this because MyPetLink prepared a quotation for your business."));
    }
}

public sealed class MerchantInvoiceEmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly TransactionalEmailLayout _layout;

    public MerchantInvoiceEmailTemplateRenderer(TransactionalEmailLayout layout)
    {
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.MerchantInvoice)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        var data = MerchantEmailJson.Read<MerchantInvoiceEmailTemplateData>(message);
        var amount = MerchantEmailJson.Money(data.Currency, data.AmountDue);

        var details = new List<TransactionalEmailDetail>
        {
            new("Invoice number", data.InvoiceNumber),
            new("Order number", data.MerchantOrderNumber),
            new("Invoice date", MerchantEmailJson.Date(data.InvoiceDate)),
            new("Amount due", amount),
            new("Payment term", data.PaymentTerm),
        };

        var body =
            _layout.Paragraph($"Hi {data.ContactPerson},")
            + _layout.Paragraph(
                $"Your invoice for {data.MerchantName} is attached as a PDF.")
            + _layout.DetailRows(details)
            + (string.IsNullOrWhiteSpace(data.PaymentInstructions)
                ? ""
                : _layout.InformationCard("How to pay",
                    _layout.Paragraph(data.PaymentInstructions!)))
            + _layout.Paragraph(
                $"Please quote {data.InvoiceNumber} as your payment reference so we can match "
                + "your payment quickly. Your order is prepared once payment is confirmed.");

        var lines = new List<string>
        {
            $"Hi {data.ContactPerson},",
            "",
            $"Your MyPetLink invoice for {data.MerchantName} is attached as a PDF.",
            "",
            $"Invoice number: {data.InvoiceNumber}",
            $"Order number: {data.MerchantOrderNumber}",
            $"Invoice date: {MerchantEmailJson.Date(data.InvoiceDate)}",
            $"Amount due: {amount}",
            $"Payment term: {data.PaymentTerm}",
            "",
        };

        if (!string.IsNullOrWhiteSpace(data.PaymentInstructions))
        {
            lines.Add($"How to pay: {data.PaymentInstructions}");
            lines.Add("");
        }

        lines.AddRange(
        [
            $"Please quote {data.InvoiceNumber} as your payment reference so we can match your",
            "payment quickly. Your order is prepared once payment is confirmed.",
            "",
            $"Questions? Email {data.SupportEmail}.",
        ]);

        var text = string.Join("\n", lines);

        return _layout.Render(new TransactionalEmailContent(
            Subject: message.Subject,
            Preheader: $"Invoice {data.InvoiceNumber} — {amount} due on receipt.",
            Eyebrow: "Invoice",
            Title: "Your invoice is ready",
            BodyHtml: body,
            TextBody: text,
            PrimaryAction: null,
            TransactionReason:
                "You are receiving this because MyPetLink issued an invoice for your business."));
    }
}

public sealed class MerchantPaymentConfirmationEmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly TransactionalEmailLayout _layout;

    public MerchantPaymentConfirmationEmailTemplateRenderer(TransactionalEmailLayout layout)
    {
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.MerchantPaymentConfirmation)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        var data = MerchantEmailJson.Read<MerchantPaymentConfirmationEmailTemplateData>(message);
        var amount = MerchantEmailJson.Money(data.Currency, data.AmountReceived);
        var paidOn = MerchantEmailJson.Date(data.PaymentDate);

        var details = new List<TransactionalEmailDetail>
        {
            new("Receipt number", data.ReceiptNumber),
            new("Invoice number", data.InvoiceNumber),
            new("Order number", data.MerchantOrderNumber),
            new("Amount received", amount),
            new("Payment date", paidOn),
            new("Payment method", data.PaymentMethod),
        };

        var body =
            _layout.Paragraph($"Hi {data.ContactPerson},")
            + _layout.Paragraph(
                $"We have received your payment of {amount} for {data.MerchantName}. Your "
                + "official receipt is attached as a PDF.")
            + _layout.DetailRows(details)
            + _layout.Paragraph(
                "Your order is now confirmed and we will be in touch as it is prepared.");

        var text = string.Join("\n", new[]
        {
            $"Hi {data.ContactPerson},",
            "",
            $"We have received your payment of {amount} for {data.MerchantName}.",
            "Your official receipt is attached as a PDF.",
            "",
            $"Receipt number: {data.ReceiptNumber}",
            $"Invoice number: {data.InvoiceNumber}",
            $"Order number: {data.MerchantOrderNumber}",
            $"Amount received: {amount}",
            $"Payment date: {paidOn}",
            $"Payment method: {data.PaymentMethod}",
            "",
            "Your order is now confirmed and we will be in touch as it is prepared.",
            "",
            $"Questions? Email {data.SupportEmail}.",
        });

        return _layout.Render(new TransactionalEmailContent(
            Subject: message.Subject,
            Preheader: $"Payment of {amount} received — receipt {data.ReceiptNumber}.",
            Eyebrow: "Payment received",
            Title: "Thank you — payment received",
            BodyHtml: body,
            TextBody: text,
            PrimaryAction: null,
            TransactionReason:
                "You are receiving this because MyPetLink recorded a payment for your business."));
    }
}

public sealed class MerchantOrderShippedEmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly TransactionalEmailLayout _layout;

    public MerchantOrderShippedEmailTemplateRenderer(TransactionalEmailLayout layout)
    {
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.MerchantOrderShipped)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        var data = MerchantEmailJson.Read<MerchantOrderShippedEmailTemplateData>(message);
        var shipped = MerchantEmailJson.Date(data.ShippedAt);

        var details = new List<TransactionalEmailDetail>
        {
            new("Order number", data.MerchantOrderNumber),
            new("Delivery order number", data.DeliveryOrderNumber),
            new("Shipped on", shipped),
            new("Courier", data.CourierName),
        };

        if (!string.IsNullOrWhiteSpace(data.CourierService))
        {
            details.Add(new("Service", data.CourierService!));
        }

        // Always shown, link or no link: the number is what a merchant needs to
        // chase a parcel, and it is the only thing that works on the phone.
        details.Add(new("Tracking number", data.TrackingNumber));

        var items = data.Items.Count == 0
            ? ""
            : _layout.DetailRows(data.Items
                .Select(item => new TransactionalEmailDetail(
                    $"{item.ProductName} ({item.SkuCode})",
                    $"{item.Quantity}"))
                .ToList());

        var body =
            _layout.Paragraph($"Hi {data.ContactPerson},")
            + _layout.Paragraph(
                $"Your MyPetLink order has been shipped. The delivery order for "
                + $"{data.MerchantName} is attached as a PDF.")
            + _layout.DetailRows(details)
            + (data.TrackingUrl is null
                ? _layout.Paragraph(
                    "You can track your parcel directly with the courier using this "
                    + "tracking number.")
                : "")
            + (items.Length > 0
                ? _layout.Paragraph("What is in this shipment") + items
                : "")
            + _layout.Paragraph(
                "Please check the parcel on arrival and keep the delivery order for your "
                + "records.", subdued: true);

        var lines = new List<string>
        {
            $"Hi {data.ContactPerson},",
            "",
            $"Your MyPetLink order has been shipped. The delivery order for {data.MerchantName}",
            "is attached as a PDF.",
            "",
            $"Order number: {data.MerchantOrderNumber}",
            $"Delivery order number: {data.DeliveryOrderNumber}",
            $"Shipped on: {shipped}",
            $"Courier: {data.CourierName}",
        };

        if (!string.IsNullOrWhiteSpace(data.CourierService))
        {
            lines.Add($"Service: {data.CourierService}");
        }

        lines.Add($"Tracking number: {data.TrackingNumber}");
        lines.Add(data.TrackingUrl is null
            ? "You can track your parcel directly with the courier using this tracking number."
            : $"Track parcel: {data.TrackingUrl}");

        if (data.Items.Count > 0)
        {
            lines.Add("");
            lines.Add("What is in this shipment:");
            lines.AddRange(data.Items.Select(item =>
                $"  {item.ProductName} ({item.SkuCode}) x {item.Quantity}"));
        }

        lines.Add("");
        lines.Add("Please check the parcel on arrival and keep the delivery order for your");
        lines.Add("records.");
        lines.Add("");
        lines.Add($"Questions? Email {data.SupportEmail}.");

        // No button at all when there is nothing to link to: an empty Track
        // Parcel is worse than none.
        var action = data.TrackingUrl is null
            ? null
            : new TransactionalEmailAction("Track Parcel", data.TrackingUrl, Wide: true);

        return _layout.Render(new TransactionalEmailContent(
            Subject: message.Subject,
            Preheader: $"{data.MerchantOrderNumber} shipped — tracking {data.TrackingNumber}.",
            Eyebrow: "Shipped",
            Title: "Your order is on its way",
            BodyHtml: body,
            TextBody: string.Join(Environment.NewLine, lines),
            PrimaryAction: action,
            TransactionReason:
                "You are receiving this because MyPetLink shipped an order for your business."));
    }
}
