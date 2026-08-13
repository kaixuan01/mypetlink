using MyPetLink.Api.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The shipment notice, against real SQL Server. Exactly-once is a database
/// invariant here, not an application convention, so these run where the unique
/// index actually exists.
/// </summary>
[Collection("PDF document rendering")]
public sealed class MerchantShippedEmailRelationalTests
{
    // The markers an operator records for themselves. None may ever reach the
    // merchant, so every test ships with them attached.
    private const string PrivateNote = "PRIVATE-MERCHANT-SHIPPED-NOTE";
    private const string PrivateRelease = "PRIVATE-MERCHANT-SHIPPED-RELEASE";
    private const string PrivateAdmin = "PRIVATE-MERCHANT-SHIPPED-ADMIN";
    private const decimal PrivateCost = 87.43m;

    private static MarkMerchantOrderShippedRequest Shipment(
        string tracking = "TRK-SHIP-0001",
        string? courierName = "Test Courier",
        string? service = "Next day") =>
        new(null, courierName, service, tracking, PrivateCost, PrivateNote);

    private static async Task ReadyAsync(MerchantFulfilmentService service)
    {
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));
        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
    }

    private static Task<List<EmailOutbox>> ShippedRowsAsync(MyPetLinkDbContext db) =>
        db.EmailOutbox.AsNoTracking()
            .Where(item => item.MessageType == EmailMessageType.MerchantOrderShipped)
            .ToListAsync();

    // =====================================================================
    // Enqueue, replay and concurrency
    // =====================================================================

    [RelationalFact]
    public async Task ShippingQueuesExactlyOneShipmentNotice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var rows = await ShippedRowsAsync(db);
        var row = Assert.Single(rows);

        Assert.Equal(EmailOutboxStatus.Pending, row.Status);
        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal($"MyPetLink Order Shipped {order.MerchantOrderNumber}", row.Subject);

        // Anchored to the delivery order it carries, and to nothing else.
        var deliveryOrder = await db.MerchantDeliveryOrders.AsNoTracking()
            .SingleAsync(item => item.MerchantOrderId == OrderId);
        Assert.Equal(deliveryOrder.Id, row.RelatedMerchantDeliveryOrderId);
        Assert.Null(row.RelatedOrderId);
        Assert.Null(row.RelatedUserId);
        Assert.Null(row.RelatedMerchantQuotationId);
        Assert.Null(row.RelatedMerchantInvoiceId);
    }

    [RelationalFact]
    public async Task RepeatingMarkShippedDoesNotQueueASecondNotice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment(tracking: "TRK-AGAIN"));

        Assert.Single(await ShippedRowsAsync(db));

        // The replay must not have rewritten the shipment either.
        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal("TRK-SHIP-0001", order.TrackingNumber);
    }

    [RelationalFact]
    public async Task TwoAdminsShippingAtOnceProduceOneOfEverything()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var setup = scope.NewContext();
        await SeedAsync(setup);
        await IssueInvoiceAsync(setup);
        await EnableTemplateAsync(setup, EmailMessageType.MerchantOrderShipped);
        await ReadyAsync(Service(setup));

        await using var firstDb = scope.NewContext();
        await using var secondDb = scope.NewContext();

        var attempts = await Task.WhenAll(
            Attempt(Service(firstDb), "TRK-A"),
            Attempt(Service(secondDb), "TRK-B"));

        // One may lose on the row version; that is a correct outcome, not a
        // failure. What matters is that nothing happened twice.
        Assert.Contains(attempts, outcome => outcome);

        await using var check = scope.NewContext();
        var order = await check.MerchantOrders.AsNoTracking()
            .SingleAsync(item => item.Id == OrderId);
        Assert.Equal(MerchantOrderFulfilmentStatus.Shipped, order.FulfilmentStatus);
        Assert.NotNull(order.ShippedAt);

        Assert.Single(await check.MerchantDeliveryOrders.AsNoTracking()
            .Where(item => item.MerchantOrderId == OrderId).ToListAsync());
        Assert.Single(await ShippedRowsAsync(check));
        Assert.Single(await check.AuditLogs.AsNoTracking()
            .Where(entry => entry.Action == "merchant-order.shipped").ToListAsync());
        Assert.Empty(await check.MerchantOrderAllocatedTags.AsNoTracking()
            .Where(tag => tag.MerchantOrderId == OrderId
                && tag.Status != MerchantAllocationStatus.SentToMerchant)
            .ToListAsync());

        static async Task<bool> Attempt(MerchantFulfilmentService service, string tracking)
        {
            try
            {
                await service.MarkShippedAsync(
                    AdminAccountId, OrderId,
                    new MarkMerchantOrderShippedRequest(
                        null, "Test Courier", "Next day", tracking, PrivateCost, PrivateNote));
                return true;
            }
            catch (ApiException)
            {
                return false;
            }
            catch (DbUpdateException)
            {
                return false;
            }
        }
    }

    [RelationalFact]
    public async Task MarkingDeliveredNeverQueuesAnotherNotice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());
        await service.MarkDeliveredAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());

        Assert.Single(await ShippedRowsAsync(db));
    }

    // =====================================================================
    // Delivery order dependency
    // =====================================================================

    [RelationalFact]
    public async Task ShippingIssuesTheDeliveryOrderWhenReadyToShipLeftNone()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);

        // Ready to Ship does not issue the document; the Admin screen asks for
        // it separately, and that call can fail. This is the state it leaves.
        Assert.Empty(await db.MerchantDeliveryOrders.AsNoTracking().ToListAsync());

        await using var shipDb = scope.NewContext();
        await Service(shipDb).MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        await using var check = scope.NewContext();
        var document = Assert.Single(await check.MerchantDeliveryOrders.AsNoTracking()
            .Where(item => item.MerchantOrderId == OrderId).ToListAsync());
        var row = Assert.Single(await ShippedRowsAsync(check));

        // The email can only ever name a document that exists.
        Assert.Equal(document.Id, row.RelatedMerchantDeliveryOrderId);
    }

    // =====================================================================
    // Template gating
    // =====================================================================

    [RelationalFact]
    public async Task ShippingSucceedsAndSuppressesWhileTheTemplateIsOff()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped, enabled: false);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        Assert.Equal(MerchantOrderFulfilmentStatus.Shipped, order.FulfilmentStatus);

        var row = Assert.Single(await ShippedRowsAsync(db));
        Assert.Equal(EmailOutboxStatus.Suppressed, row.Status);
        Assert.Equal(EmailSuppressionReasons.TemplateDisabled, row.SuppressionReason);
    }

    [RelationalFact]
    public async Task EnablingTheTemplateLaterNeverReleasesASuppressedNotice()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped, enabled: false);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);
        // An unrelated switch moving must not disturb history either.
        await EnableTemplateAsync(db, EmailMessageType.MerchantInvoice);

        await using var check = scope.NewContext();
        var row = Assert.Single(await ShippedRowsAsync(check));
        Assert.Equal(EmailOutboxStatus.Suppressed, row.Status);
        Assert.Equal(EmailSuppressionReasons.TemplateDisabled, row.SuppressionReason);
        Assert.Null(row.SentAt);
    }

    [RelationalFact]
    public async Task OrdersShippedBeforeTheFeatureAreNeverBackfilled()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);

        // An order that reached Shipped without ever passing through the new
        // code, exactly as a historical row looks.
        var order = await db.MerchantOrders.SingleAsync(item => item.Id == OrderId);
        order.FulfilmentStatus = MerchantOrderFulfilmentStatus.Shipped;
        order.ShippedAt = Now;
        order.TrackingNumber = "TRK-HISTORIC";
        order.CourierProvider = "Test Courier";
        await db.SaveChangesAsync();

        Assert.Empty(await ShippedRowsAsync(db));

        // Reading and re-transitioning must not invent one now.
        await service.GetFulfilmentAsync(OrderId);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        Assert.Empty(await ShippedRowsAsync(db));
    }

    // =====================================================================
    // Payload
    // =====================================================================

    [RelationalFact]
    public async Task ThePayloadCarriesTheShipmentAsItWasAtTheMoment()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var row = Assert.Single(await ShippedRowsAsync(db));
        var data = JsonSerializer.Deserialize<MerchantOrderShippedEmailTemplateData>(
            row.TemplateDataJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

        var order = await db.MerchantOrders.AsNoTracking().SingleAsync(item => item.Id == OrderId);
        var document = await db.MerchantDeliveryOrders.AsNoTracking()
            .SingleAsync(item => item.MerchantOrderId == OrderId);

        Assert.Equal(order.MerchantOrderNumber, data.MerchantOrderNumber);
        Assert.Equal(document.DeliveryOrderNumber, data.DeliveryOrderNumber);
        Assert.Equal("Test Courier", data.CourierName);
        Assert.Equal("Next day", data.CourierService);
        Assert.Equal("TRK-SHIP-0001", data.TrackingNumber);
        Assert.Equal(2, data.Items.Count);
        Assert.All(data.Items, item => Assert.True(item.Quantity > 0));
        Assert.Equal(order.ShippedAt, data.ShippedAt);
    }

    [RelationalFact]
    public async Task NoInternalDetailReachesTheMerchant()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 10));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(NfcItemId, 4));

        // A real release, so its reason genuinely exists on a row. It has to be
        // a tag from the line the re-allocation below refills.
        var released = await db.MerchantOrderAllocatedTags.AsNoTracking()
            .Where(tag => tag.MerchantOrderId == OrderId
                && tag.MerchantOrderItemId == QrItemId)
            .Select(tag => tag.Id)
            .FirstAsync();
        await service.ReleaseAsync(
            AdminAccountId, OrderId,
            new ReleaseMerchantInventoryRequest([released], PrivateRelease));
        await service.AutoAllocateAsync(
            AdminAccountId, OrderId, new AutoAllocateMerchantInventoryRequest(QrItemId, 1));

        await service.MarkReadyToShipAsync(
            AdminAccountId, OrderId, new MerchantFulfilmentTransitionRequest());
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var row = Assert.Single(await ShippedRowsAsync(db));
        var rendered = Renderer().Render(row);
        var haystack = string.Join(
            "\n", row.Subject, row.TemplateDataJson, rendered.HtmlBody, rendered.TextBody);

        Assert.DoesNotContain("87.43", haystack, StringComparison.Ordinal);
        Assert.DoesNotContain(PrivateNote, haystack, StringComparison.Ordinal);
        Assert.DoesNotContain(PrivateRelease, haystack, StringComparison.Ordinal);
        Assert.DoesNotContain(PrivateAdmin, haystack, StringComparison.Ordinal);
        Assert.DoesNotContain("commission", haystack, StringComparison.OrdinalIgnoreCase);

        // No tag code, no database id of any kind.
        var tagCodes = await db.MerchantOrderAllocatedTags.AsNoTracking()
            .Where(tag => tag.MerchantOrderId == OrderId)
            .Select(tag => tag.TagCodeSnapshot)
            .ToListAsync();
        Assert.NotEmpty(tagCodes);
        Assert.All(tagCodes, code =>
            Assert.DoesNotContain(code, haystack, StringComparison.Ordinal));
        Assert.DoesNotMatch(
            @"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            haystack);
    }

    // =====================================================================
    // Tracking link
    // =====================================================================

    [RelationalFact]
    public async Task AConfiguredCourierGivesATrackParcelLinkAndKeepsTheNumber()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        db.ShippingCourierProviders.Add(new ShippingCourierProvider
        {
            Id = Guid.NewGuid(),
            Code = "TRACKED",
            DisplayName = "Tracked Courier",
            TrackingUrlTemplate = "https://track.example/{trackingNumber}",
            IsActive = true,
            DisplayOrder = 1,
            CreatedAt = Now,
            UpdatedAt = Now,
        });
        await db.SaveChangesAsync();

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(
            AdminAccountId, OrderId,
            new MarkMerchantOrderShippedRequest(
                "TRACKED", null, "Next day", "TRK-URL-99", PrivateCost, PrivateNote));

        var row = Assert.Single(await ShippedRowsAsync(db));
        var rendered = Renderer().Render(row);

        Assert.Contains("https://track.example/TRK-URL-99", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains("Track Parcel", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains("TRK-URL-99", rendered.TextBody, StringComparison.Ordinal);
        Assert.Contains("Tracked Courier", rendered.HtmlBody, StringComparison.Ordinal);
    }

    [RelationalFact]
    public async Task ACourierWithNoLinkStillShowsTheTrackingNumberAndNoDeadButton()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(
            AdminAccountId, OrderId, Shipment(tracking: "TRK-NOURL-7", service: null));

        var row = Assert.Single(await ShippedRowsAsync(db));
        var rendered = Renderer().Render(row);

        Assert.Contains("TRK-NOURL-7", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.Contains(
            "track your parcel directly with the courier",
            rendered.TextBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Track Parcel", rendered.HtmlBody, StringComparison.Ordinal);
        // An absent optional service is simply absent, never an empty row.
        Assert.DoesNotContain(">Service<", rendered.HtmlBody, StringComparison.Ordinal);
    }

    // =====================================================================
    // Attachment
    // =====================================================================

    [RelationalFact]
    public async Task TheNoticeCarriesExactlyOneDeliveryOrderPdf()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var row = Assert.Single(await ShippedRowsAsync(db));
        var resolver = new EmailAttachmentResolver(
            new OrderDocumentService(db), new MerchantDocumentService(db));

        var attachment = Assert.Single(await resolver.ResolveAsync(row));
        var document = await db.MerchantDeliveryOrders.AsNoTracking()
            .SingleAsync(item => item.MerchantOrderId == OrderId);

        Assert.Equal(
            $"MyPetLink-Delivery-Order-{document.DeliveryOrderNumber}.pdf", attachment.FileName);
        Assert.Equal("application/pdf", attachment.ContentType);
        Assert.StartsWith("%PDF-", System.Text.Encoding.ASCII.GetString(attachment.Content, 0, 5));
    }

    [RelationalFact]
    public async Task TheAttachmentStaysTheSameDocumentAfterTheLiveDataMoves()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await SeedAsync(db);
        await IssueInvoiceAsync(db);
        await EnableTemplateAsync(db, EmailMessageType.MerchantOrderShipped);

        var service = Service(db);
        await ReadyAsync(service);
        await service.MarkShippedAsync(AdminAccountId, OrderId, Shipment());

        var row = Assert.Single(await ShippedRowsAsync(db));
        var resolver = new EmailAttachmentResolver(
            new OrderDocumentService(db), new MerchantDocumentService(db));
        var before = MerchantDocumentServiceTests.ExtractText(
            (await resolver.ResolveAsync(row)).Single().Content);

        // Everything the document could have been re-rendered from now moves.
        var identity = await db.BusinessIdentitySettings.SingleAsync();
        identity.LegalBusinessName = "Renamed Holdings Berhad";
        identity.SupportEmail = "renamed@example.com";
        var merchant = await db.Merchants.SingleAsync(item => item.Id == MerchantId);
        merchant.LegalBusinessName = "Renamed Merchant Sdn Bhd";
        merchant.BillingAddressLine1 = "999 Jalan Berubah";
        var variant = await db.TagProductVariants.SingleAsync(item => item.Id == QrVariantId);
        variant.DisplayName = "Renamed Option";
        foreach (var courier in await db.ShippingCourierProviders.ToListAsync())
        {
            courier.DisplayName = "Renamed Courier";
            courier.TrackingUrlTemplate = "https://renamed.example/{trackingNumber}";
        }

        await db.SaveChangesAsync();

        await using var check = scope.NewContext();
        var laterRow = Assert.Single(await ShippedRowsAsync(check));
        var laterResolver = new EmailAttachmentResolver(
            new OrderDocumentService(check), new MerchantDocumentService(check));
        var after = MerchantDocumentServiceTests.ExtractText(
            (await laterResolver.ResolveAsync(laterRow)).Single().Content);

        Assert.Equal(before, after);
        Assert.DoesNotContain("Renamed", after, StringComparison.Ordinal);

        // And the email itself still reads as it did on the day.
        var rendered = Renderer().Render(laterRow);
        Assert.Contains("Test Courier", rendered.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain("Renamed Courier", rendered.HtmlBody, StringComparison.Ordinal);
    }

    private static MerchantOrderShippedEmailTemplateRenderer Renderer()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new EmailOptions
        {
            Enabled = true,
            FromAddress = "support@mypetlink.com.my",
            FromName = "MyPetLink",
            OwnerPortalBaseUrl = "http://localhost:3000",
        });

        return new MerchantOrderShippedEmailTemplateRenderer(new TransactionalEmailLayout(options));
    }
}
