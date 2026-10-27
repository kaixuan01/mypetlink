using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

[Collection("PDF document rendering")]
public sealed class ConsignmentDeliveryOrderHttpTests
{
    internal static async Task<(Guid Dispatched, Guid Reserved)> Seed(MyPetLinkDbContext db)
    {
        await PhysicalQaTests.Seed(db);
        var admin = await db.AdminUsers.SingleAsync();
        var role = new AdminRoleDefinition { Code = "consignment-do-view", Name = "Synthetic viewer" };
        role.Capabilities.Add(new AdminRoleCapability { Capability = AdminCapabilities.ConsignmentView });
        role.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = admin.Id }); db.AdminRoles.Add(role);
        var merchant = new Merchant { MerchantCode = "HTTP-DO", LegalBusinessName = "Synthetic Delivery Partner Sdn Bhd" };
        var agreement = new ConsignmentAgreement { Merchant = merchant, Reference = "SYNDO-CONS-2026-001", UpdatedByAdminUserId = admin.Id };
        ConsignmentDispatch Dispatch(string number, ConsignmentDispatchStatus status, ConsignmentUnitStatus unitStatus)
        {
            var d = new ConsignmentDispatch { Agreement = agreement, DispatchNumber = number, UpdatedByAdminUserId = admin.Id, Status = status,
                IdempotencyKey = number, RequestFingerprint = number, AgreementReferenceSnapshot = agreement.Reference, AgreementVersionSnapshot = 1,
                MerchantNameSnapshot = merchant.LegalBusinessName, DestinationSnapshot = "Synthetic outlet, 1 Synthetic Street, 50000, Kuala Lumpur",
                DispatchedAt = status == ConsignmentDispatchStatus.Reserved ? null : DateTimeOffset.UtcNow.AddHours(-1),
                Seller = new SellerIdentitySnapshot { BrandName = "MyPetLink", LegalBusinessName = "Synthetic Seller", SupportEmail = "support@example.com" } };
            d.Units.Add(new ConsignmentUnit { SmartTagId = PhysicalQaTests.TagId, ProductVariantId = PhysicalQaTests.VariantId, Status = unitStatus,
                TagCodeSnapshot = PhysicalQaTests.Code, SkuSnapshot = "QA-NFC", ProductNameSnapshot = "Smart Tag", VariantSnapshot = "Standard" });
            return d;
        }
        var dispatched = Dispatch("MPL-CS-HTTP-DO-1", ConsignmentDispatchStatus.Dispatched, ConsignmentUnitStatus.Dispatched);
        var reserved = Dispatch("MPL-CS-HTTP-DO-2", ConsignmentDispatchStatus.Reserved, ConsignmentUnitStatus.Reserved);
        db.ConsignmentDispatches.AddRange(dispatched, reserved); await db.SaveChangesAsync();
        return (dispatched.Id, reserved.Id);
    }

    [Fact]
    public async Task OnlyDispatchersGenerateWhileViewersDownloadTheSameIssuedCopy()
    {
        await using var factory = new PhysicalQaHttpTests.Factory(); using var client = factory.CreateClient();
        Guid dispatched, reserved;
        using (var scope = factory.Services.CreateScope())
            (dispatched, reserved) = await Seed(scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>());
        var root = $"/api/v1/admin/merchant-sales/consignment/dispatches/{dispatched}";
        var empty = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync(root + "/delivery-order", empty)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(root + "/delivery-order.pdf")).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User", PhysicalQaTests.UserId.ToString());

        // A viewer can neither take a number nor download something that was never issued.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(root + "/delivery-order", empty)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync(root + "/delivery-order.pdf")).StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>(); var role = await db.AdminRoles.SingleAsync(r => r.Code == "consignment-do-view");
            db.AdminRoleCapabilities.Add(new AdminRoleCapability { AdminRoleId = role.Id, Capability = AdminCapabilities.ConsignmentDispatch }); await db.SaveChangesAsync();
        }
        var issue = await client.PostAsync(root + "/delivery-order", empty);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode); Assert.True(issue.Headers.CacheControl?.NoStore);
        var number = JsonDocument.Parse(await issue.Content.ReadAsStringAsync()).RootElement.GetProperty("data").GetProperty("deliveryOrderNumber").GetString();
        Assert.Matches(@"^MPL-DO-\d{6}-0001$", number);
        var repeat = JsonDocument.Parse(await (await client.PostAsync(root + "/delivery-order", empty)).Content.ReadAsStringAsync());
        Assert.Equal(number, repeat.RootElement.GetProperty("data").GetProperty("deliveryOrderNumber").GetString());

        var detail = JsonDocument.Parse(await client.GetStringAsync(root)).RootElement.GetProperty("data");
        Assert.Equal(number, detail.GetProperty("deliveryOrder").GetProperty("deliveryOrderNumber").GetString());

        var reservedIssue = await client.PostAsync($"/api/v1/admin/merchant-sales/consignment/dispatches/{reserved}/delivery-order", empty);
        Assert.Equal(HttpStatusCode.Conflict, reservedIssue.StatusCode);
        Assert.Contains("consignment_delivery_order_unavailable", await reservedIssue.Content.ReadAsStringAsync());

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            var role = await db.AdminRoles.SingleAsync(r => r.Code == "consignment-do-view");
            db.AdminRoleCapabilities.Remove(await db.AdminRoleCapabilities.SingleAsync(c => c.AdminRoleId == role.Id && c.Capability == AdminCapabilities.ConsignmentDispatch));
            await db.SaveChangesAsync();
        }
        // Viewing the delivery is enough to download its issued Delivery Order, like the dispatch note.
        var pdf = await client.GetAsync(root + "/delivery-order.pdf");
        Assert.Equal(HttpStatusCode.OK, pdf.StatusCode); Assert.True(pdf.Headers.CacheControl?.NoStore);
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        Assert.Equal($"MyPetLink_Delivery_Order_{number}.pdf", pdf.Content.Headers.ContentDisposition?.FileNameStar ?? pdf.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        var first = await pdf.Content.ReadAsByteArrayAsync();
        Assert.Equal(first, await client.GetByteArrayAsync(root + "/delivery-order.pdf"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(root + "/delivery-order", empty)).StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            Assert.Equal(1, await db.ConsignmentDeliveryOrders.CountAsync());
            Assert.Empty(db.ConsignmentMovements); Assert.Empty(db.ConsignmentStockLedgerEntries);
            (await db.AdminUsers.SingleAsync()).IsActive = false; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(root + "/delivery-order.pdf")).StatusCode);
    }
}
