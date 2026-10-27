using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using Microsoft.AspNetCore.Authorization;
using System.Reflection;

namespace MyPetLink.Api.Tests;

// The signature endpoints through the real pipeline: who may reach them, what they return, and
// signing a Delivery Order over HTTP. The signature is a synthetic scribble drawn in code.
[Collection("PDF document rendering")]
public sealed class DocumentSignatureHttpTests
{
    private const string Root = "/api/v1/admin/document-signature";

    [Fact]
    public void EverySignatureEndpointRequiresTheSigningCapability()
    {
        Assert.Contains(typeof(AdminDocumentSignatureController).GetCustomAttributes<AuthorizeAttribute>(),
            a => a.Policy == AdminCapabilities.DocumentSignatureManage);
        // Personal to whoever holds it, so no built-in template hands it out.
        Assert.All(AdminRoleTemplates.All.Where(t => !t.GrantsAllCapabilities),
            t => Assert.DoesNotContain(AdminCapabilities.DocumentSignatureManage, t.Capabilities));
        Assert.True(AdminCapabilityCatalog.Find(AdminCapabilities.DocumentSignatureManage)!.IsSensitive);
    }

    private static async Task Grant(PhysicalQaHttpTests.Factory factory, params string[] capabilities)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
        var role = await db.AdminRoles.SingleAsync(r => r.Code == "consignment-do-view");
        foreach (var capability in capabilities) db.AdminRoleCapabilities.Add(new AdminRoleCapability { AdminRoleId = role.Id, Capability = capability });
        await db.SaveChangesAsync();
    }

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("data");
    }

    [Fact]
    public async Task OnlyTheSignerManagesTheirSignatureAndSignsTheDeliveryOrderTheyGenerate()
    {
        await using var factory = new PhysicalQaHttpTests.Factory(); using var client = factory.CreateClient();
        Guid dispatched;
        using (var scope = factory.Services.CreateScope())
            (dispatched, _) = await ConsignmentDeliveryOrderHttpTests.Seed(scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>());
        var delivery = $"/api/v1/admin/merchant-sales/consignment/dispatches/{dispatched}";
        var upload = new { signatoryName = "Synthetic Signatory", signatoryPosition = "Director",
            imageBase64 = Convert.ToBase64String(SignatureTestImages.Png()), contentType = "image/png", currentSignatureId = (Guid?)null };

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Root)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Root + "/image")).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User", PhysicalQaTests.UserId.ToString());

        // Viewing consignment, or even dispatching it, is not permission to keep or use a signature.
        await Grant(factory, AdminCapabilities.ConsignmentDispatch);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Root)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Root + "/image")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(Root, upload)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(Root + "/remove", new { signatureId = Guid.NewGuid() })).StatusCode);
        var unpermitted = await client.PostAsJsonAsync(delivery + "/delivery-order", new { signatureId = Guid.NewGuid(), confirmed = true });
        Assert.Equal(HttpStatusCode.Forbidden, unpermitted.StatusCode);

        await Grant(factory, AdminCapabilities.DocumentSignatureManage);
        Assert.Equal(JsonValueKind.Null, (await Data(await client.GetAsync(Root))).GetProperty("signature").ValueKind);
        var refused = await client.PutAsJsonAsync(Root, upload with { contentType = "image/jpeg" });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("signature_image_invalid", await refused.Content.ReadAsStringAsync());

        var savedResponse = await client.PutAsJsonAsync(Root, upload);
        Assert.True(savedResponse.Headers.CacheControl?.NoStore);
        var savedJson = await savedResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain("iVBOR", savedJson);
        var saved = (await Data(savedResponse)).GetProperty("signature");
        var signatureId = saved.GetProperty("id").GetGuid();
        Assert.Equal("Synthetic Signatory", saved.GetProperty("signatoryName").GetString());

        // The image is only ever served to its owner, privately and never cached.
        var image = await client.GetAsync(Root + "/image");
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/png", image.Content.Headers.ContentType?.MediaType);
        Assert.Contains("no-store", image.Headers.CacheControl?.ToString());
        Assert.Contains("nosniff", image.Headers.GetValues("X-Content-Type-Options"));

        var preview = await client.GetAsync(delivery + $"/delivery-order/preview.pdf?signatureId={signatureId}");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.Equal("application/pdf", preview.Content.Headers.ContentType?.MediaType);
        using (var scope = factory.Services.CreateScope())
            Assert.False(await scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>().ConsignmentDeliveryOrders.AnyAsync());

        var unconfirmed = await client.PostAsJsonAsync(delivery + "/delivery-order", new { signatureId, confirmed = false });
        Assert.Equal(HttpStatusCode.BadRequest, unconfirmed.StatusCode);
        Assert.Contains("signature_not_confirmed", await unconfirmed.Content.ReadAsStringAsync());

        var issued = await Data(await client.PostAsJsonAsync(delivery + "/delivery-order", new { signatureId, confirmed = true }));
        Assert.Equal("Synthetic Signatory", issued.GetProperty("signatoryName").GetString());
        Assert.Equal("Director", issued.GetProperty("signatoryPosition").GetString());
        var pdf = await client.GetByteArrayAsync(delivery + "/delivery-order.pdf");

        var removed = await Data(await client.PostAsJsonAsync(Root + "/remove", new { signatureId }));
        Assert.Equal(JsonValueKind.Null, removed.GetProperty("signature").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Root + "/image")).StatusCode);
        // The issued copy keeps its signature after the signature is removed.
        Assert.Equal(pdf, await client.GetByteArrayAsync(delivery + "/delivery-order.pdf"));
        var detail = await Data(await client.GetAsync(delivery));
        Assert.Equal("Synthetic Signatory", detail.GetProperty("deliveryOrder").GetProperty("signatoryName").GetString());
    }
}
