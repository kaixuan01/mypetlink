using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Common;

/// <summary>
/// The plain-text contract for a report's optional details.
///
/// The same normalization as a Comment body — control, format and bidi
/// characters removed, emoji joiners kept — so there is one safe-text rule, not
/// two. Details are optional, except for <see cref="CommunityReportReason.Other"/>,
/// which says nothing on its own.
/// </summary>
public static class CommunityReportDetailsRules
{
    public const int MaxLength = 500;

    /// <summary>Normalized details, or null when nothing visible remains.</summary>
    public static string? Normalize(string? value)
    {
        var normalized = MomentCommentBodyRules.Normalize(value);
        return normalized.Length == 0 || !MomentCommentBodyRules.HasVisibleContent(normalized)
            ? null
            : normalized;
    }

    public static string? RequireValid(CommunityReportReason reason, string? details)
    {
        if (reason == CommunityReportReason.Unknown || !Enum.IsDefined(reason))
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "report_reason_required",
                "Choose a reason for your report.");
        }

        var normalized = Normalize(details);

        if (reason == CommunityReportReason.Other && normalized is null)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "report_details_required",
                "Tell us a little about what's wrong.");
        }

        if (normalized is not null && normalized.Length > MaxLength)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "report_details_too_long",
                $"Details can be up to {MaxLength} characters.");
        }

        return normalized;
    }
}

/// <summary>
/// A moderator's internal note: required for every moderation action, plain
/// text under the same safe-text rule as Comments, and never shown outside the
/// Admin Portal. Sized to <see cref="CommunityReport.ReviewNote"/>.
/// </summary>
public static class CommunityModerationNoteRules
{
    public const int MaxLength = 1000;

    public static string RequireValid(string? note)
    {
        var normalized = MomentCommentBodyRules.Normalize(note);
        if (normalized.Length == 0 || !MomentCommentBodyRules.HasVisibleContent(normalized))
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "moderation_note_required",
                "Add an internal note explaining this decision.");
        }

        if (normalized.Length > MaxLength)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "moderation_note_too_long",
                $"Internal notes can be up to {MaxLength} characters.");
        }

        return normalized;
    }
}

/// <summary>
/// What "the same target" means, in one place. A Comment report is about one
/// Comment, a Moment report about one Moment, and a Household report about one
/// household's Community Profile — so reports about that household's Comments
/// or Moments are never the same target as a report about the household.
/// </summary>
public static class CommunityReportTargets
{
    public static IQueryable<CommunityReport> SameTarget(
        this IQueryable<CommunityReport> reports,
        CommunityReportTargetType targetType,
        Guid? commentId,
        Guid? momentId,
        Guid reportedUserId)
    {
        return targetType switch
        {
            CommunityReportTargetType.Comment => reports.Where(report =>
                report.TargetType == CommunityReportTargetType.Comment && report.CommentId == commentId),
            CommunityReportTargetType.Moment => reports.Where(report =>
                report.TargetType == CommunityReportTargetType.Moment && report.MomentId == momentId),
            CommunityReportTargetType.Household => reports.Where(report =>
                report.TargetType == CommunityReportTargetType.Household && report.ReportedUserId == reportedUserId),
            _ => reports.Where(_ => false)
        };
    }

    public static IQueryable<CommunityReport> SameTarget(
        this IQueryable<CommunityReport> reports,
        CommunityReport report) =>
        reports.SameTarget(report.TargetType, report.CommentId, report.MomentId, report.ReportedUserId);
}

/// <summary>
/// The only ways Community moderation state changes.
///
/// Each is a pure change to the entity, staged on the caller's unit of work:
/// the Admin moderation actions call these, together with an audit row, inside
/// one save. Every one is Community-only — none touches the account's status,
/// sign-in, pets, Share or Safety Profiles, Smart Tags, Lost Mode or orders.
/// </summary>
public static class CommunityModeration
{
    /// <summary>Calm, non-sensitive wording for a restriction with no end date.</summary>
    public const string RestrictedMessage = "Your Community access has been suspended.";

    /// <summary>Calm, non-sensitive wording for a timed restriction. The client words the date.</summary>
    public const string TemporarilyRestrictedMessage = "Your Community access is temporarily restricted.";

    /// <summary>
    /// The error detail key carrying a timed restriction's end, as an ISO 8601
    /// UTC timestamp, so a client can say "until 15 Oct 2026" in its own locale.
    /// Absent for a restriction with no end date.
    /// </summary>
    public const string RestrictedUntilDetail = "restrictedUntil";

