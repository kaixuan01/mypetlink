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

public enum TagScanResolvedState
{
    Active,
    Unclaimed,
    Pending,
    Inactive,
    NotFound
}
