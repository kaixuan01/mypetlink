using System.Text;
using System.Text.Encodings.Web;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.Services;

public sealed record TransactionalEmailAction(
    string Label,
    string Url);

public sealed record TransactionalEmailContent(
    string Subject,
    string Preheader,
    string? Eyebrow,
    string Title,
    string BodyHtml,
    string TextBody,
    TransactionalEmailAction? PrimaryAction,
    string TransactionReason,
    TransactionalEmailMascot? SupportMascot = null);

/// <summary>
/// Approved Linko illustration. Mascots are supporting visuals only: the
/// adjacent real text must carry the full meaning when images are blocked.
/// </summary>
public sealed record TransactionalEmailMascot(
    string ImageFileName,
    string ImageAltText,
    int DisplaySize);

public sealed record TransactionalEmailStep(
    string IconFileName,
    string IconAltText,
    string Title,
    string Description);

public sealed record TransactionalEmailDetail(
    string Label,
    string Value);

/// <summary>
/// Email-safe translation of the active MyPetLink Web design system. Customer
/// templates compose the helpers below and never recreate the document shell.
/// </summary>
public sealed class TransactionalEmailLayout
{
    public const string SupportEmail = "support@mypetlink.com.my";
    public const string WebsiteUrl = "https://mypetlink.com.my";
    public const string Tagline = "A safe and shareable profile for your pet.";

    public const string Cream = "#fff8f2";
    public const string White = "#ffffff";
    public const string Apricot = "#ffe9de";
    public const string Coral = "#ff7a6e";
    public const string Blue = "#1570ef";
    public const string Ink = "#0d1b3d";
    public const string Muted = "#44506a";
    public const string Border = "#f0dcd0";
    public const string BlueSurface = "#f1f9ff";

    private static readonly HtmlEncoder Encoder = HtmlEncoder.Default;
    private readonly EmailOptions _options;

    public TransactionalEmailLayout(IOptions<EmailOptions> options)
    {
        _options = options.Value;
    }

