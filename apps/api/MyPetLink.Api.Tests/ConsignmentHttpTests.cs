using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class ConsignmentHttpTests
{
    [Fact]
    public async Task RestrictedManifestResponsesAreNoStoreAndPermissionsRemainIndependent()
    {
        await using var factory=new PhysicalQaHttpTests.Factory();using var client=factory.CreateClient();Guid dispatchId;
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();await PhysicalQaTests.Seed(db);
            var admin=await db.AdminUsers.SingleAsync();
            var role=new AdminRoleDefinition {Code="consignment-http-view",Name="Synthetic viewer"};
            role.Capabilities.Add(new AdminRoleCapability {Capability=AdminCapabilities.ConsignmentView});
            role.Assignments.Add(new AdminUserRoleAssignment {AdminUserId=admin.Id});db.AdminRoles.Add(role);
            var merchant=new Merchant {MerchantCode="HTTP-QA",LegalBusinessName="Synthetic shop"};
            var agreement=new ConsignmentAgreement {Merchant=merchant,Reference="HTTP-AGREEMENT",UpdatedByAdminUserId=admin.Id};
            var dispatch=new ConsignmentDispatch {Agreement=agreement,DispatchNumber="MPL-CS-HTTP-QA",UpdatedByAdminUserId=admin.Id,
                IssuedDocumentContent=[1,2,3],IdempotencyKey="HTTP-KEY",RequestFingerprint="HTTP-FINGERPRINT"};
            dispatch.Units.Add(new ConsignmentUnit {SmartTagId=PhysicalQaTests.TagId,ProductVariantId=PhysicalQaTests.VariantId,TagCodeSnapshot=PhysicalQaTests.Code});
            db.ConsignmentDispatches.Add(dispatch);await db.SaveChangesAsync();dispatchId=dispatch.Id;
        }
        var root=$"/api/v1/admin/merchant-sales/consignment/dispatches/{dispatchId}";
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync(root)).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User",PhysicalQaTests.UserId.ToString());
        var detail=await client.GetAsync(root);Assert.Equal(HttpStatusCode.OK,detail.StatusCode);Assert.DoesNotContain(PhysicalQaTests.Code,await detail.Content.ReadAsStringAsync());
        Assert.True(detail.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root+"/manifest")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync(root+"/dispatch-note.pdf")).StatusCode);
        foreach(var action in new[]{"dispatch","receive","cancel","return","release","external-handover","correct-handover","reverse-handover","write-off","record-discrepancy","resolve-discrepancy"})
            Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsync(root+"/"+action,new StringContent("{}",System.Text.Encoding.UTF8,"application/json"))).StatusCode);
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();var role=await db.AdminRoles.SingleAsync(r=>r.Code=="consignment-http-view");
            db.AdminRoleCapabilities.Add(new AdminRoleCapability {AdminRoleId=role.Id,Capability=AdminCapabilities.ConsignmentManifestExport});await db.SaveChangesAsync();
        }
        foreach(var suffix in new[]{"/manifest","/manifest.csv","/dispatch-note.pdf"})
        {
            var response=await client.GetAsync(root+suffix);Assert.Equal(HttpStatusCode.OK,response.StatusCode);Assert.True(response.Headers.CacheControl?.NoStore);
        }
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();(await db.AdminUsers.SingleAsync()).IsActive=false;await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root+"/manifest.csv")).StatusCode);
    }
}
