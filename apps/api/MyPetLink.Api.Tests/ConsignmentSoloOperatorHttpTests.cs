using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class ConsignmentSoloOperatorHttpTests
{
    [Fact]
    public async Task SoloHttpRequiresBaseActionPermissionPolicyPermissionNominationAndAttestation()
    {
        await using var factory=new PhysicalQaHttpTests.Factory();using var client=factory.CreateClient();Guid agreementId;string agreementToken;
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();await PhysicalQaTests.Seed(db);var admin=await db.AdminUsers.SingleAsync();
            var role=new AdminRoleDefinition {Code="SYN-SOLO-HTTP",Name="Synthetic founder"};
            role.Capabilities.Add(new(){Capability=AdminCapabilities.ConsignmentView});role.Assignments.Add(new(){AdminUserId=admin.Id});db.AdminRoles.Add(role);db.ConsignmentApprovalPolicies.Add(new());
            var merchant=new Merchant {MerchantCode="SYN-SOLO",LegalBusinessName="Synthetic partner"};db.Merchants.Add(merchant);await db.SaveChangesAsync();
            var a=await scope.ServiceProvider.GetRequiredService<ConsignmentService>().SaveAgreementAsync(PhysicalQaTests.UserId,null,
                new(merchant.Id,"SYN-SOLO",35m,DateTimeOffset.UtcNow.AddDays(-1),null,"Synthetic duration","Synthetic settlement",14,"Synthetic discounts","Synthetic returns","Synthetic liability","SYN-PARTNER-ACCEPTANCE","SYN-TRACKER"),null,default);
            agreementId=a.Id;var saved=await db.ConsignmentAgreements.SingleAsync(x=>x.Id==a.Id);saved.RowVersion=[1];await db.SaveChangesAsync();agreementToken=Convert.ToBase64String(saved.RowVersion);
        }
        const string root="/api/v1/admin/merchant-sales/consignment";
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync(root+"/approval-policy")).StatusCode);
        client.DefaultRequestHeaders.Add("X-QA-Test-User",PhysicalQaTests.UserId.ToString());
        var get=await client.GetAsync(root+"/approval-policy");Assert.Equal(HttpStatusCode.OK,get.StatusCode);Assert.True(get.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PutAsJsonAsync(root+"/approval-policy",new {mode="Solo"})).StatusCode);
        var action=root+$"/agreements/{agreementId}/approve";var r=new ConsignmentActionRequest(agreementToken,"SYN-PARTNER-ACCEPTANCE",SelfReview:new(true,"Founder verified actual acceptance","SYN-PARTNER-ACCEPTANCE"));
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsJsonAsync(action,r)).StatusCode);
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();var role=await db.AdminRoles.SingleAsync(r=>r.Code=="SYN-SOLO-HTTP");
            foreach(var c in new[]{AdminCapabilities.ConsignmentAgreementsApprove,AdminCapabilities.ConsignmentPolicyManage,AdminCapabilities.ConsignmentSelfReview})db.AdminRoleCapabilities.Add(new(){AdminRoleId=role.Id,Capability=c});
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsJsonAsync(action,r)).StatusCode); // Team even with capability.
        using(var scope=factory.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();var p=await db.ConsignmentApprovalPolicies.SingleAsync();
            p.Mode=ConsignmentApprovalMode.Solo;p.SelfReviewerAdminUserId=(await db.AdminUsers.SingleAsync()).Id;await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync(action,r with {SelfReview=null})).StatusCode);
        var response=await client.PostAsJsonAsync(action,r);Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        Assert.Contains("Self-reviewed (Solo)",await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root+"/review-log.csv?from=2026-01-01&to=2027-01-01")).StatusCode);
    }
}
