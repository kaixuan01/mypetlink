using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class OrderShippedEmailTests
{
    [Fact]
    public void Renderer_UsesSharedLayoutAndKeepsHtmlAndPlainTextEquivalent()
    {
        var options = Options.Create(new EmailOptions
        {
            OwnerPortalBaseUrl = "https://mypetlink.com.my",
            BrandLogoUrl = "https://mypetlink.com.my/logo-horizontal.png",
            BrandAssetBaseUrl = "https://mypetlink.com.my/email-assets"
        });
        var renderer = new OrderShippedEmailTemplateRenderer(
            options,
            new TransactionalEmailLayout(options));
        var data = new OrderShippedEmailTemplateData(
            "Aina & Family",
            "MPL-ORD-1001",
            "J&T Express",
            "Standard Delivery",
            "MY123456789",
            DateTimeOffset.Parse("2026-07-30T06:00:00Z"));
        var message = new EmailOutbox
        {
            MessageType = EmailMessageType.OrderShipped,
            Subject = "Your MyPetLink order MPL-ORD-1001 has shipped",
            TemplateDataJson = JsonSerializer.Serialize(
                data,
                new JsonSerializerOptions(JsonSerializerDefaults.Web))
        };

        var rendered = renderer.Render(message);

        Assert.Contains("Your order has shipped", rendered.HtmlBody);
        Assert.Contains("MyPetLink", rendered.HtmlBody);
        Assert.Contains("J&amp;T Express", rendered.HtmlBody);
        Assert.Contains("MY123456789", rendered.HtmlBody);
        Assert.Contains("https://mypetlink.com.my/orders/view?order=MPL-ORD-1001", rendered.HtmlBody);
        Assert.DoesNotContain("<script", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("J&T Express", rendered.TextBody);
        Assert.Contains("MY123456789", rendered.TextBody);
        Assert.Contains("View Order", rendered.TextBody);
    }

    [Fact]
    public void Renderer_UsesOptionalSafeTrackingActionWithoutRequiringIt()
    {
        var options = Options.Create(new EmailOptions
        {
            OwnerPortalBaseUrl = "https://mypetlink.com.my",
            BrandLogoUrl = "https://mypetlink.com.my/logo-horizontal.png",
            BrandAssetBaseUrl = "https://mypetlink.com.my/email-assets"
        });
        var renderer = new OrderShippedEmailTemplateRenderer(
            options,
            new TransactionalEmailLayout(options));
        var data = new OrderShippedEmailTemplateData(
            "Aina",
            "MPL-ORD-1002",
            "J&T Express",
            null,
            "MY 123/45",
            DateTimeOffset.Parse("2026-07-30T06:00:00Z"),
            "https://example.test/track?number=MY%20123%2F45");
        var message = new EmailOutbox
        {
            MessageType = EmailMessageType.OrderShipped,
            Subject = "Order shipped",
            TemplateDataJson = JsonSerializer.Serialize(
                data,
                new JsonSerializerOptions(JsonSerializerDefaults.Web))
        };

        var rendered = renderer.Render(message);

        Assert.Contains("Track Parcel", rendered.HtmlBody);
        Assert.Contains("https://example.test/track?number=MY%20123%2F45", rendered.HtmlBody);
        Assert.Contains("Track parcel: https://example.test/track?number=MY%20123%2F45", rendered.TextBody);
    }
}
