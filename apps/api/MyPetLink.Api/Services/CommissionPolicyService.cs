using System.Data;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ICommissionPolicyService
{
    Task<IReadOnlyList<SalespersonPolicyAssignmentResponse>> ListAsync(Guid salespersonId, CancellationToken cancellationToken);
    Task<SalespersonPolicyAssignmentResponse> RecordAsync(Guid? actorUserId, Guid salespersonId,
        RecordSalespersonPolicyAssignmentRequest request, CancellationToken cancellationToken);
    Task<SalespersonPolicyAssignmentResponse> EndAsync(Guid? actorUserId, Guid salespersonId, Guid id,
        EndSalespersonPolicyAssignmentRequest request, CancellationToken cancellationToken);
}

/// <summary>
/// Records which named commission policy governs a salesperson, and from when.
/// Nobody moves to a new policy without one of these rows: legacy terms stay in
/// force until an administrator records the salesperson's acceptance. Dates are
/// never backdated before that acceptance, and an assignment can be ended only
/// from now on, so neither action can rewrite an earned entitlement.
/// </summary>
public sealed class CommissionPolicyService(MyPetLinkDbContext db, IAuditLogService audit, TimeProvider time)
    : ICommissionPolicyService
{
    public async Task<IReadOnlyList<SalespersonPolicyAssignmentResponse>> ListAsync(Guid salespersonId, CancellationToken cancellationToken)
    {
        await RequireSalespersonAsync(salespersonId, tracked: false, cancellationToken);
        return (await db.SalespersonPolicyAssignments.AsNoTracking().Where(item => item.SalespersonId == salespersonId)
            .OrderByDescending(item => item.EffectiveFrom).ToListAsync(cancellationToken)).Select(ToResponse).ToArray();
    }

    public async Task<SalespersonPolicyAssignmentResponse> RecordAsync(Guid? actorUserId, Guid salespersonId,
        RecordSalespersonPolicyAssignmentRequest request, CancellationToken cancellationToken)
    {
        var code = request.PolicyCode?.Trim();
        if (!CommissionPolicyCodes.IsKnown(code)) throw Validation("policyCode", "Choose a commission policy.");
        var reference = request.AgreementReference?.Trim();
        if (reference is null || reference.Length is < 3 or > 200)
            throw Validation("agreementReference", "Record where the salesperson accepted these terms (3 to 200 characters).");
        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (notes?.Length > 2000) throw Validation("notes", "Keep notes to 2,000 characters or fewer.");
        if (request.AcceptedAt == default) throw Validation("acceptedAt", "Enter when the salesperson accepted these terms.");
        if (request.EffectiveFrom == default) throw Validation("effectiveFrom", "Enter when these terms take effect.");
        var now = time.GetUtcNow();
        var accepted = request.AcceptedAt.ToUniversalTime();
        var from = request.EffectiveFrom.ToUniversalTime();
        if (accepted > now.AddMinutes(2)) throw Validation("acceptedAt", "The acceptance can't be in the future.");
        // The acceptance itself is the earliest possible start: terms are never backdated before the salesperson agreed to them.
        if (from < accepted) throw Validation("effectiveFrom", "These terms can't take effect before the salesperson accepted them.");

        return await InTransactionAsync(async () =>
        {
            var salesperson = await RequireSalespersonAsync(salespersonId, tracked: true, cancellationToken);
            await LockSalespersonAsync(salespersonId, cancellationToken);
            if (!salesperson.IsActive) throw Conflict("salesperson_inactive", "Reactivate this salesperson before recording new commission terms.");
            var overlaps = await db.SalespersonPolicyAssignments.AnyAsync(item => item.SalespersonId == salespersonId
                && (item.EffectiveToExclusive == null || item.EffectiveToExclusive > from), cancellationToken);
            if (overlaps)
                throw Conflict("commission_policy_overlap",
                    "This salesperson already has commission terms in force from that date. End those terms first; one salesperson is governed by one set of terms at a time.");
            var admin = await RequireAdminAsync(actorUserId, cancellationToken);
            var assignment = new SalespersonPolicyAssignment
            {
                SalespersonId = salespersonId, PolicyCode = code!, AcceptedAt = accepted, EffectiveFrom = from,
                AgreementReference = reference, Notes = notes, CreatedByAdminUserId = admin, CreatedAt = now, UpdatedAt = now,
            };
            db.SalespersonPolicyAssignments.Add(assignment);
            audit.Append(actorUserId, ActorType.Admin, "salesperson.commission-policy-recorded", "Salesperson", salespersonId, null,
                new { assignment.Id, assignment.PolicyCode, assignment.AcceptedAt, assignment.EffectiveFrom, assignment.AgreementReference });
            await db.SaveChangesAsync(cancellationToken);
            return ToResponse(assignment);
        }, cancellationToken);
    }

    public async Task<SalespersonPolicyAssignmentResponse> EndAsync(Guid? actorUserId, Guid salespersonId, Guid id,
        EndSalespersonPolicyAssignmentRequest request, CancellationToken cancellationToken)
    {
        var reason = request.Reason?.Trim();
        if (reason is null || reason.Length is < 10 or > 1000)
            throw Validation("reason", "Explain why these terms end (10 to 1,000 characters).");
        var now = time.GetUtcNow();
        var to = request.EffectiveToExclusive.ToUniversalTime();
        // Ending terms in the past would quietly take away commission on sales not yet verified.
        if (to < now.AddMinutes(-2)) throw Validation("effectiveToExclusive", "Terms can only end from now on.");

        return await InTransactionAsync(async () =>
        {
            await LockSalespersonAsync(salespersonId, cancellationToken);
            var assignment = await db.SalespersonPolicyAssignments
                .SingleOrDefaultAsync(item => item.Id == id && item.SalespersonId == salespersonId, cancellationToken)
                ?? throw new ApiException(404, "commission_policy_not_found", "Those commission terms no longer exist.");
            ApplyConcurrency(assignment, request.ConcurrencyToken);
            if (assignment.EndedAt is not null) throw Conflict("commission_policy_ended", "These terms have already ended.");
            if (assignment.EffectiveToExclusive is { } planned && planned <= to)
                throw Conflict("commission_policy_ended", "These terms already end on or before that date.");
            if (to <= assignment.EffectiveFrom) throw Validation("effectiveToExclusive", "The end must be after the terms took effect.");
            var before = new { assignment.EffectiveToExclusive };
            assignment.EffectiveToExclusive = to;
            assignment.EndedAt = now;
            assignment.EndedByAdminUserId = await RequireAdminAsync(actorUserId, cancellationToken);
            assignment.EndReason = reason;
            audit.Append(actorUserId, ActorType.Admin, "salesperson.commission-policy-ended", "Salesperson", salespersonId, before,
                new { assignment.Id, assignment.PolicyCode, assignment.EffectiveToExclusive, reason });
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateConcurrencyException) { throw Conflict("concurrency_conflict", "These terms changed. Reload and try again."); }
            return ToResponse(assignment);
        }, cancellationToken);
    }

    private async Task<T> InTransactionAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken) =>
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            // Each retry starts from the committed rows, not the abandoned attempt's tracked changes.
            db.ChangeTracker.Clear();
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
                : null;
            var result = await operation();
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            return result;
        });

    private async Task LockSalespersonAsync(Guid salespersonId, CancellationToken cancellationToken)
    {
        if (db.Database.IsSqlServer())
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT 1 FROM [Salespersons] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {salespersonId}", cancellationToken);
    }

    private async Task<Salesperson> RequireSalespersonAsync(Guid id, bool tracked, CancellationToken cancellationToken)
    {
        var query = tracked ? db.Salespersons : db.Salespersons.AsNoTracking();
        return await query.SingleOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new ApiException(404, "salesperson_not_found", "That salesperson no longer exists.");
    }

    private async Task<Guid> RequireAdminAsync(Guid? actorUserId, CancellationToken cancellationToken)
    {
        if (actorUserId is null) throw new ApiException(401, "unauthorized", "Authentication is required.");
        return await db.AdminUsers.AsNoTracking()
            .Where(item => item.UserId == actorUserId.Value && item.IsActive && item.DisabledAt == null)
            .Select(item => (Guid?)item.Id).SingleOrDefaultAsync(cancellationToken)
            ?? throw new ApiException(403, "forbidden", "Admin access is required.");
    }

    private void ApplyConcurrency(SalespersonPolicyAssignment assignment, string? token)
    {
        byte[] expected;
        try { expected = Convert.FromBase64String(token ?? ""); }
        catch (FormatException) { throw Validation("concurrencyToken", "Reload these terms and try again."); }
        if (db.Database.IsRelational() && !assignment.RowVersion.SequenceEqual(expected))
            throw Conflict("concurrency_conflict", "These terms changed. Reload and try again.");
        db.Entry(assignment).Property(item => item.RowVersion).OriginalValue = expected;
    }

    private static SalespersonPolicyAssignmentResponse ToResponse(SalespersonPolicyAssignment item) => new(
        item.Id, item.SalespersonId, item.PolicyCode, item.AcceptedAt, item.EffectiveFrom, item.EffectiveToExclusive,
        item.AgreementReference, item.Notes, item.CreatedAt, item.EndedAt, item.EndReason, Convert.ToBase64String(item.RowVersion));

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.", new Dictionary<string, string[]> { [field] = [message] });
    private static ApiException Conflict(string code, string message) => new(409, code, message);
}
