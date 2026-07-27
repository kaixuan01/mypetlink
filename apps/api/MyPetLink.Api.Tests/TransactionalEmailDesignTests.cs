using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class TransactionalEmailDesignTests
{
    [Theory]
    [InlineData("welcome", "normal")]
    [InlineData("welcome", "long-name")]
    [InlineData("welcome", "missing-name")]
    [InlineData("welcome", "logo-blocked")]
    [InlineData("payment-confirmed", "normal")]
    public void DevelopmentPreviews_RenderHtmlAndPlainTextWithoutSending(
        string template,
        string variant)
    {
        var preview = PreviewService().Render(template, variant);

        Assert.StartsWith("<!doctype html>", preview.HtmlBody);
        Assert.Contains("class=\"email-card\"", preview.HtmlBody);
        Assert.Contains("class=\"email-header\"", preview.HtmlBody);
        Assert.Contains("class=\"email-footer", preview.HtmlBody);
        Assert.Contains("MyPetLink · mypetlink.com.my", preview.TextBody);
        Assert.Contains("support@mypetlink.com.my", preview.HtmlBody);
        Assert.Contains("support@mypetlink.com.my", preview.TextBody);
        Assert.DoesNotContain("#1f6b5b", preview.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<script", preview.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@font-face", preview.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("tracking", preview.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bearer", preview.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("jwt", preview.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(
            "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            preview.HtmlBody,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ExistingTemplates_UseTheSameHeaderFooterAndPrimaryButton()
    {
        var previews = PreviewService();
        var welcome = previews.Render("welcome", "normal");
        var payment = previews.Render("payment-confirmed", "normal");

        foreach (var rendered in new[] { welcome, payment })
        {
            Assert.Contains("https://mypetlink.com.my/logo-horizontal.png", rendered.HtmlBody);
            Assert.Contains("alt=\"MyPetLink\"", rendered.HtmlBody);
            Assert.Contains("background-color:#1570ef", rendered.HtmlBody);
            Assert.Contains(
                "Need help? Contact us at",
                rendered.HtmlBody);
            Assert.Contains(
                "MyPetLink &middot;",
                rendered.HtmlBody);
        }
    }

    [Fact]
    public void LogoBlockedPreview_KeepsReadableBrandFallback()
    {
        var preview = PreviewService().Render("welcome", "logo-blocked");

        Assert.Contains("https://email-preview.invalid/logo-blocked.png", preview.HtmlBody);
        Assert.Contains("alt=\"MyPetLink\"", preview.HtmlBody);
        Assert.Contains("Welcome to MyPetLink, Aina!", preview.HtmlBody);
        Assert.Contains(TransactionalEmailLayout.Tagline, preview.TextBody);
    }

    [Fact]
    public void EmailOptions_RequirePublicHttpsLogoWhenDeliveryIsEnabled()
    {
        var options = OptionsValue();
        options.Enabled = true;
        options.BrandLogoUrl = "http://localhost/logo.png";

        var result = new EmailOptionsValidator().Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(
            result.Failures!,
            failure => failure.Contains("BrandLogoUrl", StringComparison.Ordinal));
    }

    [Fact]
    public void EmailOptions_RejectNonLoopbackHttpPortalOriginWhenDeliveryIsEnabled()
    {
        var options = OptionsValue();
        options.Enabled = true;
        options.OwnerPortalBaseUrl = "http://mypetlink.com.my";

        var result = new EmailOptionsValidator().Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(
            result.Failures!,
            failure => failure.Contains("OwnerPortalBaseUrl", StringComparison.Ordinal));
    }

    private static EmailPreviewService PreviewService()
    {
        var options = Options.Create(OptionsValue());
        var layout = new TransactionalEmailLayout(options);
        return new EmailPreviewService(
            new OwnerWelcomeEmailTemplateRenderer(layout),
            new PaymentConfirmedEmailTemplateRenderer(options, layout));
    }

    private static EmailOptions OptionsValue() => new()
    {
        Enabled = false,
        Provider = EmailOptions.DevelopmentProvider,
        OwnerPortalBaseUrl = "https://mypetlink.com.my",
        BrandLogoUrl = "https://mypetlink.com.my/logo-horizontal.png"
    };
}
