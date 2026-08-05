using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

// Admin-only. Nothing here is ever returned to a merchant or an owner, so it
// may carry internal notes and commission figures — but the document builders
// must still not print them.

public sealed record IssueMerchantInvoiceRequest(
    string? ConcurrencyToken = null,
    string? InternalNotes = null);

public sealed record MerchantInvoiceItemResponse(
    Guid Id,
    string ProductName,
    string SkuCode,
    string OptionName,
    bool SupportsQr,
    bool SupportsNfc,
    int Quantity,
    decimal WholesaleUnitPrice,
    decimal GrossLineAmount,
    decimal LineDiscount,
    decimal LineSubtotal,
    int SortOrder);

public sealed record MerchantInvoiceResponse(
    Guid Id,
    string InvoiceNumber,
    Guid MerchantOrderId,
    string MerchantOrderNumber,
    string? SourceQuotationNumber,
    Guid MerchantId,
    string MerchantCode,
    string MerchantLegalName,
    string? MerchantTradingName,
    string ContactPerson,
    string ContactEmail,
    DateTimeOffset InvoiceDate,
    DateTimeOffset DueDate,
    string PaymentTerm,
    string Currency,
    decimal MerchandiseSubtotal,
    decimal DiscountTotal,
    decimal DeliveryFee,
    decimal GrandTotal,
    string Status,
    DateTimeOffset? IssuedAt,
    DateTimeOffset? PaidAt,
    DateTimeOffset? CancelledAt,
    string? InternalNotes,
    IReadOnlyList<MerchantInvoiceItemResponse> Items,
    MerchantPaymentResponse? Payment,
    MerchantReceiptSummaryResponse? Receipt,
    string ConcurrencyToken);

public sealed record RecordMerchantPaymentRequest(
    DateTimeOffset PaymentDate,
    decimal AmountReceived,
    string Method,
    string? TransactionReference = null,
    string? InternalNote = null,
    Guid? PaymentProofMediaFileId = null,
    string? ConcurrencyToken = null,
    string? IdempotencyKey = null);

public sealed record MerchantPaymentResponse(
    Guid Id,
    Guid MerchantInvoiceId,
    Guid MerchantOrderId,
    DateTimeOffset PaymentDate,
    decimal AmountReceived,
    string Currency,
    string Method,
    string? TransactionReference,
    string? InternalNote,
    Guid? PaymentProofMediaFileId,
    string? RecordedBy,
    DateTimeOffset RecordedAt);

public sealed record MerchantReceiptSummaryResponse(
    Guid Id,
    string ReceiptNumber,
    DateTimeOffset PaymentDate,
    string PaymentMethod,
    string? TransactionReference,
    decimal AmountPaid,
    string Currency,
    DateTimeOffset IssuedAt);

/// <summary>
/// Internal only. Never rendered into a merchant document or email.
/// </summary>
public sealed record SalesCommissionResponse(
    Guid Id,
    Guid MerchantOrderId,
    string MerchantOrderNumber,
    Guid SalespersonId,
    string SalespersonCode,
    string SalespersonName,
    decimal CommissionPercentage,
    decimal CommissionBaseAmount,
    decimal CommissionAmount,
    string Currency,
    string Status,
    DateTimeOffset CalculatedAt,
    DateTimeOffset? PaidAt,
    DateTimeOffset? ReversedAt,
    string? InternalNote,
    string ConcurrencyToken);

/// <summary>
/// What recording a payment produced. Returned as one result so the Admin UI
/// does not have to re-query three endpoints to show the outcome.
/// </summary>
public sealed record RecordMerchantPaymentResult(
    MerchantInvoiceResponse Invoice,
    MerchantPaymentResponse Payment,
    MerchantReceiptSummaryResponse Receipt,
    SalesCommissionResponse? Commission,
    bool AlreadyRecorded);

public static class MerchantBillingParsing
{
    public static MerchantPaymentMethod ParsePaymentMethod(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "banktransfer" or "bank transfer" or "bank_transfer" => MerchantPaymentMethod.BankTransfer,
            "duitnow" => MerchantPaymentMethod.DuitNow,
            "cheque" => MerchantPaymentMethod.Cheque,
            "cash" => MerchantPaymentMethod.Cash,
            "other" => MerchantPaymentMethod.Other,
            _ => throw new Common.ApiException(400, "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]>
                {
                    ["method"] = ["Choose how the payment was received."],
                }),
        };

    /// <summary>Human wording for a payment method, used in documents and email.</summary>
    public static string Describe(MerchantPaymentMethod method) => method switch
    {
        MerchantPaymentMethod.BankTransfer => "Bank transfer",
        MerchantPaymentMethod.DuitNow => "DuitNow",
        MerchantPaymentMethod.Cheque => "Cheque",
        MerchantPaymentMethod.Cash => "Cash",
        _ => "Other",
    };
}
