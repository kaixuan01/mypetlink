using MyPetLink.Api.Common;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The shipment notice as a merchant reads it, rendered by the production
/// renderer across the shapes real shipments actually take. Nothing is sent:
/// the outbox row is built and rendered in memory.
///
/// Capture is opt-in via MYPETLINK_EMAIL_CAPTURE_DIR so the rendered files can
/// be opened and looked at; the assertions run either way.
/// </summary>
public sealed class MerchantShippedEmailRenderTests
{
    private static string? CaptureDirectory =>
        Environment.GetEnvironmentVariable("MYPETLINK_EMAIL_CAPTURE_DIR");

    private static readonly DateTimeOffset Shipped =
        DateTimeOffset.Parse("2026-08-10T04:00:00Z");

    private static EmailOutbox Message(MerchantOrderShippedEmailTemplateData data) =>
        new()
        {
            Id = Guid.NewGuid(),
            MessageType = EmailMessageType.MerchantOrderShipped,
            RecipientEmail = "orders@happypaws.example",
            RecipientName = data.ContactPerson,
            Subject = $"MyPetLink Order Shipped {data.MerchantOrderNumber}",
            TemplateDataJson = JsonSerializer.Serialize(
                data, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
            Status = EmailOutboxStatus.Pending,
        };

    private static MerchantOrderShippedEmailTemplateData Data(
        string merchantName = "Happy Paws Veterinary Group Sdn Bhd",
        string orderNumber = "MPL-B2B-ORD-260810-0001",
        string? service = "Next Day Domestic",
        string tracking = "PL260810MY0001",
        string? trackingUrl = "https://track.example/PL260810MY0001",
        int lines = 2) =>
        new(
            MerchantName: merchantName,
            ContactPerson: "Aina Rahman",
            MerchantOrderNumber: orderNumber,
            DeliveryOrderNumber: "MPL-DO-260810-0001",
            CourierName: "Pos Laju",
            CourierService: service,
            TrackingNumber: tracking,
            TrackingUrl: trackingUrl,
            Items: [.. Enumerable.Range(1, lines).Select(index =>
                new MerchantShippedItemLine(
                    "MyPetLink Paw Pet Tag", $"WS-QR-{index:00}", index * 10))],
            ShippedAt: Shipped,
            SupportEmail: "support@mypetlink.com.my");

    private static RenderedEmail Render(
        MerchantOrderShippedEmailTemplateData data, string variant)
    {
        var options = Options.Create(new EmailOptions
        {
            Enabled = true,
            FromAddress = "support@mypetlink.com.my",
            FromName = "MyPetLink",
            OwnerPortalBaseUrl = "http://localhost:3000",
        });

        var message = Message(data);
        var rendered = new MerchantOrderShippedEmailTemplateRenderer(
            new TransactionalEmailLayout(options)).Render(message);

        var directory = CaptureDirectory;
        if (directory is not null)
        {
            Directory.CreateDirectory(directory);
            File.WriteAllText(
                Path.Combine(directory, $"merchant-shipped-{variant}.html"), rendered.HtmlBody);
            File.WriteAllText(
                Path.Combine(directory, $"merchant-shipped-{variant}.txt"),
                $"Subject: {message.Subject}{Environment.NewLine}{Environment.NewLine}"
                + rendered.TextBody);
        }

        return rendered;
    }

    /// <summary>Both alternatives must stand alone and be free of stray markup.</summary>
    private static void AssertWellFormed(RenderedEmail rendered)
    {
        Assert.DoesNotContain("{{", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain("{0}", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain("<", rendered.TextBody, StringComparison.Ordinal);
        Assert.Contains("support@mypetlink.com.my", rendered.TextBody, StringComparison.Ordinal);
        Assert.Contains("shipped", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
    }

    // A. A courier with a configured tracking link.
    [Fact]
    public void ATrackedCourierShowsBothTheLinkAndTheNumber()
    {
        var rendered = Render(Data(), "a-tracking-url");

        AssertWellFormed(rendered);
        Assert.Contains("Track Parcel", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains(
            "https://track.example/PL260810MY0001", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains("PL260810MY0001", rendered.TextBody, StringComparison.Ordinal);
        Assert.Contains("Pos Laju", rendered.TextBody, StringComparison.Ordinal);
    }

    // B. A courier with no tracking link at all.
    [Fact]
    public void AnUntrackedCourierKeepsTheNumberAndOffersNoDeadButton()
    {
        var rendered = Render(Data(trackingUrl: null), "b-no-url");

        AssertWellFormed(rendered);
        Assert.DoesNotContain("Track Parcel", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain("href=\"\"", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains("PL260810MY0001", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains(
            "track your parcel directly with the courier",
            rendered.TextBody, StringComparison.OrdinalIgnoreCase);
    }

    // C. No optional service.
    [Fact]
    public void AMissingServiceIsSimplyAbsent()
    {
        var rendered = Render(Data(service: null), "c-no-service");

        AssertWellFormed(rendered);
        Assert.DoesNotContain(">Service<", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain("Service:", rendered.TextBody, StringComparison.Ordinal);
        // The rest of the shipment block is unaffected.
        Assert.Contains("Pos Laju", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains("PL260810MY0001", rendered.HtmlBody, StringComparison.Ordinal);
    }

    // D. A merchant name long enough to wrap.
    [Fact]
    public void ALongMerchantNameSurvivesIntact()
    {
        const string name =
            "Happy Paws Wholesale Distribution And Pet Supplies Holdings Berhad (Malaysia)";
        var rendered = Render(Data(merchantName: name), "d-long-merchant");

        AssertWellFormed(rendered);
        Assert.Contains(name, rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains(name, rendered.TextBody, StringComparison.Ordinal);
    }

    // E. A tracking number long enough to overflow a narrow column.
    [Fact]
    public void ALongTrackingNumberSurvivesIntact()
    {
        const string tracking = "PL2608090002MY0009876543210987654";
        var rendered = Render(
            Data(tracking: tracking, trackingUrl: $"https://track.example/{tracking}"),
            "e-long-tracking");

        AssertWellFormed(rendered);
        Assert.Contains(tracking, rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains(tracking, rendered.TextBody, StringComparison.Ordinal);
        Assert.Contains($"https://track.example/{tracking}", rendered.HtmlBody, StringComparison.Ordinal);
    }

    // F. An order number the layout may wrap, plus many lines.
    [Fact]
    public void AWrappingOrderNumberAndManyLinesStayComplete()
    {
        var data = Data(orderNumber: "MPL-B2B-ORD-260810-0001-REVISION-002", lines: 8);
        var rendered = Render(data, "f-multiline-order");

        AssertWellFormed(rendered);
        Assert.Contains(
            "MPL-B2B-ORD-260810-0001-REVISION-002", rendered.HtmlBody, StringComparison.Ordinal);
        foreach (var line in data.Items)
        {
            Assert.Contains(line.SkuCode, rendered.HtmlBody, StringComparison.Ordinal);
            Assert.Contains(line.SkuCode, rendered.TextBody, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void TheSubjectIsTheApprovedMerchantWording()
    {
        var data = Data();
        var message = Message(data);

        Assert.Equal("MyPetLink Order Shipped MPL-B2B-ORD-260810-0001", message.Subject);
    }

    [Fact]
    public void TheRendererRefusesAMessageOfAnotherType()
    {
        var options = Options.Create(new EmailOptions { Enabled = true });
        var renderer = new MerchantOrderShippedEmailTemplateRenderer(
            new TransactionalEmailLayout(options));
        var message = Message(Data());
        message.MessageType = EmailMessageType.OrderShipped;

        Assert.Throws<EmailDeliveryException>(() => renderer.Render(message));
    }
}