    public RenderedEmail Render(TransactionalEmailContent content)
    {
        var action = ValidateAction(content.PrimaryAction);
        var header = BuildHeader();
        var eyebrow = string.IsNullOrWhiteSpace(content.Eyebrow)
            ? ""
            : $"""
               <div style="margin:0 0 10px;font-size:13px;line-height:1.4;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:{Blue}">
                 {Encoder.Encode(content.Eyebrow)}
               </div>
               """;
        var actionHtml = action is null ? "" : PrimaryAction(action);

        var html = $$"""
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <meta name="color-scheme" content="light dark">
                <meta name="supported-color-schemes" content="light dark">
                <title>{{Encoder.Encode(content.Subject)}}</title>
                <style>
                  :root { color-scheme: light dark; supported-color-schemes: light dark; }
                  @media only screen and (max-width: 620px) {
                    .email-outer { padding: 12px 8px !important; }
                    .email-header { padding: 24px 20px 22px !important; }
                    .email-content { padding: 28px 22px !important; }
                    .email-footer { padding: 20px 22px !important; }
                    .email-title { font-size: 26px !important; }
                    .email-action { width: 100% !important; }
                    .email-action td { width: 100% !important; }
                    .email-action a { display: block !important; padding: 15px 18px !important; }
                    .email-info-heading { padding-left: 16px !important; padding-right: 16px !important; }
                    .email-info-body { padding-left: 16px !important; padding-right: 16px !important; }
                    .email-detail-value { text-align: left !important; padding-top: 2px !important; }
                    .email-support-mascot { display: none !important; }
                  }
                  @media (prefers-color-scheme: dark) {
                    .email-bg { background-color: #111a2e !important; }
                    .email-card, .email-header, .email-content { background-color: #ffffff !important; }
                    .email-footer { background-color: #fff8f2 !important; }
                    .email-title, .email-text { color: #0d1b3d !important; }
                    .email-muted { color: #44506a !important; }
                  }
                </style>
              </head>
              <body class="email-bg" style="margin:0;padding:0;background-color:{{Cream}};color:{{Ink}};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
                <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">
                  {{Encoder.Encode(content.Preheader)}}
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="{{Cream}}" class="email-bg" style="width:100%;min-width:100%;table-layout:fixed;background-color:{{Cream}}">
                  <tr>
                    <td align="center" class="email-outer" style="padding:24px 12px">
                      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-card" style="width:100%;max-width:600px;background-color:{{White}};border:1px solid {{Border}};border-radius:24px;border-collapse:separate;box-shadow:0 16px 40px rgba(13,27,61,.08)">
                        <tr>
                          <td align="center" class="email-header" style="padding:28px 32px 24px;background-color:{{White}};border-radius:24px 24px 0 0;border-bottom:1px solid {{Border}}">
                            {{header}}
                          </td>
                        </tr>
                        <tr>
                          <td class="email-content email-text" style="padding:34px 36px;background-color:{{White}};color:{{Ink}}">
                            {{eyebrow}}
                            <h1 class="email-title" style="margin:0 0 18px;font-size:29px;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:{{Ink}};overflow-wrap:anywhere;word-break:break-word">{{Encoder.Encode(content.Title)}}</h1>
                            {{content.BodyHtml}}
                            {{actionHtml}}
                            {{Divider()}}
                            {{SupportBlock(content.SupportMascot)}}
                          </td>
                        </tr>
                        <tr>
                          <td class="email-footer email-muted" style="padding:22px 36px;background-color:{{Cream}};border-top:1px solid {{Border}};border-radius:0 0 24px 24px;font-size:14px;line-height:1.65;color:{{Muted}}">
                            <div style="font-weight:800;color:{{Ink}}">MyPetLink &middot; <a href="{{WebsiteUrl}}" style="color:{{Blue}};text-decoration:none">mypetlink.com.my</a></div>
                            <div style="margin-top:6px">{{Encoder.Encode(content.TransactionReason)}}</div>
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
            .AppendLine(Tagline)
            .AppendLine()
            .AppendLine(content.Title)
            .AppendLine()
            .Append(content.TextBody.Trim())
            .AppendLine();

        if (action is not null)
        {
            text.AppendLine()
                .AppendLine($"{action.Label}:")
                .AppendLine(action.Url);
        }

        text.AppendLine()
            .AppendLine("Need a hand?")
            .AppendLine($"We’re here to help at {SupportEmail}.")
            .AppendLine()
            .AppendLine("MyPetLink · mypetlink.com.my")
            .AppendLine(content.TransactionReason);

        return new RenderedEmail(html, text.ToString());
    }

    public string Paragraph(string text, bool subdued = false)
    {
        var color = subdued ? Muted : Ink;
        return $"""
            <p class="{(subdued ? "email-muted" : "email-text")}" style="margin:0 0 18px;font-size:16px;line-height:1.65;color:{color};overflow-wrap:anywhere;word-break:break-word">{Encoder.Encode(text)}</p>
            """;
    }

    /// <summary>
    /// Welcome and onboarding hero: one approved Linko illustration above a
    /// spoken message. The message is real text, so the hero still reads
    /// correctly when the illustration is blocked.
    /// </summary>
    public string MascotHero(
        TransactionalEmailMascot mascot,
        string heading,
        string message)
    {
        var size = mascot.DisplaySize;
        return $"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:8px 0 4px;border-collapse:collapse">
              <tr>
                <td align="center" style="padding:0 0 6px">
                  <img src="{Encoder.Encode(EmailAssetUrl(mascot.ImageFileName))}" width="{size}" height="{size}" alt="{Encoder.Encode(mascot.ImageAltText)}" style="display:block;width:{size}px;max-width:100%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;color:{Ink};font-size:13px;line-height:1.4">
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:0">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="border-collapse:separate">
                    <tr>
                      <td class="email-text" style="padding:14px 20px;background-color:{BlueSurface};border:1px solid #d8eaff;border-radius:18px;font-size:16px;line-height:1.55;color:{Ink};text-align:center">
                        <div style="font-weight:800">{Encoder.Encode(heading)}</div>
                        <div style="margin-top:2px">{Encoder.Encode(message)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            """;
    }

