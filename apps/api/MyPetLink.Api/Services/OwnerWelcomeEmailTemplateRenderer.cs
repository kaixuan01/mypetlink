using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class OwnerWelcomeEmailTemplateRenderer
{
    private const string SupportEmail = "support@mypetlink.com.my";
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private readonly EmailOptions _options;

    public OwnerWelcomeEmailTemplateRenderer(IOptions<EmailOptions> options)
    {
        _options = options.Value;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.OwnerWelcome)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        OwnerWelcomeEmailTemplateData data;
        try
        {
            data = JsonSerializer.Deserialize<OwnerWelcomeEmailTemplateData>(
                       message.TemplateDataJson,
                       TemplateJson)
                   ?? throw new JsonException("Template data was empty.");
        }
        catch (JsonException exception)
        {
            throw new EmailDeliveryException("The email content could not be prepared.", false, exception);
        }

        if (!Uri.TryCreate(data.OwnerPortalUrl, UriKind.Absolute, out var portalUri)
            || portalUri.Scheme is not ("https" or "http")
            || !string.IsNullOrEmpty(portalUri.UserInfo))
        {
            throw new EmailDeliveryException("The Owner Portal link could not be prepared.", false);
        }

        var enc = HtmlEncoder.Default;
        var greeting = string.IsNullOrWhiteSpace(data.OwnerName)
            ? "Hi there,"
            : $"Hi {data.OwnerName},";
        var logo = BuildLogo(enc);
        var smartTagHtml = data.SmartTagsEnabled
            ? """
              <p style="margin:20px 0 0;font-size:14px;line-height:1.65;color:#5f6f68">
                You can also link a MyPetLink QR or NFC tag to your pet when available.
              </p>
              """
            : "";

        var html = $$"""
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>{{enc.Encode(message.Subject)}}</title>
              </head>
              <body style="margin:0;background:#f5f4ef;color:#23312b;font-family:Arial,Helvetica,sans-serif">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;min-width:100%;table-layout:fixed;background:#f5f4ef">
                  <tr>
                    <td align="center" style="padding:24px 12px">
                      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e4e0d7;border-radius:20px">
                        <tr>
                          <td style="padding:28px 28px 24px;background:#1f6b5b;color:#ffffff;border-radius:20px 20px 0 0">
                            {{logo}}
                            <div style="font-size:24px;font-weight:800;line-height:1.2">MyPetLink</div>
                            <div style="margin-top:7px;font-size:14px;line-height:1.5">A safe and shareable profile for your pet.</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:30px 28px">
                            <h1 style="margin:0 0 18px;font-size:27px;line-height:1.25;color:#23312b">Welcome to MyPetLink</h1>
                            <p style="margin:0 0 16px;font-size:16px;line-height:1.65">{{enc.Encode(greeting)}}</p>
                            <p style="margin:0 0 24px;font-size:16px;line-height:1.65">
                              Welcome to MyPetLink! You can now create and manage a shareable profile for your pet, keep important care information together, and make it easier for someone to contact you if your pet is found.
                            </p>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f7f3ea;border-radius:16px">
                              <tr>
                                <td style="padding:20px 20px 8px;font-size:17px;font-weight:800">Getting started</td>
                              </tr>
                              <tr>
                                <td style="padding:8px 20px">
                                  <strong>1. Add your pet</strong><br>
                                  <span style="color:#5f6f68;line-height:1.55">Create your pet's profile and upload a clear profile photo.</span>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:8px 20px">
                                  <strong>2. Update your contact details</strong><br>
                                  <span style="color:#5f6f68;line-height:1.55">Make sure finders can reach you when it matters.</span>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:8px 20px 20px">
                                  <strong>3. Review the public profile</strong><br>
                                  <span style="color:#5f6f68;line-height:1.55">Choose what information you want other people to see.</span>
                                </td>
                              </tr>
                            </table>
                            {{smartTagHtml}}
                            <p style="margin:28px 0;text-align:center">
                              <a href="{{enc.Encode(portalUri.AbsoluteUri)}}" style="display:inline-block;background:#1f6b5b;color:#ffffff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:999px">Go to Owner Portal</a>
                            </p>
                            <p style="margin:0;font-size:14px;line-height:1.65;color:#5f6f68">
                              Need help? Contact us at <a href="mailto:{{SupportEmail}}" style="color:#1f6b5b">{{SupportEmail}}</a>.
                            </p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:20px 28px;border-top:1px solid #ebe7df;font-size:12px;line-height:1.6;color:#74817b">
                            <strong style="color:#23312b">MyPetLink</strong><br>
                            <a href="https://mypetlink.com.my" style="color:#1f6b5b">mypetlink.com.my</a> &middot; {{SupportEmail}}<br>
                            This service email was sent because your MyPetLink Owner Portal account was opened.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
            """;

        var text = new StringBuilder()
            .AppendLine("MyPetLink")
            .AppendLine("A safe and shareable profile for your pet.")
            .AppendLine()
            .AppendLine("Welcome to MyPetLink")
            .AppendLine()
            .AppendLine(greeting)
            .AppendLine()
            .AppendLine("Welcome to MyPetLink! You can now create and manage a shareable profile for your pet, keep important care information together, and make it easier for someone to contact you if your pet is found.")
            .AppendLine()
            .AppendLine("Getting started")
            .AppendLine("1. Add your pet")
            .AppendLine("Create your pet's profile and upload a clear profile photo.")
            .AppendLine()
            .AppendLine("2. Update your contact details")
            .AppendLine("Make sure finders can reach you when it matters.")
            .AppendLine()
            .AppendLine("3. Review the public profile")
            .AppendLine("Choose what information you want other people to see.")
            .AppendLine();

        if (data.SmartTagsEnabled)
        {
            text.AppendLine()
                .AppendLine("You can also link a MyPetLink QR or NFC tag to your pet when available.");
        }

        text.AppendLine()
            .AppendLine("Go to Owner Portal:")
            .AppendLine(portalUri.AbsoluteUri)
            .AppendLine()
            .AppendLine($"Need help? Contact us at {SupportEmail}.")
            .AppendLine()
            .AppendLine("MyPetLink")
            .AppendLine("https://mypetlink.com.my")
            .AppendLine("This service email was sent because your MyPetLink Owner Portal account was opened.");

        return new RenderedEmail(html, text.ToString());
    }

    private string BuildLogo(HtmlEncoder encoder)
    {
        if (!Uri.TryCreate(_options.BrandLogoUrl, UriKind.Absolute, out var logoUri)
            || logoUri.Scheme != Uri.UriSchemeHttps
            || !string.IsNullOrEmpty(logoUri.UserInfo))
        {
            return "";
        }

        return $"""
            <img src="{encoder.Encode(logoUri.AbsoluteUri)}" width="180" alt="MyPetLink" style="display:block;width:180px;max-width:100%;height:auto;margin:0 0 16px;border:0">
            """;
    }
}
