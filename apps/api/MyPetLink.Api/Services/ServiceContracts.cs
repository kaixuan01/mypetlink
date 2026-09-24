using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ICurrentUserService
{
    CurrentUser Current { get; }
}

/// <summary>
/// The owner's PUBLIC social identity. Every method resolves the subject from
/// the authenticated session; none accepts a user id from a caller.
/// </summary>
public interface IOwnerSocialProfileService : ISkeletonService
{
    Task<OwnerSocialProfileResponse> GetAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default);

    Task<OwnerSocialProfileResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateOwnerSocialProfileRequest request,
        CancellationToken cancellationToken = default);

    Task<OwnerSocialProfileResponse> ClaimHandleAsync(
        Guid? currentUserId,
        ClaimOwnerHandleRequest request,
        CancellationToken cancellationToken = default);

    Task<OwnerHandleAvailabilityResponse> CheckHandleAvailabilityAsync(
        Guid? currentUserId,
        string handle,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// The owner's per-pet Social consent — the only production write path to
/// <see cref="MyPetLink.Api.Entities.PetSocialProfile"/>.
/// </summary>
public interface IPetSocialSettingsService : ISkeletonService
{
    Task<PetSocialSettingsListResponse> ListAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default);

    Task<PetSocialSettingsResponse> UpdateAsync(
        Guid? currentUserId,
        Guid petId,
        UpdatePetSocialSettingsRequest request,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// The anonymous social read surface: owner profiles and paginated Moment
/// listings. Every method gates on the owner's AND the pet's social switches.
/// </summary>
public interface IPublicSocialProfileService : ISkeletonService
{
    Task<PublicOwnerProfileResponse> GetOwnerProfileAsync(
        string handle,
        CancellationToken cancellationToken = default);

    Task<OwnerHandleResolutionResponse> ResolveHandleAsync(
        string handle,
        CancellationToken cancellationToken = default);

    /// <param name="viewerId">
    /// The caller, when there is one. Used only to report which Moments they
    /// have already liked; it widens nothing and hides nothing.
    /// </param>
    Task<PublicMomentPageResponse> GetOwnerMomentsAsync(
        string handle,
        string? cursor,
        int? pageSize,
        Guid? viewerId = null,
        CancellationToken cancellationToken = default);

    Task<PublicMomentPageResponse> GetPetMomentsAsync(
        string publicSlug,
        string? cursor,
        int? pageSize,
        Guid? viewerId = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// One Moment on its own page. Unavailable for every reason a listing would
    /// have left it out, and unavailable in the same way.
    /// </summary>
    Task<PublicMomentListItemResponse> GetMomentAsync(
        Guid momentId,
        Guid? viewerId = null,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Following and blocking between accounts. The actor is always the JWT
/// subject; a handle names a target, never a grant.
/// </summary>
public interface ISocialGraphService : ISkeletonService
{
    Task<OwnerRelationshipResponse> FollowAsync(
        Guid? currentUserId, string handle, CancellationToken cancellationToken = default);

    Task<OwnerRelationshipResponse> UnfollowAsync(
        Guid? currentUserId, string handle, CancellationToken cancellationToken = default);

    Task<OwnerRelationshipResponse> BlockAsync(
        Guid? currentUserId, string handle, string? reason, CancellationToken cancellationToken = default);

    Task<OwnerRelationshipResponse> UnblockAsync(
        Guid? currentUserId, string handle, CancellationToken cancellationToken = default);

    Task<OwnerRelationshipResponse> GetRelationshipAsync(
        Guid? currentUserId, string handle, CancellationToken cancellationToken = default);

    Task<SocialAccountPageResponse> GetFollowersAsync(
        Guid? currentUserId, string handle, string? cursor, int? pageSize,
        CancellationToken cancellationToken = default);

    Task<SocialAccountPageResponse> GetFollowingAsync(
        Guid? currentUserId, string handle, string? cursor, int? pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>The caller's own blocks. Never readable in the other direction.</summary>
    Task<SocialAccountPageResponse> GetBlockedAccountsAsync(
        Guid? currentUserId, string? cursor, int? pageSize,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Likes on Moments. The actor is always the JWT subject; the route names the
/// Moment, never the person doing the liking.
/// </summary>
public interface IMomentLikeService : ISkeletonService
{
    Task<MomentLikeResponse> LikeAsync(
        Guid? currentUserId, Guid momentId, CancellationToken cancellationToken = default);

    Task<MomentLikeResponse> UnlikeAsync(
        Guid? currentUserId, Guid momentId, CancellationToken cancellationToken = default);

    Task<MomentLikeResponse> GetAsync(
        Guid? currentUserId, Guid momentId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Plain-text Comments on public Moments. The actor is always the JWT subject.
/// </summary>
public interface IMomentCommentService : ISkeletonService
{
    /// <param name="anchorId">
    /// A linked Comment to include in the first page when it is visible and
    /// recent enough. Ignored with a cursor; never changes what is visible.
    /// </param>
    Task<MomentCommentPageResponse> GetAsync(
        Guid momentId, Guid? viewerId, string? cursor, int? pageSize,
        CancellationToken cancellationToken = default,
        Guid? anchorId = null);

    Task<CreateMomentCommentResponse> CreateAsync(
        Guid? currentUserId, Guid momentId, CreateMomentCommentRequest? request,
        CancellationToken cancellationToken = default);

    Task<DeleteMomentCommentResponse> DeleteAsync(
        Guid? currentUserId, Guid momentId, Guid commentId,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// The chronological home feed: Moments from households the caller follows,
/// plus their own. Authenticated only — there is no feed without a graph.
/// </summary>
public interface ISocialFeedService : ISkeletonService
{
    Task<SocialFeedPageResponse> GetFeedAsync(
        Guid? currentUserId, string? cursor, int? pageSize,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Explore and search. Everything here adds discoverability on top of the
/// shared social visibility rules; nothing here may override it.
/// </summary>
public interface ISocialDiscoveryService : ISkeletonService
{
    Task<SocialPetPageResponse> GetSuggestedPetsAsync(
        Guid? viewerId, string? species, int? limit,
        CancellationToken cancellationToken = default);

    Task<PublicMomentPageResponse> GetLatestMomentsAsync(
        Guid? viewerId, string? species, string? cursor, int? pageSize,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<SocialSpeciesOptionResponse>> GetSpeciesAsync(
        Guid? viewerId, CancellationToken cancellationToken = default);

    Task<SocialSearchResponse> SearchAsync(
        Guid? viewerId, string? query, string? type, string? species, int? limit,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// In-app activity. The recipient is always the JWT subject; no route accepts a
/// recipient id, and nothing here sends email.
/// </summary>
public interface IOwnerNotificationService : ISkeletonService
{
    Task<OwnerNotificationPageResponse> GetAsync(
        Guid? currentUserId, string? cursor, int? pageSize,
        CancellationToken cancellationToken = default);

    Task<OwnerNotificationSummaryResponse> GetUnreadSummaryAsync(
        Guid? currentUserId, CancellationToken cancellationToken = default);

    Task<OwnerNotificationSummaryResponse> MarkReadAsync(
        Guid? currentUserId, MarkNotificationsReadRequest? request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Staged onto the caller's unit of work, never saved here: the follow and
    /// its notification commit in one SaveChanges or not at all.
    /// </summary>
    Task StageFollowNotification(
        Guid actorId, Guid recipientId, CancellationToken cancellationToken = default);

    Task StageFollowNotificationWithdrawal(
        Guid actorId, Guid recipientId, CancellationToken cancellationToken = default);

    Task StageLikeNotification(
        Guid actorId, Guid recipientId, Guid momentId, Guid? subjectPetId,
        CancellationToken cancellationToken = default);

    Task StageLikeNotificationWithdrawal(
        Guid actorId, Guid momentId, CancellationToken cancellationToken = default);

    Task StageCommentNotification(
        Guid actorId, Guid recipientId, Guid momentId, Guid subjectPetId,
        Guid commentId, CancellationToken cancellationToken = default);

    Task StageCommentNotificationWithdrawal(
        Guid actorId, Guid momentId, Guid commentId,
        CancellationToken cancellationToken = default);

    Task StageCollaborationRequested(
        Guid collaborationId, Guid authorId, Guid inviteeId, Guid momentId,
        Guid firstRequestedPetId, CancellationToken cancellationToken = default);

    Task StageCollaborationAccepted(
        Guid collaborationId, Guid inviteeId, Guid authorId, Guid momentId,
        Guid firstAcceptedPetId, CancellationToken cancellationToken = default);

    Task StageCollaborationWithdrawal(
        Guid collaborationId, IReadOnlyCollection<OwnerNotificationType> types,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Consent-based Moment collaboration. The actor is always the JWT subject; the
/// Moment stays its author's, and a collaborator controls only their own
/// household's participation.
/// </summary>
public interface IMomentCollaborationService : ISkeletonService
{
    Task<CollaborationCandidatesResponse> GetCandidatesAsync(
        Guid? currentUserId, string? query, Guid? momentId,
        CancellationToken cancellationToken = default);

    Task<MomentCollaborationListResponse> GetForMomentAsync(
        Guid? currentUserId, Guid momentId, CancellationToken cancellationToken = default);

    Task<MomentCollaborationListResponse> InviteAsync(
        Guid? currentUserId, Guid momentId, CreateMomentCollaborationRequest? request,
        CancellationToken cancellationToken = default);

    Task<MomentCollaborationListResponse> RevokeAsync(
        Guid? currentUserId, Guid momentId, Guid collaborationId,
        CancellationToken cancellationToken = default);

    Task<IncomingMomentCollaborationsResponse> GetIncomingAsync(
        Guid? currentUserId, CancellationToken cancellationToken = default);

    Task<MomentCollaborationListResponse> AcceptAsync(
        Guid? currentUserId, Guid collaborationId, AcceptMomentCollaborationRequest? request,
        CancellationToken cancellationToken = default);

    Task<MomentCollaborationListResponse> DeclineAsync(
        Guid? currentUserId, Guid collaborationId, CancellationToken cancellationToken = default);

    Task<MomentCollaborationListResponse> LeaveAsync(
        Guid? currentUserId, Guid collaborationId, CancellationToken cancellationToken = default);
}

/// <summary>Handle claiming, renaming, reservations and the release hold.</summary>
public interface IOwnerHandleService : ISkeletonService
{
    Task<bool> IsClaimableAsync(
        string normalizedHandle,
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<DateTimeOffset?> GetChangeAvailableAtAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task ClaimAsync(
        OwnerSocialProfile profile,
        string requestedHandle,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Administrator-only. Gives a reserved handle to a social profile — the
    /// only path by which a protected name such as the official MyPetLink
    /// account can ever be held. Authorization is enforced at the controller.
    /// </summary>
    /// <summary>The owner's current handle and whether it is protected.</summary>
    Task<AdminOwnerSocialHandleResponse> GetOwnerHandleAsync(
        Guid targetUserId,
        CancellationToken cancellationToken = default);

    Task<OwnerSocialProfile> AssignReservedHandleAsync(
        Guid adminUserId,
        Guid targetUserId,
        string requestedHandle,
        bool confirmReassign,
        CancellationToken cancellationToken = default);
}

public interface ISkeletonService
{
    Task<PlaceholderResponse> NotImplementedAsync(string operation, CancellationToken cancellationToken = default);
}

public interface IAuthService : ISkeletonService
{
    Task<AuthTokenResponse> SignInWithGoogleAsync(
        GoogleLoginRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    Task<AuthTokenResponse> SignInWithDevelopmentAdminAsync(
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    Task<TokenRefreshResponse> RefreshAsync(
        RefreshTokenRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    Task LogoutAsync(
        LogoutRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default);

    Task<CurrentSessionResponse> GetCurrentSessionAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default);

    Task<AdminAuthCheckResponse> GetAdminAuthCheckAsync(
        Guid? currentUserId,
        AdminAccessSummaryResponse access,
        CancellationToken cancellationToken = default);
}

public interface IOwnerProfileService : ISkeletonService
{
    Task<OwnerProfileResponse> GetAsync(Guid? currentUserId, CancellationToken cancellationToken = default);

    Task<OwnerProfileResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateOwnerProfileRequest request,
        CancellationToken cancellationToken = default);
}

public interface IPetService : ISkeletonService
{
    Task<(IReadOnlyCollection<PetListItemResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        string? lifecycleStatus,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> CreateAsync(
        Guid? currentUserId,
        CreatePetRequest request,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> GetAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> UpdateAsync(
        Guid? currentUserId,
        Guid petId,
        UpdatePetRequest request,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> MarkMemorialAsync(
        Guid? currentUserId,
        Guid petId,
        MarkPetMemorialRequest request,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> RestoreActiveAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> ArchiveAsync(
        Guid? currentUserId,
        Guid petId,
        CancellationToken cancellationToken = default);

    Task<PetDetailResponse> UpdateLostModeAsync(
        Guid? currentUserId,
        Guid petId,
        UpdateLostModeRequest request,
        CancellationToken cancellationToken = default);
}

public interface IPublicProfileService : ISkeletonService
{
    Task<PublicPetProfileResponse> GetByPublicSlugAsync(
        string publicSlug,
        CancellationToken cancellationToken = default);

    Task<PublicProfileSocialResponse> GetSocialByPublicSlugAsync(
        string publicSlug,
        CancellationToken cancellationToken = default);

    Task<PublicProfileCardOccasions> GetSocialCardOccasionsAsync(
        string publicSlug,
        CancellationToken cancellationToken = default);
}

public interface IPublicSampleExperienceService : ISkeletonService
{
    Task<PublicSampleExperienceResponse> GetAsync(
        CancellationToken cancellationToken = default);
}

public interface IAdminSampleExperienceService : ISkeletonService
{
    Task<AdminSampleExperienceResponse> GetAsync(
        CancellationToken cancellationToken = default);

    Task<AdminSampleExperienceResponse> UpdateAsync(
        Guid? currentUserId,
        UpdateSampleExperienceRequest request,
        CancellationToken cancellationToken = default);
}

public interface IPublicProfileSocialCardRenderer
{
    Task<byte[]> RenderAsync(
        PublicProfileSocialResponse profile,
        PublicProfileSocialCardVariant variant = PublicProfileSocialCardVariant.OpenGraph,
        int? occasionCount = null,
        string? occasionCacheIdentity = null,
        CancellationToken cancellationToken = default);
}

public interface IMemoryService : ISkeletonService
{
    Task<(IReadOnlyCollection<MemoryResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? visibility,
        bool includeArchived,
        CancellationToken cancellationToken = default);

    Task<MemoryResponse> CreateAsync(
        Guid? currentUserId,
        Guid petId,
        CreateMemoryRequest request,
        CancellationToken cancellationToken = default);

    Task<MemoryResponse> GetAsync(
        Guid? currentUserId,
        Guid memoryId,
        CancellationToken cancellationToken = default);

    Task<MemoryResponse> UpdateAsync(
        Guid? currentUserId,
        Guid memoryId,
        UpdateMemoryRequest request,
        CancellationToken cancellationToken = default);

    Task ArchiveAsync(
        Guid? currentUserId,
        Guid memoryId,
        CancellationToken cancellationToken = default);
}

public interface ICareRecordService : ISkeletonService
{
    Task<(IReadOnlyCollection<CareRecordResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? type,
        DateOnly? fromDate,
        DateOnly? toDate,
        bool includeArchived,
        CancellationToken cancellationToken = default);

    Task<CareRecordResponse> CreateAsync(
        Guid? currentUserId,
        Guid petId,
        CreateCareRecordRequest request,
        CancellationToken cancellationToken = default);

    Task<CareRecordResponse> GetAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default);

    Task<CareRecordResponse> UpdateAsync(
        Guid? currentUserId,
        Guid recordId,
        UpdateCareRecordRequest request,
        CancellationToken cancellationToken = default);

    Task ArchiveAsync(
        Guid? currentUserId,
        Guid recordId,
        CancellationToken cancellationToken = default);
}

public interface IMediaService : ISkeletonService
{
    Task<MediaUploadResponse> InitializeUploadAsync(
        Guid? currentUserId,
        InitializeMediaUploadRequest request,
        CancellationToken cancellationToken = default);

    Task<CompleteMediaUploadResponse> CompleteUploadAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default);

    Task<MediaDownloadUrlResponse> CreatePrivateDownloadUrlAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default);

    Task<MediaDownloadUrlResponse> CreateAdminPaymentProofDownloadUrlAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default);

    Task<int> DeleteStalePendingUploadsAsync(
        TimeSpan olderThan,
        CancellationToken cancellationToken = default);
}

public interface IQrSafetyService : ISkeletonService
{
    Task<PublicSafetyPageResponse> GetBySafetyCodeAsync(
        string safetyCode,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Link-preview projection for the Safety Profile. Read-only and contact-free.
    /// </summary>
    Task<PublicFinderSocialResponse> GetSocialBySafetyCodeAsync(
        string safetyCode,
        CancellationToken cancellationToken = default);
}

public interface ITagScanService : ISkeletonService
{
    Task<TagScanPageResponse> ResolveAsync(
        string tagCode,
        TagScanSource source,
        TagScanContext context,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Link-preview projection for a physical tag page. Read-only and contact-free,
    /// and deliberately does NOT record a scan: crawlers fetching a preview must
    /// never appear in an owner's scan history.
    /// </summary>
    Task<PublicFinderSocialResponse> GetSocialByTagCodeAsync(
        string tagCode,
        CancellationToken cancellationToken = default);

    Task SubmitLocationConsentAsync(
        string tagCode,
        SubmitScanLocationConsentRequest request,
        CancellationToken cancellationToken = default);
}

public interface ISmartTagService : ISkeletonService
{
    Task<(IReadOnlyCollection<SmartTagResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        Guid? petId,
        string? status,
        string? type,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<SmartTagResponse> Items, int Total)> ListForPetAsync(
        Guid? currentUserId,
        Guid petId,
        int page,
        int pageSize,
        string? status,
        string? type,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> GetAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagScanHistoryResponse> ListScansAsync(
        Guid? currentUserId,
        Guid tagId,
        string? source,
        int page = 1,
        int pageSize = 20,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> ActivateAsync(
        Guid? currentUserId,
        string tagCode,
        ActivateTagRequest request,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> MarkLostAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> DisableAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> ArchiveAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);

    Task<SmartTagResponse> RestoreAsync(
        Guid? currentUserId,
        Guid tagId,
        CancellationToken cancellationToken = default);
}

public interface IOrderService : ISkeletonService
{
    Task<(IReadOnlyCollection<TagOrderResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        int page,
        int pageSize,
        string? status,
        string? paymentStatus,
        Guid? petId,
        CancellationToken cancellationToken = default);

    Task<TagOrderResponse> GetAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default);

    Task<CreateTagOrderResponse> CreateAsync(
        Guid? currentUserId,
        CreateTagOrderRequest request,
        CancellationToken cancellationToken = default);

    Task<TagOrderResponse> SubmitPaymentProofAsync(
        Guid? currentUserId,
        string orderKey,
        UploadPaymentProofRequest request,
        CancellationToken cancellationToken = default);

    Task<TagOrderResponse> CancelAsync(
        Guid? currentUserId,
        string orderKey,
        CancellationToken cancellationToken = default);
}

public interface IDeliveryService : ISkeletonService
{
    IReadOnlyCollection<MalaysiaStateResponse> ListStates();
    Task<DeliveryQuoteResponse> QuoteAsync(DeliveryQuoteRequest request, CancellationToken cancellationToken = default);
    Task<DeliveryResolution> ResolveAsync(string? stateCode, DeliveryPricingSummary pricing, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AdminDeliveryRateResponse>> ListRatesAsync(CancellationToken cancellationToken = default);
    Task<AdminDeliveryRateResponse> CreateRateAsync(Guid? actorId, UpsertDeliveryRateRequest request, CancellationToken cancellationToken = default);
    Task<AdminDeliveryRateResponse> UpdateRateAsync(Guid? actorId, Guid id, UpsertDeliveryRateRequest request, CancellationToken cancellationToken = default);
    Task<AdminDeliveryZoneStateRatesResponse> ListStateRatesAsync(string zoneCode, CancellationToken cancellationToken = default);
    Task<AdminDeliveryZoneStateRatesResponse> SaveStateOverrideAsync(Guid? actorId, string zoneCode, UpsertDeliveryStateOverrideRequest request, CancellationToken cancellationToken = default);
    Task<AdminDeliveryZoneStateRatesResponse> RemoveStateOverrideAsync(Guid? actorId, string zoneCode, string stateCode, CancellationToken cancellationToken = default);
}

public sealed record DeliveryResolution(
    MalaysiaStateDefinition State,
    DeliveryRate Rate,
    DeliveryQuoteResponse Quote,
    // "ZoneDefault" or "StateOverride" — snapshotted onto the order so a
    // historical fee stays explainable after configuration changes.
    string RateSource);

public sealed record DeliveryPricingSummary(
    decimal MerchandiseSubtotal,
    decimal DiscountTotal,
    string Currency)
{
    public decimal DiscountedMerchandiseTotal => MerchandiseSubtotal - DiscountTotal;
}

public interface IPaymentProofService : ISkeletonService
{
    Task<PaymentProofResponse> GetAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default);
}
public interface IAdminService : ISkeletonService
{
    Task<AdminDashboardResponse> GetDashboardAsync(CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminTagOrderResponse> Items, int Total)> ListOrdersAsync(
        int page,
        int pageSize,
        string? status,
        string? paymentStatus,
        Guid? petId,
        Guid? ownerId,
        string? tagType,
        string? search,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> GetOrderAsync(Guid orderId, CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ConfirmPaymentAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<AdminEmailOutboxResponse> RetryPaymentConfirmationEmailAsync(
        Guid? currentUserId,
        Guid orderId,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerWelcomeEmailResponse> RetryOwnerWelcomeEmailAsync(
        Guid? currentUserId,
        Guid ownerUserId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> RejectPaymentProofAsync(
        Guid? currentUserId,
        Guid orderId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> AssignInventoryTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid tagId,
        Guid? orderItemId = null,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ChangeAssignedTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid newTagId,
        string? reason,
        Guid? currentTagId = null,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ReplaceTagAsync(
        Guid? currentUserId,
        Guid orderId,
        Guid newTagId,
        string? reason,
        string? note,
        Guid? currentTagId = null,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> MarkOrderPreparingAsync(
        Guid? currentUserId,
        Guid orderId,
        string? rowVersion,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> MarkOrderReadyToShipAsync(
        Guid? currentUserId,
        Guid orderId,
        string? rowVersion,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> UpdateShipmentDetailsAsync(
        Guid? currentUserId,
        Guid orderId,
        UpdateShipmentDetailsRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> MarkOrderShippedAsync(
        Guid? currentUserId,
        Guid orderId,
        MarkOrderShippedRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> MarkOrderDeliveredAsync(
        Guid? currentUserId,
        Guid orderId,
        string? rowVersion,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> CancelOrderAsync(
        Guid? currentUserId,
        Guid orderId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminPaymentProofResponse> Items, int Total)> ListPaymentProofsAsync(
        int page,
        int pageSize,
        string? status,
        string? orderStatus,
        Guid? ownerId,
        string? search,
        CancellationToken cancellationToken = default);

    Task<AdminPaymentProofResponse> GetPaymentProofAsync(
        Guid paymentProofId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> ApprovePaymentProofAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default);

    Task<AdminTagOrderResponse> RejectPaymentProofByIdAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminSmartTagResponse> Items, int Total)> ListTagsAsync(
        int page,
        int pageSize,
        string? status,
        string? type,
        Guid? petId,
        Guid? ownerId,
        Guid? orderId,
        string? batchNumber,
        string? search,
        bool inventoryOnly,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagResponse> GetTagAsync(Guid tagId, CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminOwnerListItemResponse> Items, int Total)> ListOwnersAsync(
        int page,
        int pageSize,
        string? search,
        string? plan,
        string? status,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerDetailResponse> GetOwnerAsync(Guid ownerUserId, CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminPetListItemResponse> Items, int Total)> ListPetsAsync(
        int page,
        int pageSize,
        string? lifecycleStatus,
        bool? lostMode,
        Guid? ownerId,
        string? search,
        CancellationToken cancellationToken = default);

    Task<AdminPetDetailResponse> GetPetAsync(Guid petId, CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminAuditLogResponse> Items, int Total)> ListAuditLogsAsync(
        int page,
        int pageSize,
        string? action,
        string? entity,
        Guid? entityId,
        Guid? actorId,
        DateTimeOffset? fromDate,
        DateTimeOffset? toDate,
        CancellationToken cancellationToken = default);
}

// Tag Inventory: server-side listing, generation, bulk fulfilment updates,
// and filtered CSV/Excel exports for the Admin Portal.
public interface IAdminTagInventoryService : ISkeletonService
{
    Task<(IReadOnlyCollection<AdminTagInventoryItemResponse> Items, int Total)> ListAsync(
        AdminTagInventoryQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminGenerateTagsResponse> GenerateAsync(
        Guid? currentUserId,
        AdminGenerateTagsRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryBulkActionResponse> BulkUpdateFulfilmentAsync(
        Guid? currentUserId,
        AdminTagInventoryBulkActionRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminTagInventoryQuery query,
        string? format,
        IReadOnlyCollection<Guid>? tagIds,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportManufacturerAsync(
        Guid? currentUserId,
        AdminTagInventoryQuery query,
        IReadOnlyCollection<Guid>? tagIds,
        CancellationToken cancellationToken = default);
}

// Read-only, privacy-conscious owner support query surface.
public interface IAdminOwnerQueryService : ISkeletonService
{
    Task<(IReadOnlyCollection<AdminOwnerSupportItemResponse> Items, int Total)> ListAsync(
        AdminOwnerQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerCountsResponse> CountAsync(
        AdminOwnerQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerDetailResponseV2> GetAsync(
        Guid? currentUserId,
        Guid ownerUserId,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminOwnerQuery query,
        string? format,
        IReadOnlyCollection<Guid>? ownerIds,
        CancellationToken cancellationToken = default);
}

// Read-only Plans surface: plan definitions (seeded configuration) and
// owner-plan usage rows. No plan mutations exist yet by design.
public interface IAdminPlanQueryService : ISkeletonService
{
    Task<IReadOnlyCollection<AdminPlanDefinitionResponse>> ListDefinitionsAsync(
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminOwnerPlanItemResponse> Items, int Total)> ListOwnersAsync(
        AdminOwnerPlanQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerPlanCountsResponse> CountAsync(
        AdminOwnerPlanQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerPlanDetailResponse> GetOwnerAsync(
        Guid? currentUserId,
        Guid ownerUserId,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminOwnerPlanQuery query,
        string? format,
        IReadOnlyCollection<Guid>? ownerIds,
        CancellationToken cancellationToken = default);
}

public interface IAdminSmartTagService : ISkeletonService
{
    Task<(IReadOnlyCollection<AdminSmartTagItemResponse> Items, int Total)> ListAsync(
        AdminSmartTagQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagStatusCountsResponse> CountByStatusAsync(
        AdminSmartTagQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagItemResponse> GetAsync(Guid tagId, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<AdminSmartTagScanResponse>> ListScansAsync(
        Guid? currentUserId, Guid tagId, string? source,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportScansAsync(
        Guid? currentUserId, Guid tagId, string? source, string? format,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagItemResponse> UpdateStatusAsync(
        Guid? currentUserId,
        Guid tagId,
        string action,
        string? reason,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagItemResponse> ClaimAsync(
        Guid? currentUserId, Guid tagId, AdminSmartTagClaimRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagItemResponse> AssignPetAsync(
        Guid? currentUserId, Guid tagId, AdminSmartTagAssignPetRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagItemResponse> UnassignPetAsync(
        Guid? currentUserId, Guid tagId, AdminSmartTagUnassignPetRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagItemResponse> TransferOwnershipAsync(
        Guid? currentUserId, Guid tagId, AdminSmartTagTransferRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminSmartTagBulkActionResponse> BulkUpdateAsync(
        Guid? currentUserId,
        AdminSmartTagBulkActionRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminSmartTagQuery query,
        string? format,
        IReadOnlyCollection<Guid>? tagIds,
        CancellationToken cancellationToken = default);
}

public interface IAdminOrderQueryService : ISkeletonService
{
    Task<(IReadOnlyCollection<AdminOrderListItemResponse> Items, int Total)> ListAsync(
        AdminOrderQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminOrderStatusCountsResponse> CountByStageAsync(
        AdminOrderQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminOrderQuery query,
        string? format,
        IReadOnlyCollection<Guid>? orderIds,
        CancellationToken cancellationToken = default);
}

public interface IAdminPaymentProofQueryService : ISkeletonService
{
    Task<(IReadOnlyCollection<AdminPaymentProofListItemResponse> Items, int Total)> ListAsync(
        AdminPaymentProofQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminPaymentProofCountsResponse> CountByStatusAsync(
        AdminPaymentProofQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminPaymentProofListItemResponse> GetAsync(
        Guid paymentProofId,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminPaymentProofQuery query,
        string? format,
        IReadOnlyCollection<Guid>? paymentProofIds,
        CancellationToken cancellationToken = default);
}

public interface IAdminPetProfileQueryService : ISkeletonService
{
    Task<AdminPetProfileItemResponse> UpdateSampleEligibilityAsync(
        Guid? currentUserId,
        Guid petId,
        UpdateSamplePetEligibilityRequest request,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyCollection<AdminPetProfileItemResponse> Items, int Total)> ListAsync(
        AdminPetProfileQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminPetProfileCountsResponse> CountByStatusAsync(
        AdminPetProfileQuery query,
        CancellationToken cancellationToken = default);

    Task<AdminPetProfileDetailResponse> GetAsync(
        Guid petId,
        CancellationToken cancellationToken = default);

    Task<AdminTagInventoryExport> ExportAsync(
        Guid? currentUserId,
        AdminPetProfileQuery query,
        string? format,
        IReadOnlyCollection<Guid>? petIds,
        CancellationToken cancellationToken = default);
}

public sealed record TagScanContext(
    string? IpAddress,
    string? UserAgent,
    string? Referer);

public interface IAuditLogService : ISkeletonService
{
    // Adds an audit row to the current DbContext without saving, so the caller
    // persists the audit entry and the mutation in one SaveChanges.
    void Append(
        Guid? actorId,
        Entities.ActorType actorType,
        string action,
        string entity,
        Guid? entityId,
        object? oldValue = null,
        object? newValue = null);
}
