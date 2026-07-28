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
    [InlineData("welcome", "images-blocked")]
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

        Assert.Contains("width=\"88%\"", welcome.HtmlBody);
        Assert.DoesNotContain("width=\"88%\"", payment.HtmlBody);

        foreach (var rendered in new[] { welcome, payment })
        {
            Assert.Contains("https://mypetlink.com.my/logo-horizontal.png", rendered.HtmlBody);
            Assert.Contains("alt=\"MyPetLink\"", rendered.HtmlBody);
            Assert.Contains("background-color:#1570ef", rendered.HtmlBody);
            Assert.Contains(
                "Need help?",
                rendered.HtmlBody);
            Assert.Contains("We’re here to help at", rendered.HtmlBody);
            Assert.Contains(
                "MyPetLink &middot;",
                rendered.HtmlBody);
        }
    }

    [Fact]
    public void ImagesBlockedPreview_KeepsReadableBrandAndCompleteSteps()
    {
        var preview = PreviewService().Render("welcome", "images-blocked");

        Assert.Contains("https://email-preview.invalid/blocked-1.png", preview.HtmlBody);
        Assert.Contains("https://email-preview.invalid/blocked-2.png", preview.HtmlBody);
        Assert.Contains("https://email-preview.invalid/blocked-3.png", preview.HtmlBody);
        Assert.Contains("https://email-preview.invalid/blocked-4.png", preview.HtmlBody);
        Assert.Contains("alt=\"MyPetLink\"", preview.HtmlBody);
        Assert.Contains("alt=\"Pet profile\"", preview.HtmlBody);
        Assert.Contains("alt=\"Contact details\"", preview.HtmlBody);
        Assert.Contains("alt=\"Preview public profile\"", preview.HtmlBody);
        Assert.Contains("Welcome to MyPetLink, Aina!", preview.HtmlBody);
        Assert.Contains("Create your pet&#x2019;s profile", preview.HtmlBody);
        Assert.Contains("Add your contact details", preview.HtmlBody);
        Assert.Contains("Preview your public profile", preview.HtmlBody);
        Assert.Contains("You&#x2019;re almost there!", preview.HtmlBody);
        Assert.Contains(
            "Complete your profile and you&#x2019;re ready to share it.",
            preview.HtmlBody);
        Assert.Contains("Just a few simple steps", preview.HtmlBody);
        Assert.Contains("Just a few simple steps", preview.TextBody);
        Assert.Contains("alt=\"Ready to share\"", preview.HtmlBody);
        Assert.Contains(">1</div>", preview.HtmlBody);
        Assert.Contains(">2</div>", preview.HtmlBody);
        Assert.Contains(">3</div>", preview.HtmlBody);
        Assert.Contains(">4</div>", preview.HtmlBody);
        Assert.Contains(TransactionalEmailLayout.Tagline, preview.TextBody);
        Assert.Contains(
            "Hi, I&#x2019;m Linko!",
            preview.HtmlBody);
        Assert.Contains(
            "Let&#x2019;s set up your pet&#x2019;s profile in a few simple steps.",
            preview.HtmlBody);
        Assert.Contains("Create My Pet Profile", preview.HtmlBody);
        Assert.Contains("Need help?", preview.HtmlBody);
    }

    [Fact]
    public void MascotIsWelcomeOnly_AndTransactionalTemplatesStayRestrained()
    {
        var previews = PreviewService();
        var welcome = previews.Render("welcome", "normal");
        var payment = previews.Render("payment-confirmed", "normal");

        Assert.Contains("linko-hero.png", welcome.HtmlBody);
        Assert.DoesNotContain("linko", payment.HtmlBody, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void WelcomeRemoteAssets_AreOptimizedPngsWithinThePayloadBudget()
    {
        var webPublic = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..", "..",
            "web", "public"));
        string[] relativeFiles =
        [
            "logo-horizontal.png",
            "email-assets/linko-hero.png",
            "email-assets/linko-support-sit.png",
            "email-assets/welcome-profile.png",
            "email-assets/welcome-contact.png",
            "email-assets/welcome-preview.png",
            "email-assets/welcome-ready.png",
            "email-assets/welcome-paw-decoration.png",
            "email-assets/welcome-sparkles.png",
            "email-assets/welcome-wave-accent.png"
        ];

        long payloadBytes = 0;
        foreach (var relativeFile in relativeFiles)
        {
            var path = Path.Combine(webPublic, relativeFile);
            Assert.True(File.Exists(path), $"Missing email asset: {relativeFile}");
            var signature = File.ReadAllBytes(path).Take(8).ToArray();
            Assert.Equal(
                new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 },
                signature);
            payloadBytes += new FileInfo(path).Length;
        }

        Assert.Equal(115_542, payloadBytes);
        Assert.True(payloadBytes < 120_000);
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

    [Fact]
    public void EmailOptions_RequirePublicHttpsBrandAssetBaseWhenDeliveryIsEnabled()
    {
        var options = OptionsValue();
        options.Enabled = true;
        options.BrandAssetBaseUrl = "http://mypetlink.com.my/email-assets";

        var result = new EmailOptionsValidator().Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(
            result.Failures!,
            failure => failure.Contains("BrandAssetBaseUrl", StringComparison.Ordinal));
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
        BrandLogoUrl = "https://mypetlink.com.my/logo-horizontal.png",
        BrandAssetBaseUrl = "https://mypetlink.com.my/email-assets"
    };
}
