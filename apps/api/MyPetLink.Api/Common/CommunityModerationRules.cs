using Microsoft.AspNetCore.Http;
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
/// The only ways Community moderation state changes.
///
/// Each is a pure change to the entity, staged on the caller's unit of work:
/// the Admin moderation actions call these, together with an audit row, inside
/// one save. Every one is Community-only — none touches the account's status,
/// sign-in, pets, Share or Safety Profiles, Smart Tags, Lost Mode or orders.
/// </summary>
public static class CommunityModeration
{
    /// <summary>Calm, non-sensitive wording for a restricted household.</summary>
    public const string RestrictedMessage = "Your Community access is paused. Contact support.";

    public static bool IsRestricted(OwnerSocialProfile profile) => profile.CommunityRestrictedAt.HasValue;

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
    /// Pauses a household's Community participation.
    ///
    /// Community is forced off — every Community visibility rule already
    /// requires it on, so the household's profile, Moments, Comments, mentions
    /// and collaborator attribution disappear everywhere at once — and the
    /// owner's own choice is kept, so <see cref="LiftRestriction"/> can put back
    /// exactly what they had. Restricting twice changes nothing and never
    /// overwrites the kept choice.
    /// </summary>
    public static void RestrictHousehold(OwnerSocialProfile profile, Guid moderatorUserId, DateTimeOffset now)
    {
        if (profile.CommunityRestrictedAt.HasValue)
        {
            return;
        }

        profile.CommunityEnabledBeforeRestriction = profile.IsSocialEnabled;
        profile.IsSocialEnabled = false;
        profile.CommunityRestrictedAt = now;
        profile.CommunityRestrictedByUserId = moderatorUserId;
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

    public const string ReportEntity = "CommunityReport";
    public const string CommentEntity = "MomentComment";
    public const string MomentEntity = "PetMemory";
    public const string HouseholdEntity = "OwnerSocialProfile";
}
