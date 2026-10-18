using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class ConsignmentAuthorizationTests
{
    [Theory]
    [InlineData("Create",AdminCapabilities.ConsignmentAgreementsManage)]
    [InlineData("Update",AdminCapabilities.ConsignmentAgreementsManage)]
    [InlineData("Approve",AdminCapabilities.ConsignmentAgreementsApprove)]
    [InlineData("Reserve",AdminCapabilities.ConsignmentAllocate)]
    [InlineData("Dispatch",AdminCapabilities.ConsignmentDispatch)]
    [InlineData("Receive",AdminCapabilities.ConsignmentReconcile)]
    [InlineData("Return",AdminCapabilities.ConsignmentReturn)]
    [InlineData("Release",AdminCapabilities.ConsignmentRelease)]
    [InlineData("WriteOff",AdminCapabilities.ConsignmentWriteOff)]
    [InlineData("CorrectHandover",AdminCapabilities.ConsignmentReconcile)]
    [InlineData("ReverseHandover",AdminCapabilities.ConsignmentReconcile)]
    [InlineData("Manifest",AdminCapabilities.ConsignmentManifestExport)]
    [InlineData("Csv",AdminCapabilities.ConsignmentManifestExport)]
    public void SensitiveActionsRequireSpecificCapabilities(string method,string capability)
    {
        Assert.Contains(typeof(AdminConsignmentController).GetCustomAttributes<AuthorizeAttribute>(),a=>a.Policy==AdminCapabilities.ConsignmentView);
        Assert.Contains(typeof(AdminConsignmentController).GetMethod(method)!.GetCustomAttributes<AuthorizeAttribute>(),a=>a.Policy==capability);
    }
    [Fact]
    public async Task AuditorCanViewButCannotExportManifestsMutateOrDispatchAndDeactivationRevokesAccess()
    {
        await using var db=await AdminAccessTestHarness.CreateAsync(AdminRole.Admin);
        var admin=await db.AdminUsers.SingleAsync();
        await AdminAccessTestHarness.SetRolesAsync(db,admin,AdminRoleTemplates.AuditorCode);
        Assert.True(await FinancialAuthorizationPolicyTests.AuthorizeAsync(db,admin.UserId,AdminCapabilities.ConsignmentView));
        foreach(var capability in new[] {AdminCapabilities.ConsignmentManifestExport,AdminCapabilities.ConsignmentAgreementsManage,
            AdminCapabilities.ConsignmentDispatch,AdminCapabilities.ConsignmentRelease,AdminCapabilities.ConsignmentAllocate})
            Assert.False(await FinancialAuthorizationPolicyTests.AuthorizeAsync(db,admin.UserId,capability));
        admin.IsActive=false;await db.SaveChangesAsync();
        Assert.False(await FinancialAuthorizationPolicyTests.AuthorizeAsync(db,admin.UserId,AdminCapabilities.ConsignmentView));
    }
}
