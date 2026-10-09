using System.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The Admin Portal's Community moderation actions started from a report. Every
/// one is Community-only and is one transaction: the change, the report
/// decisions, one <see cref="AuditLog"/> row, the affected household's
/// moderation history entry and — when something of theirs was removed or their
/// Community access was restricted — their notice commit together or not at
/// all. Actions taken without a report are <see cref="AdminCommunityEnforcementService"/>.
///
/// <b>Decisions close the target, not the household.</b> A decision resolves
/// every Open report about the same target (<see cref="CommunityReportTargets"/>)
/// with the same resolution, note, moderator and time — and nothing else: other
/// Comments, Moments or the profile of the same household stay separate items.
///
/// <b>Converging, never repeating.</b> Removing an already-removed Comment,
/// hiding an already-hidden Moment or restricting an already-restricted
/// household changes nothing about the content and still decides the open
/// reports (<c>AlreadyInEffect</c>). A report that is already decided answers
/// <c>409 community_report_already_resolved</c>.
///
/// <b>Concurrency.</b> All actions on one target serialize on a SQL Server
/// application lock for that target (and the household, when the household is
/// what changes). The clicked report is saved against the row version the
/// moderator saw, and every other row it writes against the version it read,
/// so two moderators — or a moderator and the owner — can never both commit
/// against the same state: the loser gets a deterministic <c>409</c>.
///
/// <b>Server-chosen state.</b> The client sends a note and the report's row
/// version, nothing else. Status, resolution and every "by" field come from the
/// server, and the moderator is the session's account. A moderator never
/// decides a report their own household made or is the subject of.
/// </summary>
public sealed class AdminCommunityModerationService : SkeletonService, IAdminCommunityModerationService
{
    public const string Applied = "Applied";
    public const string AlreadyInEffect = "AlreadyInEffect";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IOwnerNotificationService _notifications;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public AdminCommunityModerationService(
        MyPetLinkDbContext dbContext,
        IOwnerNotificationService notifications,
        IAuditLogService auditLogService,
        TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _notifications = notifications;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    // ---- Dismiss ----------------------------------------------------------------

    public Task<AdminCommunityModerationResultResponse> DismissAsync(
        Guid? currentUserId,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken = default)
    {
        return DecideAsync(currentUserId, reportId, request, ModerationAction.Dismiss, cancellationToken);
    }

    // ---- Remove Comment -----------------------------------------------------------

    public Task<AdminCommunityModerationResultResponse> RemoveCommentAsync(
        Guid? currentUserId,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken = default)
    {
        return DecideAsync(currentUserId, reportId, request, ModerationAction.RemoveComment, cancellationToken);
    }

    // ---- Hide / Unhide Moment -----------------------------------------------------

    public Task<AdminCommunityModerationResultResponse> HideMomentAsync(
        Guid? currentUserId,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken = default)
    {
        return DecideAsync(currentUserId, reportId, request, ModerationAction.HideMoment, cancellationToken);
    }

    /// <summary>
    /// Returns a hidden Moment to wherever its owner's own settings would show
    /// it. Report history is not touched: decided reports stay decided.
    /// </summary>
    public async Task<AdminCommunityModerationResultResponse> UnhideMomentAsync(
        Guid? currentUserId,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var note = CommunityModerationNoteRules.RequireValid(request?.Note);
        var target = await LoadTargetAsync(reportId, moderatorId, cancellationToken);
        RequireTargetType(target, CommunityReportTargetType.Moment);

        return await InTransactionAsync([MomentLock(target.MomentId!.Value)], async () =>
        {
            var moment = await _dbContext.PetMemories
                .SingleAsync(item => item.Id == target.MomentId, cancellationToken);
            if (!CommunityModeration.IsHidden(moment))
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "moment_not_hidden",
                    "This Moment isn't hidden.");
            }

            var previous = new { hidden = true, hiddenAt = moment.ModeratedAt, hiddenByUserId = moment.ModeratedByUserId };
            CommunityModeration.UnhideMoment(moment);
            CommunityModerationHistory.Record(
                _dbContext,
                moment.AuthorUserId,
                CommunityModerationActionType.MomentRestored,
                reason: null,
                note,
                moderatorId,
                _timeProvider.GetUtcNow(),
                momentId: moment.Id,
                reportId: target.Id);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.MomentUnhidden,
                CommunityModerationAudit.MomentEntity,
                moment.Id,
                previous,
                new { hidden = false, reportId = target.Id, note });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return new AdminCommunityModerationResultResponse(target.Id, Applied, 0);
        }, cancellationToken);
    }

    // ---- Restrict / Lift household ------------------------------------------------

    public Task<AdminCommunityModerationResultResponse> RestrictHouseholdAsync(
        Guid? currentUserId,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken = default)
    {
        return DecideAsync(currentUserId, reportId, request, ModerationAction.RestrictHousehold, cancellationToken);
    }

    /// <summary>
    /// Ends a household's restriction and restores exactly the owner's own
    /// Community choice. Report history is not touched.
    /// </summary>
    public async Task<AdminCommunityModerationResultResponse> LiftRestrictionAsync(
        Guid? currentUserId,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var note = CommunityModerationNoteRules.RequireValid(request?.Note);
        var target = await LoadTargetAsync(reportId, moderatorId, cancellationToken);

        return await InTransactionAsync([HouseholdLock(target.ReportedUserId)], async () =>
        {
            var profile = await RequireProfileAsync(target.ReportedUserId, cancellationToken);
            if (!CommunityModeration.IsRestricted(profile))
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "household_not_restricted",
                    "This household's Community access isn't paused.");
            }

            var previous = new
            {
                restricted = true,
                restrictedAt = profile.CommunityRestrictedAt,
                restrictedByUserId = profile.CommunityRestrictedByUserId,
                communityEnabled = profile.IsSocialEnabled,
                ownerChoice = profile.CommunityEnabledBeforeRestriction
            };
            CommunityModeration.LiftRestriction(profile);
            CommunityModerationHistory.Record(
                _dbContext,
                profile.UserId,
                CommunityModerationActionType.CommunityRestrictionLifted,
                reason: null,
                note,
                moderatorId,
                _timeProvider.GetUtcNow(),
                reportId: target.Id);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.HouseholdRestrictionLifted,
                CommunityModerationAudit.HouseholdEntity,
                profile.Id,
                previous,
                new
                {
                    restricted = false,
                    communityEnabled = profile.IsSocialEnabled,
                    ownerId = profile.UserId,
                    reportId = target.Id,
                    note
                });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return new AdminCommunityModerationResultResponse(target.Id, Applied, 0);
        }, cancellationToken);
    }

    // ---- the decision path --------------------------------------------------------

    private enum ModerationAction
    {
        Dismiss,
        RemoveComment,
        HideMoment,
        RestrictHousehold
    }

    /// <summary>
    /// Every action that decides the report: load and lock the target, check the
    /// report is still Open at the version the moderator saw, apply the action,
    /// resolve every Open report on the same target, append one audit row, and
    /// save once.
    /// </summary>
    private async Task<AdminCommunityModerationResultResponse> DecideAsync(
        Guid? currentUserId,
        Guid reportId,
        AdminCommunityModerationRequest? request,
        ModerationAction action,
        CancellationToken cancellationToken)
    {
        var moderatorId = RequireModerator(currentUserId);
        var note = CommunityModerationNoteRules.RequireValid(request?.Note);
        var rowVersion = RequireRowVersion(request?.RowVersion);
        // What the household is told; validated before anything is read.
        CommunityModerationReason? chosenReason = string.IsNullOrWhiteSpace(request?.Reason)
            ? null
            : CommunityModerationReasons.Parse(request.Reason);
        var target = await LoadTargetAsync(reportId, moderatorId, cancellationToken);

        switch (action)
        {
            case ModerationAction.RemoveComment:
                RequireTargetType(target, CommunityReportTargetType.Comment);
                break;
            case ModerationAction.HideMoment:
                RequireTargetType(target, CommunityReportTargetType.Moment);
                break;
        }

        var locks = new List<string> { TargetLock(target) };
        if (action == ModerationAction.RestrictHousehold
            && target.TargetType != CommunityReportTargetType.Household)
        {
            locks.Add(HouseholdLock(target.ReportedUserId));
        }

        return await InTransactionAsync(locks, async transaction =>
        {
            var report = await _dbContext.CommunityReports
                .SingleAsync(item => item.Id == reportId, cancellationToken);
            if (report.Status != CommunityReportStatus.Open)
            {
                throw AlreadyResolved();
            }

            _dbContext.Entry(report).Property(item => item.RowVersion).OriginalValue = rowVersion;
            var siblings = await _dbContext.CommunityReports
                .SameTarget(report)
                .Where(item => item.Status == CommunityReportStatus.Open && item.Id != report.Id)
                .ToListAsync(cancellationToken);
            var decided = siblings.Prepend(report).ToArray();
            var resolvedIds = decided.Select(item => item.Id).ToArray();
            var now = _timeProvider.GetUtcNow();

            string outcome;
            switch (action)
            {
                case ModerationAction.Dismiss:
                    outcome = Applied;
                    Resolve(decided, CommunityReportResolution.Dismissed, moderatorId, note, now);
                    _auditLogService.Append(
                        moderatorId,
                        ActorType.Admin,
                        CommunityModerationAudit.ReportDismissed,
                        CommunityModerationAudit.ReportEntity,
                        report.Id,
                        new { status = nameof(CommunityReportStatus.Open) },
                        new
                        {
                            status = nameof(CommunityReportStatus.Resolved),
                            resolution = nameof(CommunityReportResolution.Dismissed),
                            targetType = report.TargetType.ToString(),
                            resolvedReportIds = resolvedIds,
                            note
                        });
                    break;

                case ModerationAction.RemoveComment:
                {
                    var commentId = report.CommentId!.Value;
                    var before = await _dbContext.MomentComments
                        .AsNoTracking()
                        .Where(item => item.Id == commentId)
                        .Select(item => new
                        {
                            item.MomentId,
                            item.AuthorUserId,
                            item.ParentCommentId,
                            item.Body,
                            item.DeletedAt,
                            item.DeletedByUserId
                        })
                        .SingleAsync(cancellationToken);
                    var removed = await MomentCommentRemoval.StageAsync(
                        _dbContext,
                        _notifications,
                        transaction,
                        moderatorId,
                        commentId,
                        cancellationToken);
                    outcome = removed ? Applied : AlreadyInEffect;
                    if (removed)
                    {
                        await RecordAndNotifyAsync(
                            before.AuthorUserId,
                            before.ParentCommentId is null
                                ? CommunityModerationActionType.CommentRemoved
                                : CommunityModerationActionType.ReplyRemoved,
                            report,
                            chosenReason,
                            note,
                            moderatorId,
                            now,
                            commentId: commentId,
                            snapshot: CommunityModerationSnapshot.ForComment(before.Body),
                            cancellationToken: cancellationToken);
                    }

                    Resolve(decided, CommunityReportResolution.CommentRemoved, moderatorId, note, now);
                    _auditLogService.Append(
                        moderatorId,
                        ActorType.Admin,
                        CommunityModerationAudit.CommentRemoved,
                        CommunityModerationAudit.CommentEntity,
                        commentId,
                        removed
                            ? new { removed = false, removedAt = (DateTimeOffset?)null, removedByUserId = (Guid?)null }
                            : new { removed = true, removedAt = before.DeletedAt, removedByUserId = before.DeletedByUserId },
                        new
                        {
                            removed = true,
                            alreadyRemoved = !removed,
                            momentId = before.MomentId,
                            reportId = report.Id,
                            resolvedReportIds = resolvedIds,
                            note
                        });
                    break;
                }

                case ModerationAction.HideMoment:
                {
                    var moment = await _dbContext.PetMemories
                        .SingleAsync(item => item.Id == report.MomentId, cancellationToken);
                    var wasHidden = CommunityModeration.IsHidden(moment);
                    var previous = new { hidden = wasHidden, hiddenAt = moment.ModeratedAt };
                    CommunityModeration.HideMoment(moment, moderatorId, now);
                    outcome = wasHidden ? AlreadyInEffect : Applied;
                    if (!wasHidden)
                    {
                        await RecordAndNotifyAsync(
                            moment.AuthorUserId,
                            CommunityModerationActionType.MomentRemoved,
                            report,
                            chosenReason,
                            note,
                            moderatorId,
                            now,
                            momentId: moment.Id,
                            snapshot: CommunityModerationSnapshot.ForMoment(moment.Title, moment.Caption),
                            cancellationToken: cancellationToken);
                    }
                    Resolve(decided, CommunityReportResolution.MomentHidden, moderatorId, note, now);
                    _auditLogService.Append(
                        moderatorId,
                        ActorType.Admin,
                        CommunityModerationAudit.MomentHidden,
                        CommunityModerationAudit.MomentEntity,
                        moment.Id,
                        previous,
                        new
                        {
                            hidden = true,
                            hiddenAt = moment.ModeratedAt,
                            alreadyHidden = wasHidden,
                            reportId = report.Id,
                            resolvedReportIds = resolvedIds,
                            note
                        });
                    break;
                }

                case ModerationAction.RestrictHousehold:
                {
                    var profile = await RequireProfileAsync(report.ReportedUserId, cancellationToken);
                    var wasRestricted = CommunityModeration.IsRestricted(profile);
                    var previous = new
                    {
                        restricted = wasRestricted,
                        restrictedAt = profile.CommunityRestrictedAt,
                        communityEnabled = profile.IsSocialEnabled
                    };
                    CommunityModeration.RestrictHousehold(profile, moderatorId, now);
                    outcome = wasRestricted ? AlreadyInEffect : Applied;
                    if (!wasRestricted)
                    {
                        // From a report, a restriction lasts until it is lifted,
                        // as it always has. A timed one is set from the household.
                        await RecordAndNotifyAsync(
                            profile.UserId,
                            CommunityModerationActionType.CommunityRestricted,
                            report,
                            chosenReason,
                            note,
                            moderatorId,
                            now,
                            cancellationToken: cancellationToken);
                    }

                    // The decision on this report was to restrict the household
                    // responsible for it — for a Comment or Moment report, its
                    // author — so HouseholdRestricted is what these reports
                    // record. Only this target's reports are decided.
                    Resolve(decided, CommunityReportResolution.HouseholdRestricted, moderatorId, note, now);
                    _auditLogService.Append(
                        moderatorId,
                        ActorType.Admin,
                        CommunityModerationAudit.HouseholdRestricted,
                        CommunityModerationAudit.HouseholdEntity,
                        profile.Id,
                        previous,
                        new
                        {
                            restricted = true,
                            restrictedAt = profile.CommunityRestrictedAt,
                            communityEnabled = profile.IsSocialEnabled,
                            ownerChoiceKept = profile.CommunityEnabledBeforeRestriction,
                            alreadyRestricted = wasRestricted,
                            ownerId = profile.UserId,
                            reportTargetType = report.TargetType.ToString(),
                            reportId = report.Id,
                            resolvedReportIds = resolvedIds,
                            note
                        });
                    break;
                }

                default:
                    throw new InvalidOperationException($"Unhandled moderation action {action}.");
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
            return new AdminCommunityModerationResultResponse(report.Id, outcome, decided.Length);
        }, cancellationToken);
    }

    private static void Resolve(
        IEnumerable<CommunityReport> reports,
        CommunityReportResolution resolution,
        Guid moderatorId,
        string note,
        DateTimeOffset now)
    {
        foreach (var report in reports)
        {
            report.Status = CommunityReportStatus.Resolved;
            report.Resolution = resolution;
            report.ReviewedAt = now;
            report.ReviewedByUserId = moderatorId;
            report.ReviewNote = note;
        }
    }

    /// <summary>
    /// Records a decision that changed something in the affected household's
    /// moderation history, with the reason the moderator chose — or, without
    /// one, the report's category in moderation terms — and stages their
    /// notice. A decision that changed nothing records nothing.
    /// </summary>
    private async Task RecordAndNotifyAsync(
        Guid targetUserId,
        CommunityModerationActionType type,
        CommunityReport report,
        CommunityModerationReason? chosenReason,
        string note,
        Guid moderatorId,
        DateTimeOffset now,
        Guid? momentId = null,
        Guid? commentId = null,
        string? snapshot = null,
        CancellationToken cancellationToken = default)
    {
        var action = CommunityModerationHistory.Record(
            _dbContext,
            targetUserId,
            type,
            chosenReason ?? CommunityModerationReasons.FromReport(report.Reason),
            note,
            moderatorId,
            now,
            momentId: momentId,
            commentId: commentId,
            reportId: report.Id,
            contentSnapshot: snapshot);
        await _notifications.StageModerationNotice(action, cancellationToken);
    }

    // ---- loading and locking --------------------------------------------------------

    /// <summary>A report's target. These fields never change after submission.</summary>
    private sealed record ReportTarget(
        Guid Id,
        CommunityReportTargetType TargetType,
        Guid? CommentId,
        Guid? MomentId,
        Guid ReportedUserId);

    private async Task<ReportTarget> LoadTargetAsync(
        Guid reportId,
        Guid moderatorId,
        CancellationToken cancellationToken)
    {
        var target = await _dbContext.CommunityReports
            .AsNoTracking()
            .Where(item => item.Id == reportId)
            .Select(item => new
            {
                Target = new ReportTarget(item.Id, item.TargetType, item.CommentId, item.MomentId, item.ReportedUserId),
                item.ReporterUserId
            })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw AdminCommunityReportQueryService.ReportNotFound();

        if (target.ReporterUserId == moderatorId || target.Target.ReportedUserId == moderatorId)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "moderation_conflict_of_interest",
                "Another moderator needs to decide this report because it involves your own household.");
        }

        return target.Target;
    }

    private async Task<OwnerSocialProfile> RequireProfileAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await _dbContext.OwnerSocialProfiles
                .SingleOrDefaultAsync(profile => profile.UserId == userId, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status409Conflict,
                "household_unavailable",
                "This household no longer has a Community Profile.");
    }

    private const string ConflictMessage =
        "This report or its content changed while you were reviewing it. Refresh and try again.";

    private Task<T> InTransactionAsync<T>(
        IReadOnlyList<string> lockResources,
        Func<Task<T>> work,
        CancellationToken cancellationToken) =>
        CommunityModerationTransaction.RunAsync(_dbContext, lockResources, work, ConflictMessage, cancellationToken);

    private Task<T> InTransactionAsync<T>(
        IReadOnlyList<string> lockResources,
        Func<IDbContextTransaction?, Task<T>> work,
        CancellationToken cancellationToken) =>
        CommunityModerationTransaction.RunAsync(_dbContext, lockResources, work, ConflictMessage, cancellationToken);

    // Lock order is always target first, then household, so two actions can
    // never wait on each other in opposite orders.
    private static string TargetLock(ReportTarget target) => target.TargetType switch
    {
        CommunityReportTargetType.Comment => CommunityModerationTransaction.CommentLock(target.CommentId!.Value),
        CommunityReportTargetType.Moment => MomentLock(target.MomentId!.Value),
        _ => HouseholdLock(target.ReportedUserId)
    };

    private static string MomentLock(Guid momentId) => CommunityModerationTransaction.MomentLock(momentId);

    private static string HouseholdLock(Guid userId) => CommunityModerationTransaction.HouseholdLock(userId);

    // ---- validation -----------------------------------------------------------------

    private static Guid RequireModerator(Guid? currentUserId) =>
        currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");

    /// <summary>
    /// The report's row version from the detail the moderator decided on. An
    /// empty value is accepted as a value — on SQL Server it can never match a
    /// real row version, so it fails as a conflict, never as a success.
    /// </summary>
    private static byte[] RequireRowVersion(string? rowVersion)
    {
        if (rowVersion is null)
        {
            throw ValidationFailed("rowVersion", "Refresh the report before deciding it.");
        }

        try
        {
            return Convert.FromBase64String(rowVersion);
        }
        catch (FormatException)
        {
            throw ValidationFailed("rowVersion", "Refresh the report before deciding it.");
        }
    }

    private static void RequireTargetType(ReportTarget target, CommunityReportTargetType expected)
    {
        if (target.TargetType != expected)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "moderation_action_not_applicable",
                expected switch
                {
                    CommunityReportTargetType.Comment => "Only a Comment report can remove a Comment.",
                    CommunityReportTargetType.Moment => "Only a Moment report can hide or unhide a Moment.",
                    _ => "This action doesn't apply to this report."
                });
        }
    }

    private static ApiException AlreadyResolved() => new(
        StatusCodes.Status409Conflict,
        "community_report_already_resolved",
        "This report has already been decided. Refresh to see the decision.");

    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
