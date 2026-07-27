using System.Text;
using System.Text.Encodings.Web;
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

    public PaymentConfirmedEmailTemplateRenderer(IOptions<EmailOptions> options)
    {
        _options = options.Value;
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
        var enc = HtmlEncoder.Default;

        var html = $$"""
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>{{enc.Encode(message.Subject)}}</title>
              </head>
              <body style="margin:0;background:#f7f3ea;color:#23312b;font-family:Arial,Helvetica,sans-serif">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ea;padding:24px 12px">
                  <tr><td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e6dfd2">
                      <tr><td style="background:#1f6b5b;padding:28px 32px;color:#ffffff">
                        <div style="font-size:25px;font-weight:800">MyPetLink</div>
                        <div style="margin-top:6px;font-size:14px">A safer way home for your pet.</div>
                      </td></tr>
                      <tr><td style="padding:32px">
                        <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#23312b">Payment confirmed</h1>
                        <p style="margin:0 0 16px;line-height:1.65">Hi {{enc.Encode(data.OwnerName)}},</p>
                        <p style="margin:0 0 22px;line-height:1.65">We’ve received your payment. Your MyPetLink order is now confirmed.</p>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ea;border-radius:16px;padding:8px 18px">
                          <tr><td style="padding:10px 0;color:#68756f">Order number</td><td align="right" style="padding:10px 0;font-weight:700">{{enc.Encode(data.OrderNumber)}}</td></tr>
                          <tr><td style="padding:10px 0;color:#68756f">Amount paid</td><td align="right" style="padding:10px 0;font-weight:700">{{enc.Encode(amount)}}</td></tr>
                          <tr><td style="padding:10px 0;color:#68756f">Confirmed</td><td align="right" style="padding:10px 0;font-weight:700">{{enc.Encode(date)}}</td></tr>
                          <tr><td style="padding:10px 0;color:#68756f">Tag</td><td align="right" style="padding:10px 0;font-weight:700">{{enc.Encode(data.ProductName)}} · {{enc.Encode(data.VariantName)}}</td></tr>
                          <tr><td style="padding:10px 0;color:#68756f">For</td><td align="right" style="padding:10px 0;font-weight:700">{{enc.Encode(data.PetName)}}</td></tr>
                        </table>
                        <p style="margin:22px 0;line-height:1.65">Our team will prepare the next fulfilment step. You can continue to follow your order and download the Official Receipt from the Owner Portal.</p>
                        <p style="margin:26px 0;text-align:center">
                          <a href="{{enc.Encode(receiptUrl)}}" style="display:inline-block;background:#1f6b5b;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px">Download Receipt</a>
                        </p>
                        <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#68756f">Need help? Contact <a href="mailto:support@mypetlink.com.my" style="color:#1f6b5b">support@mypetlink.com.my</a>.</p>
                      </td></tr>
                    </table>
                  </td></tr>
                </table>
              </body>
            </html>
            """;

        var text = new StringBuilder()
            .AppendLine("MyPetLink")
            .AppendLine("Payment confirmed")
            .AppendLine()
            .AppendLine($"Hi {data.OwnerName},")
            .AppendLine()
            .AppendLine("We’ve received your payment. Your MyPetLink order is now confirmed.")
            .AppendLine()
            .AppendLine($"Order number: {data.OrderNumber}")
            .AppendLine($"Amount paid: {amount}")
            .AppendLine($"Confirmed: {date}")
            .AppendLine($"Tag: {data.ProductName} · {data.VariantName}")
            .AppendLine($"For: {data.PetName}")
            .AppendLine()
            .AppendLine("Our team will prepare the next fulfilment step. You can follow your order and download the Official Receipt from the Owner Portal.")
            .AppendLine()
            .AppendLine("Download Receipt:")
            .AppendLine(receiptUrl)
            .AppendLine()
            .AppendLine("Need help? support@mypetlink.com.my")
            .ToString();

        return new RenderedEmail(html, text);
    }

    private string BuildReceiptUrl(string orderNumber)
    {
        var baseUri = new Uri(_options.OwnerPortalBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        return new Uri(baseUri, $"orders/view?order={Uri.EscapeDataString(orderNumber)}").AbsoluteUri;
    }
}