    public string InformationCard(string heading, string contentHtml) =>
        $"""
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:24px 0;background-color:{BlueSurface};border:1px solid #d8eaff;border-radius:18px;border-collapse:separate">
          <tr>
            <td class="email-info-heading" style="padding:20px 20px 8px;font-size:18px;line-height:1.4;font-weight:800;color:{Ink}">{Encoder.Encode(heading)}</td>
          </tr>
          <tr>
            <td class="email-info-body" style="padding:8px 20px 20px">{contentHtml}</td>
          </tr>
        </table>
        """;

    public string NumberedSteps(IReadOnlyList<TransactionalEmailStep> steps)
    {
        var rows = new StringBuilder();
        for (var index = 0; index < steps.Count; index++)
        {
            var step = steps[index];
            var iconUrl = EmailAssetUrl(step.IconFileName);
            var separator = index == steps.Count - 1
                ? ""
                : "border-bottom:1px solid #d8eaff;";
            rows.Append($"""
                <tr>
                  <td width="32" valign="middle" align="left" style="width:32px;padding:12px 8px 12px 0;{separator}">
                    <div style="width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background-color:{Blue};color:{White};font-size:12px;font-weight:800">{index + 1}</div>
                  </td>
                  <td width="54" valign="middle" align="left" style="width:54px;padding:10px 10px 10px 0;{separator}">
                    <img src="{Encoder.Encode(iconUrl)}" width="44" height="44" alt="{Encoder.Encode(step.IconAltText)}" style="display:block;width:44px;height:44px;min-width:44px;border:0;outline:none;text-decoration:none;color:{Ink};font-size:9px;line-height:1.2">
                  </td>
                  <td valign="middle" style="padding:12px 0;{separator}font-size:15px;line-height:1.55;color:{Ink};overflow-wrap:anywhere;word-break:break-word">
                    <div style="font-weight:800">{Encoder.Encode(step.Title)}</div>
                    <div class="email-muted" style="margin-top:3px;color:{Muted}">{Encoder.Encode(step.Description)}</div>
                  </td>
                </tr>
                """);
        }

        return $"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">
              {rows}
            </table>
            """;
    }

    private string EmailAssetUrl(string fileName)
    {
        var configuredBaseUrl = _options.BrandAssetBaseUrl?.Trim();
        if (string.IsNullOrWhiteSpace(configuredBaseUrl)
            || string.IsNullOrWhiteSpace(fileName)
            || fileName.Contains('/')
            || fileName.Contains('\\')
            || fileName.Contains("..", StringComparison.Ordinal)
            || !Uri.TryCreate(configuredBaseUrl.TrimEnd('/') + "/", UriKind.Absolute, out var baseUri)
            || baseUri.Scheme != Uri.UriSchemeHttps
            || !string.IsNullOrEmpty(baseUri.UserInfo)
            || !string.IsNullOrEmpty(baseUri.Query)
            || !string.IsNullOrEmpty(baseUri.Fragment))
        {
            throw new EmailDeliveryException("The email brand asset could not be prepared.", false);
        }

        return new Uri(baseUri, fileName).AbsoluteUri;
    }

    public string DetailRows(IReadOnlyList<TransactionalEmailDetail> details)
    {
        var rows = new StringBuilder();
        for (var index = 0; index < details.Count; index++)
        {
            var detail = details[index];
            var border = index == details.Count - 1 ? "" : $"border-bottom:1px solid {Border};";
            rows.Append($"""
                <tr>
                  <td valign="top" class="email-muted" style="padding:11px 10px 11px 0;{border}font-size:14px;line-height:1.5;color:{Muted}">{Encoder.Encode(detail.Label)}</td>
                  <td valign="top" align="right" class="email-detail-value email-text" style="padding:11px 0 11px 10px;{border}font-size:14px;line-height:1.5;font-weight:800;color:{Ink};overflow-wrap:anywhere;word-break:break-word">{Encoder.Encode(detail.Value)}</td>
                </tr>
                """);
        }

        return $"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">
              {rows}
            </table>
            """;
    }

