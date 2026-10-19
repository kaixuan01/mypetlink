using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class ConsignmentSalesHttpTests
{
    [Fact]
    public async Task SalesReportPriceAndTrackingWritesNeedTheirOwnCapabilities()
    {
        await using var factory=new PhysicalQaHttpTests.Factory();using var client=factory.CreateClient();
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();await PhysicalQaTests.Seed(db);
            var admin=await db.AdminUsers.SingleAsync();
            var role=new AdminRoleDefinition {Code="consignment-sales-view",Name="Synthetic viewer"};
            role.Capabilities.Add(new AdminRoleCapability {Capability=AdminCapabilities.ConsignmentView});
            role.Assignments.Add(new AdminUserRoleAssignment {AdminUserId=admin.Id});db.AdminRoles.Add(role);await db.SaveChangesAsync();
        }
        const string root="/api/v1/admin/merchant-sales/consignment";
        var id=Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync(root+"/stock-positions")).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User",PhysicalQaTests.UserId.ToString());
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync(root+"/stock-positions")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync(root+"/sales-reports")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync(root+$"/price-terms?agreementId={id}")).StatusCode);
        foreach(var path in new[]{"/sales-reports",$"/sales-reports/{id}/record",$"/sales-reports/{id}/void",$"/sales-reports/{id}/correct",
            $"/sales-reports/{id}/verify",$"/sales-reports/{id}/dispute","/price-terms",$"/price-terms/{id}/approve",$"/price-terms/{id}/end",
            $"/price-terms/{id}/withdraw","/price-terms/copy","/stock-tracking/start"})
            Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsync(root+path,new StringContent("{}",Encoding.UTF8,"application/json"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root+"/sales-reports.csv?from=2026-01-01&to=2026-02-01")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root+"/stock-ledger.csv?from=2026-01-01&to=2026-02-01")).StatusCode);
        // Recording does not let an operator verify.
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();var role=await db.AdminRoles.SingleAsync(r=>r.Code=="consignment-sales-view");
            db.AdminRoleCapabilities.Add(new AdminRoleCapability {AdminRoleId=role.Id,Capability=AdminCapabilities.ConsignmentSalesReportsRecord});await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsync(root+$"/sales-reports/{id}/verify",new StringContent("{\"concurrencyToken\":\"x\"}",Encoding.UTF8,"application/json"))).StatusCode);
        Assert.NotEqual(HttpStatusCode.Forbidden,(await client.PostAsync(root+$"/sales-reports/{id}/record",new StringContent("{\"concurrencyToken\":\"x\"}",Encoding.UTF8,"application/json"))).StatusCode);
    }

    [Fact]
    public async Task CorrectionNeedsVerifyEditsNeedRecordAndRevocationIsImmediate()
    {
        await using var factory=new PhysicalQaHttpTests.Factory();using var client=factory.CreateClient();
        Guid role;
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();await PhysicalQaTests.Seed(db);
            var admin=await db.AdminUsers.SingleAsync();
            var definition=new AdminRoleDefinition {Code="consignment-sales-operator",Name="Synthetic operator"};
            definition.Capabilities.Add(new AdminRoleCapability {Capability=AdminCapabilities.ConsignmentView});
            definition.Assignments.Add(new AdminUserRoleAssignment {AdminUserId=admin.Id});db.AdminRoles.Add(definition);await db.SaveChangesAsync();
            role=definition.Id;
        }
        async Task Grant(string capability,bool granted)
        {
            using var scope=factory.Services.CreateScope();
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            if(granted) db.AdminRoleCapabilities.Add(new AdminRoleCapability {AdminRoleId=role,Capability=capability});
            else db.AdminRoleCapabilities.RemoveRange(db.AdminRoleCapabilities.Where(c=>c.AdminRoleId==role&&c.Capability==capability));
            await db.SaveChangesAsync();
        }
        const string root="/api/v1/admin/merchant-sales/consignment";
        var id=Guid.NewGuid();
        static StringContent Json(string body)=>new(body,Encoding.UTF8,"application/json");
        client.DefaultRequestHeaders.Add("X-QA-Test-User",PhysicalQaTests.UserId.ToString());
        Task<HttpResponseMessage> Correct()=>client.PostAsync(root+$"/sales-reports/{id}/correct",Json("{\"concurrencyToken\":\"x\",\"reason\":\"Partner sent corrected figures\"}"));
        Task<HttpResponseMessage> EditReport()=>client.PutAsync(root+$"/sales-reports/{id}?concurrencyToken=x",Json("{}"));
        Task<HttpResponseMessage> EditPrice()=>client.PutAsync(root+$"/price-terms/{id}?concurrencyToken=x",Json("{}"));

        Assert.Equal(HttpStatusCode.Forbidden,(await EditReport()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await EditPrice()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Correct()).StatusCode);
        // Recording lets an operator edit drafts, but reopening reviewed figures is a review decision.
        await Grant(AdminCapabilities.ConsignmentSalesReportsRecord,true);
        Assert.NotEqual(HttpStatusCode.Forbidden,(await EditReport()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Correct()).StatusCode);
        await Grant(AdminCapabilities.ConsignmentSalesReportsVerify,true);
        Assert.NotEqual(HttpStatusCode.Forbidden,(await Correct()).StatusCode);
        await Grant(AdminCapabilities.ConsignmentPriceTermsManage,true);
        Assert.NotEqual(HttpStatusCode.Forbidden,(await EditPrice()).StatusCode);
        // Access is resolved on every request: a revoked capability stops working at once.
        await Grant(AdminCapabilities.ConsignmentSalesReportsVerify,false);
        await Grant(AdminCapabilities.ConsignmentSalesReportsRecord,false);
        await Grant(AdminCapabilities.ConsignmentPriceTermsManage,false);
        Assert.Equal(HttpStatusCode.Forbidden,(await Correct()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await EditReport()).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await EditPrice()).StatusCode);
    }

    [Fact]
    public async Task StocktakeCloseAndResolveEachNeedTheirOwnCapability()
    {
        await using var factory=new PhysicalQaHttpTests.Factory();using var client=factory.CreateClient();
        Guid role;
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();await PhysicalQaTests.Seed(db);
            var admin=await db.AdminUsers.SingleAsync();
            var definition=new AdminRoleDefinition {Code="consignment-stocktake",Name="Synthetic stock counter"};
            definition.Capabilities.Add(new AdminRoleCapability {Capability=AdminCapabilities.ConsignmentView});
            definition.Assignments.Add(new AdminUserRoleAssignment {AdminUserId=admin.Id});db.AdminRoles.Add(definition);await db.SaveChangesAsync();
            role=definition.Id;
        }
        async Task Grant(string capability,bool granted)
        {
            using var scope=factory.Services.CreateScope();
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            if(granted) db.AdminRoleCapabilities.Add(new AdminRoleCapability {AdminRoleId=role,Capability=capability});
            else db.AdminRoleCapabilities.RemoveRange(db.AdminRoleCapabilities.Where(c=>c.AdminRoleId==role&&c.Capability==capability));
            await db.SaveChangesAsync();
        }
        const string root="/api/v1/admin/merchant-sales/consignment";
        var id=Guid.NewGuid();
        static StringContent Json(string body)=>new(body,Encoding.UTF8,"application/json");
        client.DefaultRequestHeaders.Add("X-QA-Test-User",PhysicalQaTests.UserId.ToString());
        Task<HttpResponseMessage> Post(string path,string body="{\"concurrencyToken\":\"x\"}")=>client.PostAsync(root+path,Json(body));

        // Viewing needs only consignment.view.
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync(root+"/stocktakes")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync(root+"/discrepancies")).StatusCode);
        foreach(var path in new[]{"/stocktakes",$"/stocktakes/{id}/record",$"/stocktakes/{id}/void",$"/stocktakes/{id}/approve",$"/discrepancies/{id}/resolve"})
            Assert.Equal(HttpStatusCode.Forbidden,(await Post(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PutAsync(root+$"/stocktakes/{id}?concurrencyToken=x",Json("{}"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root+"/stocktakes.csv?from=2026-01-01&to=2026-02-01")).StatusCode);
        // Counting doesn't let an operator close the month or settle what the count found.
        await Grant(AdminCapabilities.ConsignmentStocktakeRecord,true);
        Assert.NotEqual(HttpStatusCode.Forbidden,(await Post($"/stocktakes/{id}/record")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Post($"/stocktakes/{id}/approve")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Post($"/discrepancies/{id}/resolve")).StatusCode);
        await Grant(AdminCapabilities.ConsignmentPeriodsClose,true);
        Assert.NotEqual(HttpStatusCode.Forbidden,(await Post($"/stocktakes/{id}/approve")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Post($"/discrepancies/{id}/resolve")).StatusCode);
        await Grant(AdminCapabilities.ConsignmentDiscrepanciesResolve,true);
        Assert.NotEqual(HttpStatusCode.Forbidden,(await Post($"/discrepancies/{id}/resolve")).StatusCode);
        // Revocation takes effect on the next request.
        await Grant(AdminCapabilities.ConsignmentPeriodsClose,false);
        Assert.Equal(HttpStatusCode.Forbidden,(await Post($"/stocktakes/{id}/approve")).StatusCode);
    }
}