    public static bool IsRestricted(OwnerSocialProfile profile) => profile.CommunityRestrictedAt.HasValue;

    /// <summary>
    /// A timed restriction whose end has passed. It still stands until the
    /// expiry worker ends it — at most a minute later — so every check agrees
    /// with the Community switch it forced off.
    /// </summary>
    public static bool IsRestrictionDue(OwnerSocialProfile profile, DateTimeOffset now) =>
        profile.CommunityRestrictedAt.HasValue
        && profile.CommunityRestrictedUntil.HasValue
        && profile.CommunityRestrictedUntil.Value <= now;

    public static Task<bool> IsRestrictedAsync(
        MyPetLinkDbContext dbContext,
        Guid userId,
        CancellationToken cancellationToken) =>
        dbContext.OwnerSocialProfiles.AnyAsync(
            profile => profile.UserId == userId && profile.CommunityRestrictedAt != null,
            cancellationToken);

    /// <summary>
    /// The one check every Community write path asks: refuses starting
    /// Community participation — posting a Comment or Reply, following, liking,
    /// inviting or joining as a collaborator, turning Community on — while the
    /// household is restricted, with one consistent <c>403 community_restricted</c>.
    /// Taking something back — unfollowing, unliking, deleting your own
    /// Comment, declining or leaving a collaboration — is never refused.
    /// </summary>
    public static async Task RequireNotRestrictedAsync(
        MyPetLinkDbContext dbContext,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var restriction = await dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile => profile.UserId == userId && profile.CommunityRestrictedAt != null)
            .Select(profile => new { profile.CommunityRestrictedUntil })
            .SingleOrDefaultAsync(cancellationToken);

        if (restriction is not null)
        {
            throw Restricted(restriction.CommunityRestrictedUntil);
        }
    }

    /// <summary>
    /// The refusal for a restricted household. It says whether the restriction
    /// has an end and when — never why, who decided it, or any moderator note.
    /// </summary>
    public static ApiException Restricted(DateTimeOffset? restrictedUntil) =>
        restrictedUntil is { } until
            ? new ApiException(
                StatusCodes.Status403Forbidden,
                "community_restricted",
                TemporarilyRestrictedMessage,
                new Dictionary<string, string[]>
                {
                    [RestrictedUntilDetail] = [until.ToUniversalTime().ToString("O")]
                })
            : new ApiException(
                StatusCodes.Status403Forbidden,
                "community_restricted",
                RestrictedMessage);

    public static bool IsHidden(PetMemory moment) => moment.ModeratedAt.HasValue;

    /// <summary>Hides a Moment from every public surface. Hiding twice changes nothing.</summary>
    public static void HideMoment(PetMemory moment, Guid moderatorUserId, DateTimeOffset now)
    {
        if (moment.ModeratedAt.HasValue)
        {
            return;
        }

        moment.ModeratedAt = now;
        moment.ModeratedByUserId = moderatorUserId;
    }

    /// <summary>
    /// Returns a hidden Moment to wherever its owner's own settings would show
    /// it. Nothing else about the Moment changes.
    /// </summary>
    public static void UnhideMoment(PetMemory moment)
    {
        moment.ModeratedAt = null;
        moment.ModeratedByUserId = null;
    }

    /// <summary>
    /// Pauses a household's Community participation, until
    /// <paramref name="until"/> or, with none, until a moderator lifts it.
    ///
    /// Community is forced off — every Community visibility rule already
    /// requires it on, so the household's profile, Moments, Comments, mentions
    /// and collaborator attribution disappear everywhere at once — and the
    /// owner's own choice is kept, so <see cref="LiftRestriction"/> can put back
    /// exactly what they had. Restricting twice changes nothing and never
    /// overwrites the kept choice; changing a standing restriction's end is
    /// <see cref="ChangeRestrictionEnd"/>.
    /// </summary>
    public static void RestrictHousehold(
        OwnerSocialProfile profile,
        Guid moderatorUserId,
        DateTimeOffset now,
        DateTimeOffset? until = null)
    {
        if (profile.CommunityRestrictedAt.HasValue)
        {
            return;
        }

        profile.CommunityEnabledBeforeRestriction = profile.IsSocialEnabled;
        profile.IsSocialEnabled = false;
        profile.CommunityRestrictedAt = now;
        profile.CommunityRestrictedByUserId = moderatorUserId;
        profile.CommunityRestrictedUntil = until;
    }

    /// <summary>
    /// Gives a standing restriction a new end — longer, shorter, or none at all
    /// — without touching when it began or the owner's kept choice.
    /// </summary>
    public static void ChangeRestrictionEnd(OwnerSocialProfile profile, Guid moderatorUserId, DateTimeOffset? until)
    {
        if (!profile.CommunityRestrictedAt.HasValue)
        {
            throw new InvalidOperationException("Only a standing restriction has an end to change.");
        }

        profile.CommunityRestrictedByUserId = moderatorUserId;
        profile.CommunityRestrictedUntil = until;
    }

    /// <summary>
    /// Ends a restriction and restores the owner's own Community choice — on if
    /// they had it on, off if they had it off or turned it off meanwhile.
    /// </summary>
    public static void LiftRestriction(OwnerSocialProfile profile)
    {
        if (!profile.CommunityRestrictedAt.HasValue)
        {
            return;
        }

        profile.IsSocialEnabled = profile.CommunityEnabledBeforeRestriction ?? false;

        // Discoverability was kept untouched through the restriction; it only
        // means something while Community is on, as everywhere else.
        if (!profile.IsSocialEnabled)
        {
            profile.IsDiscoverable = false;
        }

        profile.CommunityRestrictedAt = null;
        profile.CommunityRestrictedByUserId = null;
        profile.CommunityEnabledBeforeRestriction = null;
        profile.CommunityRestrictedUntil = null;
    }
}

