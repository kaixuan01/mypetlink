namespace MyPetLink.Api.Entities;

public enum UserStatus
{
    Active,
    Invited,
    Suspended,
    Deleted
}

public enum AdminRole
{
    OwnerSupport,
    Operations,
    Admin,
    SuperAdmin
}

public enum PlanStatus
{
    Available,
    ComingSoon,
    Disabled
}

public enum PetLifecycleStatus
{
    Active,
    Memorial,
    Archived
}

public enum OrderStatus
{
    PendingPayment,
    PaymentProofSubmitted,
    PaymentConfirmed,
    PreparingTag,
    ReadyToShip,
    Shipped,
    Delivered,
    Cancelled
}

public enum PaymentStatus
{
    Pending,
    ProofSubmitted,
    Confirmed,
    Rejected,
    Refunded
}

public enum PaymentProofStatus
{
    PendingReview,
    Approved,
    Rejected,
    Superseded
}

public enum EmailMessageType
{
    PaymentConfirmed,
    OwnerWelcome,
    OrderShipped,

    // Merchant Sales. Stored as strings, so appending values cannot disturb
    // rows already written.
    MerchantQuotation,
    MerchantInvoice,
    MerchantPaymentConfirmation
}

public enum EmailOutboxStatus
{
    Pending,
    Sending,
    Sent,
    Failed,
    // Recorded for audit but never dispatchable. Used when the business event
    // happened while its email template was switched off.
    Suppressed
}

public enum SmartTagStatus
{
    Unclaimed,
    Pending,
    Preparing,
    Delivered,
    Active,
    Lost,
    Disabled,
    Replaced,
    Archived
}

public enum TagType
{
    QrPetTag,
    QrNfcSmartTag
}

public enum PromotionDiscountType
{
    FixedAmount,
    Percentage
}

// Physical inventory/fulfilment state of a tag. This is deliberately separate
// from SmartTagStatus: a tag can be Unclaimed (lifecycle) while already
// SentToReseller (fulfilment), and fulfilment actions never change lifecycle.
public enum TagFulfilmentStatus
{
    Generated,
    Printed,
    SentToReseller,
    Received,
    SentToOwner
}

public enum MemoryVisibility
{
    Public,
    Private,
    FamilyOnly
}

public enum CareRecordType
{
    Vaccine,
    Deworming,
    Grooming,
    VetVisit,
    Medication,
    Allergy,
    Surgery,
    LabTest,
    Other
}

public enum CareRecordPublicVisibility
{
    Private,
    PublicBadgeOnly,
    PublicDetails
}

public enum ActorType
{
    Admin,
    Owner,
    System
}

public enum AdminActionType
{
    ConfirmPayment,
    RejectPaymentProof,
    UpdateOrderStatus,
    GenerateTagCodes,
    UpdateTagStatus,
    ArchiveTag,
    RestoreTag,
    MarkPetMemorial,
    ArchivePet,
    UpdateSettings
}

public enum MediaOwnerType
{
    Pet,
    PetMemory,
    CareRecord,
    TagOrder,
    PaymentProof,
    Invoice,
    OwnerProfile,
    AppSetting,
    Other
}

public enum MediaFileType
{
    Image,
    Video,
    Document
}

public enum MediaUploadCategory
{
    Other,
    PetProfilePhoto,
    PetCoverPhoto,
    MomentImage,
    MomentVideo,
    VaccinationDocument,
    MedicalDocument,
    OrderReceipt,
    TagProductImage
}

public enum MediaUploadStatus
{
    Pending,
    Ready,
    Failed,
    Deleted
}

public enum TagScanResolvedState
{
    Active,
    Unclaimed,
    Pending,
    Inactive,
    NotFound,
    Unknown
}

public enum TagScanSource
{
    Unknown,
    Qr,
    Nfc,
    Legacy
}

/// <summary>
/// Merchant payment terms. The MVP sells prepaid only; the enum exists so a
/// future terms feature is an addition rather than a schema rewrite.
/// </summary>
public enum MerchantPaymentTerm
{
    /// <summary>Paid in full before fulfilment. Documents word this "Due on receipt".</summary>
    Prepaid
}

public enum MerchantQuotationStatus
{
    Draft,
    Sent,
    Accepted,
    Rejected,
    Expired,
    Converted,
    Cancelled
}

public enum MerchantOrderPaymentStatus
{
    AwaitingPayment,
    PaymentConfirmed,
    Cancelled
}

/// <summary>
/// An invoice is paid in full or not at all in this phase, so there is no
/// Partial value to reconcile against.
/// </summary>
public enum MerchantInvoiceStatus
{
    Draft,
    Issued,
    Paid,
    Cancelled
}

/// <summary>
/// How a merchant paid. Every value is recorded by an administrator from a
/// bank or wallet statement; MyPetLink takes no payment itself.
/// </summary>
public enum MerchantPaymentMethod
{
    BankTransfer,
    DuitNow,
    Cheque,
    Cash,
    Other
}

/// <summary>
/// A commission only exists once payment is confirmed, so there is no pending
/// state before it.
/// </summary>
public enum SalesCommissionStatus
{
    Payable,
    Paid,
    Reversed
}

/// <summary>
/// Fulfilment is a later phase; an order starts outside it. Values beyond
/// NotStarted are introduced with the allocation and shipping work.
/// </summary>
public enum MerchantOrderFulfilmentStatus
{
    NotStarted
}
