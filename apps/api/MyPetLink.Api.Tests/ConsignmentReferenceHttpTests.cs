using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class ConsignmentReferenceHttpTests
{
    [Fact]
    public async Task PrefixesNeedAgreementManagementAndDefaultTermsNeedApproval()
    {
        await using var factory = new PhysicalQaHttpTests.Factory(); using var client = factory.CreateClient();
        Guid merchantId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>(); await PhysicalQaTests.Seed(db);
            var admin = await db.AdminUsers.SingleAsync();
            var role = new AdminRoleDefinition { Code = "reference-view", Name = "Synthetic viewer" };
            role.Capabilities.Add(new AdminRoleCapability { Capability = AdminCapabilities.ConsignmentView });
            role.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = admin.Id }); db.AdminRoles.Add(role);
            var merchant = new Merchant { MerchantCode = "HTTP-REF", LegalBusinessName = "Synthetic Pawsome Sdn Bhd" };
            db.Merchants.Add(merchant);
            db.ConsignmentDefaultTermsRevisions.Add(new() { Revision = 1, RecordedAt = DateTimeOffset.UtcNow });
            db.ConsignmentDefaultTerms.Add(new() { Revision = 1 });
            await db.SaveChangesAsync(); merchantId = merchant.Id;
        }
        const string root = "/api/v1/admin/merchant-sales/consignment";
        var prefixPath = $"{root}/merchants/{merchantId}/agreement-prefix";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(prefixPath)).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User", PhysicalQaTests.UserId.ToString());

        var preview = await client.GetAsync(prefixPath);
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode); Assert.Contains("\"suggestedPrefix\":\"SYNTHETIC\"", await preview.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"{root}/default-terms")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{root}/merchants/{Guid.NewGuid()}/agreement-prefix")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync(prefixPath, new { prefix = "PAWSOME", concurrencyToken = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"{root}/default-terms", new { concurrencyToken = "AA==", isActive = false, terms = new { } })).StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>(); var role = await db.AdminRoles.SingleAsync(r => r.Code == "reference-view");
            db.AdminRoleCapabilities.Add(new AdminRoleCapability { AdminRoleId = role.Id, Capability = AdminCapabilities.ConsignmentAgreementsManage }); await db.SaveChangesAsync();
        }
        var saved = await client.PutAsJsonAsync(prefixPath, new { prefix = "PAWSOME", concurrencyToken = "" });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode); Assert.Contains("\"prefix\":\"PAWSOME\"", await saved.Content.ReadAsStringAsync());
        // Managing agreements does not extend to the organisation's default terms.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"{root}/default-terms", new { concurrencyToken = "AA==", isActive = false, terms = new { } })).StatusCode);
    }
}