/// <summary>
/// The audit contract for Community moderation, written through the existing
/// <c>IAuditLogService</c> — there is no second moderation log.
///
/// Every moderator action appends one row, in the same save as the change:
/// <c>ActorId</c> the moderator, <c>ActorType</c> Admin, <c>Action</c> one of the
/// names below, <c>Entity</c>/<c>EntityId</c> the thing acted on, <c>OldValue</c>
/// the state before, and <c>NewValue</c> the state after together with the
/// report it resolved and the moderator's internal note. The note is visible
/// only in the Admin Portal's audit history, never to either household.
/// </summary>
public static class CommunityModerationAudit
{
    public const string ReportDismissed = "CommunityReportDismissed";
    public const string CommentRemoved = "CommunityCommentRemoved";
    public const string MomentHidden = "CommunityMomentHidden";
    public const string MomentUnhidden = "CommunityMomentUnhidden";
    public const string HouseholdRestricted = "CommunityHouseholdRestricted";
    public const string HouseholdRestrictionLifted = "CommunityHouseholdRestrictionLifted";
    public const string HouseholdRestrictionExpired = "CommunityHouseholdRestrictionExpired";
    public const string WarningIssued = "CommunityWarningIssued";
    public const string AccountSuspended = "AccountSuspended";
    public const string AccountReinstated = "AccountReinstated";

    public const string ReportEntity = "CommunityReport";
    public const string CommentEntity = "MomentComment";
    public const string MomentEntity = "PetMemory";
    public const string HouseholdEntity = "OwnerSocialProfile";
    public const string UserEntity = "User";
}

/// <summary>
/// The reasons a moderator can give. Parsed by exact name (case-insensitive);
/// anything else is refused rather than mapped to Other.
/// </summary>
public static class CommunityModerationReasons
{
    public static CommunityModerationReason Parse(string? value)
    {
        // An exact name only: Enum.TryParse would also take a number or a
        // comma-joined pair and quietly turn it into some other reason.
        var name = Enum.GetNames<CommunityModerationReason>()
            .FirstOrDefault(candidate => string.Equals(candidate, value?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (name is not null && name != nameof(CommunityModerationReason.Unknown))
        {
            return Enum.Parse<CommunityModerationReason>(name);
        }

        throw new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            new Dictionary<string, string[]> { ["reason"] = ["Choose a reason."] });
    }

    /// <summary>
    /// The reason a decision on a report is recorded with: the report's own
    /// reason, in the moderation vocabulary. Deciding a report agrees with it.
    /// </summary>
    public static CommunityModerationReason FromReport(CommunityReportReason reason) => reason switch
    {
        CommunityReportReason.SpamOrScam => CommunityModerationReason.SpamOrAdvertising,
        CommunityReportReason.HarassmentOrBullying => CommunityModerationReason.Harassment,
        CommunityReportReason.InappropriateContent => CommunityModerationReason.InappropriateContent,
        CommunityReportReason.AnimalWelfareConcern => CommunityModerationReason.AnimalWelfareConcern,
        CommunityReportReason.Impersonation => CommunityModerationReason.Impersonation,
        CommunityReportReason.PrivacyConcern => CommunityModerationReason.PrivacyOrPersonalInformation,
        _ => CommunityModerationReason.Other
    };
}

/// <summary>
/// How long a Community restriction lasts. A fixed set: a restriction always
/// has a known shape, and an open-ended one is chosen explicitly.
/// </summary>
public static class CommunityRestrictionDurations
{
    public const string Hours24 = "24h";
    public const string Days7 = "7d";
    public const string Days30 = "30d";
    public const string Permanent = "permanent";