    public string StatusBadge(string text) =>
        $"""
        <span style="display:inline-block;padding:6px 10px;border-radius:999px;background-color:#e8f3ff;color:{Blue};font-size:12px;line-height:1.3;font-weight:800">{Encoder.Encode(text)}</span>
        """;

    public string Divider() =>
        $"""
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:28px 0 22px;border-collapse:collapse">
          <tr><td style="height:1px;background-color:{Border};font-size:1px;line-height:1px">&nbsp;</td></tr>
        </table>
        """;

    private string BuildHeader()
    {
        if (TryHttpsUri(_options.BrandLogoUrl, out var logoUri))
        {
            return $"""
                <img src="{Encoder.Encode(logoUri.AbsoluteUri)}" width="280" alt="MyPetLink" style="display:block;width:280px;max-width:100%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;color:{Ink};font-size:20px;font-weight:800;line-height:1.4">
                """;
        }

        return $"""
            <div style="font-size:26px;line-height:1.2;font-weight:800;color:{Ink}">MyPetLink</div>
            <div class="email-muted" style="margin-top:7px;font-size:14px;line-height:1.5;color:{Muted}">{Tagline}</div>
            """;
    }

    private static string PrimaryAction(TransactionalEmailAction action) =>
        $"""
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="email-action" style="margin:28px auto 4px;border-collapse:separate">
          <tr>
            <td align="center" bgcolor="{Blue}" style="background-color:{Blue};border:1px solid {Blue};border-radius:999px">
              <a href="{Encoder.Encode(action.Url)}" style="display:inline-block;padding:15px 28px;font-size:16px;line-height:1.2;font-weight:800;color:{White};text-decoration:none;border-radius:999px">{Encoder.Encode(action.Label)}</a>
            </td>
          </tr>
        </table>
        """;

    private string SupportBlock(TransactionalEmailMascot? mascot)
    {
        const string text = $"""
            <div class="email-text" style="margin:0;font-size:16px;line-height:1.5;font-weight:800;color:{Ink}">Need a hand?</div>
            <div class="email-muted" style="margin-top:3px;font-size:15px;line-height:1.65;color:{Muted};overflow-wrap:anywhere">
              We’re here to help at <a href="mailto:{SupportEmail}" style="font-weight:700;color:{Blue};text-decoration:underline">{SupportEmail}</a>.
            </div>
            """;

        if (mascot is null)
        {
            return text;
        }

        var size = mascot.DisplaySize;
        return $"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">
              <tr>
                <td width="{size + 14}" valign="middle" class="email-support-mascot" style="width:{size + 14}px;padding:0 14px 0 0">
                  <img src="{Encoder.Encode(EmailAssetUrl(mascot.ImageFileName))}" width="{size}" height="{size}" alt="{Encoder.Encode(mascot.ImageAltText)}" style="display:block;width:{size}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:{Ink};font-size:12px;line-height:1.4">
                </td>
                <td valign="middle">{text}</td>
              </tr>
            </table>
            """;
    }

    private static TransactionalEmailAction? ValidateAction(TransactionalEmailAction? action)
    {
        if (action is null)
        {
            return null;
        }

        if (!Uri.TryCreate(action.Url, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps
                && !(uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback))
            || !string.IsNullOrEmpty(uri.UserInfo)
            || string.IsNullOrWhiteSpace(action.Label))
        {
            throw new EmailDeliveryException("The email action link could not be prepared.", false);
        }

        return action with { Url = uri.AbsoluteUri };
    }

    private static bool TryHttpsUri(string? value, out Uri uri)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var candidate)
            && candidate.Scheme == Uri.UriSchemeHttps
            && string.IsNullOrEmpty(candidate.UserInfo))
        {
            uri = candidate;
            return true;
        }

        uri = null!;
        return false;
    }
}
