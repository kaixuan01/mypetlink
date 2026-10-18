using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

public sealed partial class ConsignmentRelationalTests
{
    private static ConsignmentService SoloService(MyPetLinkDbContext db) {
        var audit=new AuditLogService(db,new HttpContextAccessor());
        return new(db,audit,new BusinessIdentityService(db,audit,new FixedClock(Now)),new DocumentNumberService(db),
            new FixedClock(Now),new AdminAccessResolver(db,new StubCurrentUserService(AdminAccountId)));
    }
    private static async Task SoloAccess(MyPetLinkDbContext db,bool super=false)
    {
        var role=new AdminRoleDefinition {Code="SYN-SOLO",Name="Synthetic founder",GrantsAllCapabilities=super};
        foreach(var key in new[]{AdminCapabilities.ConsignmentView,AdminCapabilities.ConsignmentAgreementsApprove,
            AdminCapabilities.ConsignmentReconcile,AdminCapabilities.ConsignmentSelfReview,AdminCapabilities.ConsignmentPolicyManage})
            role.Capabilities.Add(new AdminRoleCapability {Capability=key});
        role.Assignments.Add(new AdminUserRoleAssignment {AdminUserId=AdminRecordId});db.AdminRoles.Add(role);
        if(!await db.ConsignmentApprovalPolicies.AnyAsync())db.ConsignmentApprovalPolicies.Add(new());
        await db.SaveChangesAsync();
    }
    private static async Task<ConsignmentApprovalPolicyResponse> SetMode(MyPetLinkDbContext db,string mode="Solo")
    {
        var s=SoloService(db);var p=await s.ApprovalPolicyAsync(AdminAccountId,default);
        return await s.SaveApprovalPolicyAsync(AdminAccountId,new(p.ConcurrencyToken,mode,AdminRecordId,true,"Synthetic founder operating policy"),default);
    }
    private static ConsignmentSelfReview Attest(string evidence="TEST-SIGNED")=>new(true,"Synthetic self-review with retained partner evidence",evidence);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SoloTeamModeStillRejectsMakerIncludingSuperAdmin(bool super)
    {
        await using var scope=await Database(3);await using var db=scope.NewContext();await SoloAccess(db,super);
        var s=SoloService(db);var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default))).StatusCode);
        Assert.Empty(db.ConsignmentReviewEvents);
        a=await s.AgreementActionAsync(OwnerAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED"),default);
        Assert.Equal("Independent (Team)",a.ApprovalReviewMode);
    }

    [Theory]
    [InlineData(false,"Reason long enough","TEST-SIGNED")]
    [InlineData(true,"short","TEST-SIGNED")]
    [InlineData(true,"Reason long enough","")]
    [InlineData(true,"Reason long enough","OTHER-EVIDENCE")]
    public async Task SoloAgreementNeedsConfirmationReasonAndActualAcceptance(bool confirmed,string reason,string evidence)
    {
        await using var scope=await Database(2);await using var db=scope.NewContext();await SoloAccess(db);await SetMode(db);
        var s=SoloService(db);var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        var r=new ConsignmentActionRequest(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:new(confirmed,reason,evidence));
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(AdminAccountId,a.Id,"approve",r,default))).StatusCode);
        Assert.Equal(ConsignmentAgreementStatus.Draft,(await db.ConsignmentAgreements.AsNoTracking().SingleAsync()).Status);
        Assert.DoesNotContain(await db.ConsignmentReviewEvents.AsNoTracking().ToListAsync(),e=>e.Action=="approve");
    }

    [Fact]
    public async Task SoloAgreementEvidenceIsFrozenAndSwitchingTeamBackRestoresChecks()
    {
        await using var scope=await Database(3);await using var db=scope.NewContext();await SoloAccess(db);await SetMode(db);
        var s=SoloService(db);var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        a=await s.AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default);
        Assert.Equal("Self-reviewed (Solo)",a.ApprovalReviewMode);
        var review=await db.ConsignmentReviewEvents.AsNoTracking().SingleAsync(e=>e.Action=="approve");
        Assert.Equal(AdminRecordId,review.ActorAdminUserId);Assert.Equal(Now,review.RecordedAt);Assert.Equal("TEST-SIGNED",review.ExternalEvidenceReference);
        Assert.True(await db.AuditLogs.AnyAsync(e=>e.Action=="consignment.solo-self-review"));
        var p=await SetMode(db,"Team");Assert.False(p.CanSelfReview);Assert.Null(p.SelfReviewerAdminUserId);
        var revision=await s.SaveAgreementAsync(AdminAccountId,null,Terms() with {SupersedesAgreementId=a.Id},null,default);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>SoloService(db).AgreementActionAsync(AdminAccountId,revision.Id,"approve",new(revision.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default))).StatusCode);
        await SetMode(db);revision=await SoloService(db).AgreementActionAsync(AdminAccountId,revision.Id,"approve",new(revision.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default);
        Assert.Equal("Self-reviewed (Solo)",revision.ApprovalReviewMode);
        Assert.Equal(3,await db.ConsignmentReviewEvents.CountAsync(e=>e.Action=="approval-policy-changed"));
        Assert.Equal(review.ExternalEvidenceReference,(await db.ConsignmentReviewEvents.AsNoTracking().SingleAsync(e=>e.Id==review.Id)).ExternalEvidenceReference);
        var csv=Encoding.UTF8.GetString(await s.ReviewLogCsvAsync(AdminAccountId,Now.AddDays(-1),Now.AddDays(1),default));
        Assert.Contains("Self-reviewed (Solo)",csv);Assert.Contains("TEST-SIGNED",csv);Assert.Contains("approval-policy-changed",csv);
        var tracked=await db.ConsignmentReviewEvents.SingleAsync(e=>e.Id==review.Id);tracked.Reason="Tamper";
        await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }

    [Fact]
    public async Task SoloPermissionRevocationAndDifferentNomineeDenySelfReviewImmediately()
    {
        await using var scope=await Database(2);await using var db=scope.NewContext();await SoloAccess(db);await SetMode(db);
        var s=SoloService(db);var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        var cap=await db.AdminRoleCapabilities.SingleAsync(c=>c.Capability==AdminCapabilities.ConsignmentSelfReview);
        db.AdminRoleCapabilities.Remove(cap);await db.SaveChangesAsync();
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>SoloService(db).AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default))).StatusCode);
        db.AdminRoleCapabilities.Add(new(){AdminRoleId=cap.AdminRoleId,Capability=cap.Capability});
        (await db.ConsignmentApprovalPolicies.SingleAsync()).SelfReviewerAdminUserId=CheckerAdminId;await db.SaveChangesAsync();
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>SoloService(db).AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default))).StatusCode);
        Assert.False((await SoloService(db).ApprovalPolicyAsync(AdminAccountId,default)).CanSelfReview);
    }

    [Fact]
    public async Task SoloSuperAdminCannotSelfReviewWhenAnotherFounderWasExplicitlyAuthorized()
    {
        await using var scope=await Database(1);await using var db=scope.NewContext();await SoloAccess(db,super:true);
        var role=await db.AdminRoles.SingleAsync(r=>r.Code=="SYN-SOLO");
        db.AdminUserRoles.Add(new(){AdminRoleId=role.Id,AdminUserId=CheckerAdminId});await db.SaveChangesAsync();
        var s=SoloService(db);var p=await s.ApprovalPolicyAsync(AdminAccountId,default);
        p=await s.SaveApprovalPolicyAsync(AdminAccountId,new(p.ConcurrencyToken,"Solo",CheckerAdminId,true,"Synthetic explicit nomination of another founder"),default);
        Assert.False(p.CanSelfReview);
        var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default))).StatusCode);
    }

    [Fact]
    public async Task SoloReceiptAndMissingDamagedReviewKeepActualCountsHoldsPdfAndNoFinance()
    {
        await using var scope=await Database(4);await using var db=scope.NewContext();await SoloAccess(db);await SetMode(db);
        var s=SoloService(db);var a=await s.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        a=await s.AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default);
        var d=await s.ReserveAsync(AdminAccountId,Reserve(a.Id,4),default);
        d=await s.ActionAsync(AdminAccountId,d.Id,"dispatch",Action(d),default);
        var originalPdf=(await db.ConsignmentDispatches.AsNoTracking().SingleAsync()).IssuedDocumentContent;
        var ids=d.Units.Select(u=>u.Id).ToArray();var evidence=Findings([ids[0],ids[1]],[ids[2]],[ids[3]]);
        var r=Action(d,"SYN-SOLO-RECEIPT") with {Receipt=evidence,SelfReview=Attest(evidence.SignedEvidenceReference)};
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"record-discrepancy",r with {SelfReview=null},default))).StatusCode);
        d=await s.ActionAsync(AdminAccountId,d.Id,"record-discrepancy",r,default);
        Assert.True(d.HasOpenDiscrepancy);Assert.Equal(3,d.ReceivedQuantity);Assert.Equal(2,d.Units.Count(u=>u.ReceivingState=="Good"));
        var count=await db.ConsignmentReviewEvents.CountAsync();var movementCount=d.History.Count;
        d=await s.ActionAsync(AdminAccountId,d.Id,"record-discrepancy",r,default);Assert.Equal(count,await db.ConsignmentReviewEvents.CountAsync());Assert.Equal(movementCount,d.History.Count);
        Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"record-discrepancy",r with {SelfReview=Attest(evidence.SignedEvidenceReference) with {Reason="Changed attestation reason"}},default))).StatusCode);
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"external-handover",Action(d,units:[ids[3]]),default));
        // Same evidence cannot resolve the founder's own finding.
        var resolve=Action(d,"SYN-SOLO-LOCATED") with {Receipt=Findings([ids[3]]),SelfReview=Attest(evidence.SignedEvidenceReference)};
        Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"resolve-discrepancy",resolve,default))).StatusCode);
        resolve=resolve with {Receipt=resolve.Receipt! with {SignedEvidenceReference="SYN-NEW-LOCATED-EVIDENCE"},SelfReview=Attest("SYN-NEW-LOCATED-EVIDENCE")};
        d=await s.ActionAsync(AdminAccountId,d.Id,"resolve-discrepancy",resolve,default);Assert.True(d.HasOpenDiscrepancy);
        d=await s.ActionAsync(AdminAccountId,d.Id,"return",Action(d,"SYN-ACTUAL-DAMAGED-RETURN",[ids[2]]),default);
        Assert.Equal("ReturnedQuarantine",d.Units.Single(u=>u.Id==ids[2]).Status);
        var returned=Findings([],returned:[ids[2]]) with {SignedEvidenceReference="SYN-NEW-ACTUAL-RETURN-REVIEW"};
        d=await s.ActionAsync(AdminAccountId,d.Id,"resolve-discrepancy",Action(d,"SYN-RETURN-REVIEW") with {Receipt=returned,SelfReview=Attest(returned.SignedEvidenceReference)},default);
        Assert.False(d.HasOpenDiscrepancy);Assert.Equal(1,d.ReceivedQuantity);Assert.All(d.Reviews,e=>Assert.Equal("Self-reviewed (Solo)",e.ReviewMode));
        await Assert.ThrowsAsync<ApiException>(()=>s.ActionAsync(AdminAccountId,d.Id,"release",Action(d,units:[ids[2]]),default));
        Assert.Equal(originalPdf,(await db.ConsignmentDispatches.AsNoTracking().SingleAsync()).IssuedDocumentContent);
        Assert.All(d.Units,u=>Assert.Null(u.TagCode));Assert.Empty(db.TagOrders);Assert.Empty(db.MerchantInvoices);Assert.Empty(db.MerchantReceipts);Assert.Empty(db.MerchantPayments);Assert.Empty(db.SalesCommissions);
        d=await s.ActionAsync(AdminAccountId,d.Id,"external-handover",Action(d,"SYN-HANDOVER-EVIDENCE",[ids[0]]) with {
            Handover=new("SYN-EXTERNAL-ENTRY",Now,false,null,null,null) },default);
        var docs=new ConsignmentDocumentService(db,s,new AuditLogService(db,new HttpContextAccessor()));
        Assert.Contains("Self-reviewed (Solo)",Encoding.UTF8.GetString(await docs.CsvAsync(AdminAccountId,d.Id,default)));
        Assert.Contains("Self-reviewed (Solo)",Encoding.UTF8.GetString(await docs.ReconciliationCsvAsync(AdminAccountId,Now.AddDays(-1),Now.AddDays(1),default)));
        Assert.Empty(db.MerchantInvoices);Assert.Empty(db.MerchantReceipts);Assert.Empty(db.MerchantPayments);Assert.Empty(db.SalesCommissions);
    }

    [Fact]
    public async Task SoloPolicyAuthorizationValidationAndStaleWritesFailSafely()
    {
        await using var scope=await Database(1);await using var db=scope.NewContext();await SoloAccess(db);
        var s=SoloService(db);var p=await s.ApprovalPolicyAsync(AdminAccountId,default);
        Assert.Equal(403,(await Assert.ThrowsAsync<ApiException>(()=>s.SaveApprovalPolicyAsync(OwnerAccountId,new(p.ConcurrencyToken,"Solo",AdminRecordId,true,"Synthetic enable reason"),default))).StatusCode);
        foreach(var r in new[]{new SaveConsignmentApprovalPolicyRequest(p.ConcurrencyToken,"Solo",AdminRecordId,false,"Synthetic enable reason"),
            new(p.ConcurrencyToken,"Unknown",AdminRecordId,true,"Synthetic enable reason"),new(p.ConcurrencyToken,"Solo",CheckerAdminId,true,"Synthetic enable reason")})
            Assert.Equal(400,(await Assert.ThrowsAsync<ApiException>(()=>s.SaveApprovalPolicyAsync(AdminAccountId,r,default))).StatusCode);
        await SetMode(db);
        Assert.Equal(409,(await Assert.ThrowsAsync<ApiException>(()=>SoloService(db).SaveApprovalPolicyAsync(AdminAccountId,new(p.ConcurrencyToken,"Team",null,true,"Synthetic revert reason"),default))).StatusCode);
        Assert.Equal("Solo",(await s.ApprovalPolicyAsync(AdminAccountId,default)).Mode);
    }

    [Fact]
    public async Task SoloConcurrentPolicyChangesHaveOneWinnerAndReviewUsesCommittedPolicy()
    {
        await using var scope=await Database(1);
        string token;
        await using(var db=scope.NewContext()) {await SoloAccess(db);token=(await SoloService(db).ApprovalPolicyAsync(AdminAccountId,default)).ConcurrencyToken;}
        async Task<bool> Change()
        {
            await using var db=scope.NewContext();
            try {await SoloService(db).SaveApprovalPolicyAsync(AdminAccountId,new(token,"Solo",AdminRecordId,true,"Synthetic concurrent enable"),default);return true;}
            catch(ApiException e) when(e.StatusCode==409){return false;}
        }
        var results=await Task.WhenAll(Change(),Change());Assert.Single(results.Where(x=>x));
        await using var check=scope.NewContext();Assert.Single(await check.ConsignmentReviewEvents.ToListAsync());
        var service=SoloService(check);var a=await service.SaveAgreementAsync(AdminAccountId,null,Terms(),null,default);
        async Task<bool> Approve()
        {
            await using var db=scope.NewContext();
            try {await SoloService(db).AgreementActionAsync(AdminAccountId,a.Id,"approve",new(a.ConcurrencyToken,"TEST-SIGNED",SelfReview:Attest()),default);return true;}
            catch(ApiException e) when(e.StatusCode==403){return false;}
        }
        async Task Team(){await using var db=scope.NewContext();await SetMode(db,"Team");}
        var approval=Approve();await Task.WhenAll(approval,Team());
        var events=await check.ConsignmentReviewEvents.AsNoTracking().Where(e=>e.Action=="approve").ToListAsync();
        Assert.Equal(await approval,events.Count==1);Assert.All(events,e=>Assert.Equal("Solo",e.PolicyMode));
        Assert.Equal(ConsignmentApprovalMode.Team,(await check.ConsignmentApprovalPolicies.AsNoTracking().SingleAsync()).Mode);
    }

    [Fact]
    public async Task SoloMigrationSeedsTeamPreservesOldEvidenceAndBlocksJournalTamperingAndRollback()
    {
        Assert.True(RelationalDatabase.IsAvailable,"SQL Server must run; this test cannot skip.");
        await using var scope=await RelationalDatabase.CreateAsync(createSchema:false);await using var db=scope.NewContext();
        var migrator=db.GetService<IMigrator>();await migrator.MigrateAsync("20261017160448_CompleteConsignmentReceivingAndApproval");
        await SeedAsync(db,qrStock:0,nfcStock:1);var id=await LegacyAgreement(db);
        await migrator.MigrateAsync();
        Assert.Equal(ConsignmentApprovalMode.Team,(await db.ConsignmentApprovalPolicies.SingleAsync()).Mode);
        Assert.Null((await db.ConsignmentAgreements.SingleAsync(a=>a.Id==id)).ApprovalReviewMode);
        var e=new ConsignmentReviewEvent {AgreementId=id,ActorAdminUserId=AdminRecordId,Action="approve",ReviewMode="Independent (Team)",PolicyMode="Team",RecordedAt=Now};
        db.ConsignmentReviewEvents.Add(e);await db.SaveChangesAsync();
        await Assert.ThrowsAsync<Microsoft.Data.SqlClient.SqlException>(()=>db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ConsignmentReviewEvents SET Reason='tamper' WHERE Id={e.Id}"));
        await Assert.ThrowsAsync<Microsoft.Data.SqlClient.SqlException>(()=>db.Database.ExecuteSqlInterpolatedAsync($"DELETE ConsignmentReviewEvents WHERE Id={e.Id}"));
        var ex=await Assert.ThrowsAsync<Microsoft.Data.SqlClient.SqlException>(()=>migrator.MigrateAsync("20261017160448_CompleteConsignmentReceivingAndApproval"));Assert.Equal(51040,ex.Number);
        Assert.Equal(1,await db.ConsignmentReviewEvents.CountAsync());
    }

    [Fact]
    public async Task SoloIdempotentScriptBootstrapsEmptySchemaAndNeverResetsAnEnabledPolicy()
    {
        Assert.True(RelationalDatabase.IsAvailable,"SQL Server script verification must not skip.");
        await using var scope=await RelationalDatabase.CreateAsync(createSchema:false);await using var db=scope.NewContext();
        var script=db.GetService<IMigrator>().GenerateScript(options:MigrationsSqlGenerationOptions.Idempotent);
        async Task Apply()
        {
            await db.Database.OpenConnectionAsync();
            try {
                foreach(var batch in System.Text.RegularExpressions.Regex.Split(script,@"^GO\s*$",System.Text.RegularExpressions.RegexOptions.Multiline|System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    if(!string.IsNullOrWhiteSpace(batch))await db.Database.ExecuteSqlRawAsync(batch);
            }
            finally {await db.Database.CloseConnectionAsync();}
        }
        await Apply();Assert.Equal(ConsignmentApprovalMode.Team,(await db.ConsignmentApprovalPolicies.AsNoTracking().SingleAsync()).Mode);
        await SeedAsync(db,qrStock:0,nfcStock:1);await SoloAccess(db);await SetMode(db);
        await Apply();Assert.Equal(ConsignmentApprovalMode.Solo,(await db.ConsignmentApprovalPolicies.AsNoTracking().SingleAsync()).Mode);
        Assert.Single(await db.ConsignmentReviewEvents.ToListAsync());
    }
}