    /// <summary>The restriction's end from <paramref name="now"/>, or null for one that lasts until lifted.</summary>
    public static DateTimeOffset? EndFrom(string? duration, DateTimeOffset now) =>
        duration?.Trim().ToLowerInvariant() switch
        {
            Hours24 => now.AddHours(24),
            Days7 => now.AddDays(7),
            Days30 => now.AddDays(30),
            Permanent => null,
            _ => throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]> { ["duration"] = ["Choose how long the restriction lasts."] })
        };
}

/// <summary>
/// A moderator's optional remark on a direct action: plain text under the
/// Comment safe-text rule, never shown outside the Admin Portal. Report
/// decisions keep their required note (<see cref="CommunityModerationNoteRules"/>).
/// </summary>
public static class CommunityModerationRemarkRules
{
    public const int MaxLength = CommunityModerationNoteRules.MaxLength;

    public static string? Normalize(string? remark)
    {
        var normalized = MomentCommentBodyRules.Normalize(remark);
        if (normalized.Length == 0 || !MomentCommentBodyRules.HasVisibleContent(normalized))
        {
            return null;
        }

        if (normalized.Length > MaxLength)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "moderation_remark_too_long",
                $"Internal remarks can be up to {MaxLength} characters.");
        }

        return normalized;
    }
}

/// <summary>What a removal took away, kept for moderators only.</summary>
public static class CommunityModerationSnapshot
{
    public const int MaxLength = 4000;

    public static string? ForComment(string body) => Clip(body);

    public static string? ForMoment(string title, string? caption) =>
        Clip(string.IsNullOrWhiteSpace(caption) ? title : $"{title}\n\n{caption}");

    private static string? Clip(string? value) =>
        string.IsNullOrEmpty(value) ? null : value.Length <= MaxLength ? value : value[..MaxLength];
}

/// <summary>
/// Appends to a household's moderation history. Staged on the caller's unit of
/// work, together with the change it records, the audit row and — for the
/// actions that tell the household — its notice.
/// </summary>
public static class CommunityModerationHistory
{
    /// <summary>
    /// The actions the household is told about: something of theirs was
    /// removed, they were warned, or their Community access was restricted.
    /// Reversals, expiry and account suspension send nothing — a suspended
    /// account cannot sign in to read it.
    /// </summary>
    public static bool NotifiesHousehold(CommunityModerationActionType type) => type is
        CommunityModerationActionType.MomentRemoved
        or CommunityModerationActionType.CommentRemoved
        or CommunityModerationActionType.ReplyRemoved
        or CommunityModerationActionType.WarningIssued
        or CommunityModerationActionType.CommunityRestricted;

    public static CommunityModerationAction Record(
        MyPetLinkDbContext dbContext,
        Guid targetUserId,
        CommunityModerationActionType type,
        CommunityModerationReason? reason,
        string? internalRemark,
        Guid? performedByUserId,
        DateTimeOffset now,
        DateTimeOffset? restrictedUntil = null,
        Guid? momentId = null,
        Guid? commentId = null,
        Guid? reportId = null,
        string? contentSnapshot = null)
    {
        var action = new CommunityModerationAction
        {
            TargetUserId = targetUserId,
            ActionType = type,
            Reason = reason,
            InternalRemark = internalRemark,
            PerformedByUserId = performedByUserId,
            CreatedAt = now,
            RestrictedUntil = restrictedUntil,
            MomentId = momentId,
            CommentId = commentId,
            CommunityReportId = reportId,
            ContentSnapshot = contentSnapshot
        };
        dbContext.CommunityModerationActions.Add(action);
        return action;
    }
}
