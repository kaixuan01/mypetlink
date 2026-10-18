using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed partial class ConsignmentService
{
    public async Task<ConsignmentApprovalPolicyResponse> ApprovalPolicyAsync(Guid? actor, CancellationToken ct)
    {
        var caller = access is null ? AdminAccessSnapshot.None : await access.ResolveAsync(actor,ct);
        var p = await db.ConsignmentApprovalPolicies.AsNoTracking().SingleOrDefaultAsync(ct);
        var founder = p?.SelfReviewerAdminUserId;
        var nominee = await db.AdminUsers.Where(a=>a.Id==founder).Select(a=>new {a.UserId,a.User.DisplayName}).SingleOrDefaultAsync(ct);
        var eligible=nominee is not null && access is not null && (await access.ResolveAsync(nominee.UserId,ct)).Has(AdminCapabilities.ConsignmentSelfReview);
        var options = new List<ConsignmentReviewerOption>();
        if (caller.Has(AdminCapabilities.ConsignmentPolicyManage) && access is not null)
        {
            var admins = await db.AdminUsers.AsNoTracking().Where(a=>a.IsActive && a.DisabledAt==null
                && a.User.Status==UserStatus.Active && a.User.DeletedAt==null)
                .OrderBy(a=>a.User.DisplayName).Select(a=>new { a.Id,a.UserId,a.User.DisplayName }).ToListAsync(ct);
            foreach(var a in admins)
                options.Add(new(a.Id,a.DisplayName,(await access.ResolveAsync(a.UserId,ct)).Has(AdminCapabilities.ConsignmentSelfReview)));
        }
        return new(p?.Mode.ToString() ?? "Team",founder,nominee?.DisplayName,
            p?.Mode==ConsignmentApprovalMode.Solo && founder==caller.AdminUserId && caller.Has(AdminCapabilities.ConsignmentSelfReview),
            p?.UpdatedByAdminUserId,p?.UpdatedAt,Convert.ToBase64String(p?.RowVersion ?? []),options,
            (await db.ConsignmentReviewEvents.AsNoTracking().Where(e=>e.Action=="approval-policy-changed")
                .OrderByDescending(e=>e.RecordedAt).ThenByDescending(e=>e.Id).Take(20).ToListAsync(ct)).Select(MapReview).ToArray(),eligible);
    }

    public async Task<ConsignmentApprovalPolicyResponse> SaveApprovalPolicyAsync(Guid? actor, SaveConsignmentApprovalPolicyRequest r, CancellationToken ct)
    {
        if (access is null || !(await access.ResolveAsync(actor,ct)).Has(AdminCapabilities.ConsignmentPolicyManage))
            throw new ApiException(403,"forbidden","Approval policy management permission is required.");
        if (r.Mode is not ("Team" or "Solo") || !r.Confirmed || string.IsNullOrWhiteSpace(r.Reason)
            || r.Reason.Trim().Length<10 || r.Reason.Length>1000)
            throw Bad("Confirm the approval policy change and give a reason of 10 to 1,000 characters.");
        await RunAsync(actor,async admin=> {
            var p=await db.ConsignmentApprovalPolicies.SingleOrDefaultAsync(ct)
                ?? throw Conflict("The approval policy is unavailable. Self-review remains disabled.");
            Token(p.RowVersion,r.ConcurrencyToken);
            var mode=Enum.Parse<ConsignmentApprovalMode>(r.Mode);
            Guid? nominee=mode==ConsignmentApprovalMode.Solo ? r.SelfReviewerAdminUserId : null;
            if (mode==ConsignmentApprovalMode.Solo)
            {
                var user=await db.AdminUsers.Where(a=>a.Id==nominee).Select(a=>(Guid?)a.UserId).SingleOrDefaultAsync(ct);
                if (user is null || !(await access.ResolveAsync(user,ct)).Has(AdminCapabilities.ConsignmentSelfReview))
                    throw Bad("Choose an active founder with the self-review permission. Naming someone does not grant their other permissions.");
            }
            if(p.Mode==mode && p.SelfReviewerAdminUserId==nominee) return;
            var before=new { Mode=p.Mode.ToString(),p.SelfReviewerAdminUserId };
            db.ConsignmentReviewEvents.Add(new() { Action="approval-policy-changed",ReviewMode="Policy change",
                PreviousPolicyMode=p.Mode.ToString(),PolicyMode=r.Mode,PreviousSelfReviewerAdminUserId=p.SelfReviewerAdminUserId,
                SelfReviewerAdminUserId=nominee,PolicyVersion=Convert.ToBase64String(p.RowVersion),
                ActorAdminUserId=admin,RecordedAt=time.GetUtcNow(),Reason=r.Reason.Trim() });
            p.Mode=mode;p.SelfReviewerAdminUserId=nominee;p.UpdatedByAdminUserId=admin;p.UpdatedAt=time.GetUtcNow();
            audit.Append(admin,ActorType.Admin,"consignment.approval-policy-changed","ConsignmentApprovalPolicy",null,
                before,new { Mode=r.Mode,p.SelfReviewerAdminUserId,r.Reason });
        },ct);
        return await ApprovalPolicyAsync(actor,ct);
    }

    // Called only from the three approved independence checks, inside RunAsync's existing SQL application lock.
    private async Task<ConsignmentReviewEvent> Review(Guid admin,bool self,string action,ConsignmentActionRequest r,
        Guid? agreement,Guid? dispatch,CancellationToken ct)
    {
        var p=await db.ConsignmentApprovalPolicies.AsNoTracking().SingleOrDefaultAsync(ct);
        var mode=p?.Mode ?? ConsignmentApprovalMode.Team;
        if(self)
        {
            var actor=await db.AdminUsers.Where(a=>a.Id==admin).Select(a=>a.UserId).SingleAsync(ct);
            if(mode!=ConsignmentApprovalMode.Solo || p?.SelfReviewerAdminUserId!=admin || access is null
                || !(await access.ResolveAsync(actor,ct)).Has(AdminCapabilities.ConsignmentSelfReview))
                throw new ApiException(403,action=="approve"?"independent_approval_required":action=="resolve-discrepancy"?"independent_discrepancy_review_required":"independent_receipt_required","Independent review is required unless Solo Mode explicitly authorizes you to self-review.");
            if(r.SelfReview is not {Confirmed:true} e || string.IsNullOrWhiteSpace(e.Reason) || e.Reason.Trim().Length<10
                || e.Reason.Length>1000 || string.IsNullOrWhiteSpace(e.ExternalEvidenceReference)
                || e.ExternalEvidenceReference.Trim().Length<5 || e.ExternalEvidenceReference.Length>1000)
                throw Bad("Confirm self-review, give a reason of 10 to 1,000 characters and reference genuine external evidence.");
        }
        var row=new ConsignmentReviewEvent { AgreementId=agreement,DispatchId=dispatch,Action=action,
            ReviewMode=self ? "Self-reviewed (Solo)" : mode==ConsignmentApprovalMode.Solo ? "Independent (Solo)" : "Independent (Team)",
            RequestReference=r.Reference.Trim(),PolicyMode=mode.ToString(),PolicyVersion=Convert.ToBase64String(p?.RowVersion??[]),SelfReviewerAdminUserId=p?.SelfReviewerAdminUserId,
            ActorAdminUserId=admin,RecordedAt=time.GetUtcNow(),Reason=self ? r.SelfReview!.Reason.Trim() : r.Reference.Trim(),
            ExternalEvidenceReference=self ? r.SelfReview!.ExternalEvidenceReference.Trim() : r.Receipt?.SignedEvidenceReference.Trim() ?? r.Reference.Trim() };
        db.ConsignmentReviewEvents.Add(row);
        audit.Append(admin,ActorType.Admin,self ? "consignment.solo-self-review" : "consignment.independent-review",
            dispatch is null ? "ConsignmentAgreement" : "ConsignmentDispatch",dispatch??agreement,null,MapReview(row));
        return row;
    }

    private static ConsignmentReviewResponse MapReview(ConsignmentReviewEvent e)=>new(e.Id,e.Action,e.ReviewMode,e.ActorAdminUserId,
        e.RecordedAt,e.Reason,e.ExternalEvidenceReference,e.PolicyMode,e.PreviousPolicyMode,e.SelfReviewerAdminUserId,
        e.PreviousSelfReviewerAdminUserId,e.AgreementId,e.DispatchId,e.RequestReference);

    public async Task<byte[]> ReviewLogCsvAsync(Guid? actor,DateTimeOffset from,DateTimeOffset to,CancellationToken ct)
    {
        if(from==default || to<=from || to-from>TimeSpan.FromDays(366)) throw Bad("Choose a review period of up to 366 days. The end is exclusive.");
        var rows=await db.ConsignmentReviewEvents.AsNoTracking().Where(e=>e.RecordedAt>=from && e.RecordedAt<to)
            .OrderBy(e=>e.RecordedAt).ThenBy(e=>e.Id).Take(10001).ToListAsync(ct);
        if(rows.Count>10000)throw Bad("Choose a shorter review period (maximum 10,000 events).");
        var s=new StringBuilder();
        s.AppendLine(string.Join(',',new[]{"Event ID","Action","Review mode","Actor admin ID","Recorded UTC","Agreement ID","Dispatch ID","Reason","External evidence","Policy mode","Previous policy mode","Authorized founder admin ID","Previous founder admin ID","Policy version","Request reference","Self-review confirmed"}.Select(AdminExportSanitizer.Csv)));
        foreach(var e in rows)s.AppendLine(string.Join(',',new[]{e.Id.ToString(),e.Action,e.ReviewMode,e.ActorAdminUserId.ToString(),e.RecordedAt.ToString("O"),e.AgreementId?.ToString()??"",e.DispatchId?.ToString()??"",e.Reason,e.ExternalEvidenceReference,e.PolicyMode,e.PreviousPolicyMode??"",e.SelfReviewerAdminUserId?.ToString()??"",e.PreviousSelfReviewerAdminUserId?.ToString()??"",e.PolicyVersion,e.RequestReference,e.ReviewMode=="Self-reviewed (Solo)"?"Yes":"No"}.Select(AdminExportSanitizer.Csv)));
        await RunAsync(actor,admin=>{audit.Append(admin,ActorType.Admin,"consignment.review-log-exported","ConsignmentReviewEvent",null,null,new {from,to,Count=rows.Count});return Task.CompletedTask;},ct);
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(s.ToString())).ToArray();
    }
}
