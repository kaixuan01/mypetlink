using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

public class SalesReportQuery
{
    [Required] public DateTimeOffset? From { get; set; }
    [Required] public DateTimeOffset? ToExclusive { get; set; }
    public Guid? SalespersonId { get; set; }
    public string? Channel { get; set; }
    public string? CommissionType { get; set; }
}

public sealed class CommissionLedgerQuery : SalesReportQuery
{
    [Range(1, int.MaxValue)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 50;
    public string? Status { get; set; }
    public Guid? MerchantId { get; set; }
    public string? Search { get; set; }
}

public sealed class ResellerPortfolioQuery
{
    [Range(1, int.MaxValue)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 50;
    public string? Search { get; set; }
    public string? State { get; set; }
}

public sealed record SalesReportRange(DateTimeOffset From, DateTimeOffset ToExclusive);

public sealed record RetailPerformanceMetrics(
    int AttributedPaidOrders,
    int UnitsSold,
    decimal AttributedRevenue,
    int CommissionEligibleOrders,
    int CommissionEligibleUnits,
    decimal CommissionEligibleRevenue);

public sealed record MerchantPerformanceMetrics(
    int PaidOrders,
    decimal NetWholesaleRevenue,
    int NewResellerActivations);

public sealed record ResellerRelationshipMetrics(
    int ResellersAcquired,
    int Active,
    int EndingSoon,
    int Expired,
    int NotActivated);

public sealed record SalespersonRankingItem(
    Guid SalespersonId,
    string SalespersonCode,
    string SalespersonName,
    decimal Value);

public sealed record SalesPerformanceReportResponse(
    SalesReportRange Range,
    RetailPerformanceMetrics Retail,
    MerchantPerformanceMetrics Merchant,
    ResellerRelationshipMetrics Relationships,
    IReadOnlyCollection<SalespersonRankingItem> DirectRevenueRanking,
    IReadOnlyCollection<SalespersonRankingItem> DirectUnitsRanking,
    IReadOnlyCollection<SalespersonRankingItem> ResellerActivationRanking);

public sealed record CommissionAccountingMetrics(
    decimal GrossGenerated,
    decimal CurrentValid,
    decimal Payable,
    decimal CurrentPaid,
    decimal Reversed,
    decimal CashPaidDuringPeriod,
    decimal ReversedDuringPeriod,
    string Currency);

public sealed record CommissionFinancialReportResponse(
    SalesReportRange Range,
    CommissionAccountingMetrics Accounting,
    IReadOnlyCollection<SalespersonRankingItem> CommissionGeneratedRanking);

public sealed record SalespersonPerformanceReportResponse(
    Guid SalespersonId,
    string SalespersonCode,
    string SalespersonName,
    SalesReportRange Range,
    RetailPerformanceMetrics Retail,
    MerchantPerformanceMetrics Merchant,
    int RepeatPaidOrders,
    decimal RepeatEligibleRevenue,
    decimal LifetimeWholesaleRevenue);

public sealed record SalespersonFinancialReportResponse(
    Guid SalespersonId,
    SalesReportRange Range,
    decimal DirectCommissionGenerated,
    decimal DirectCommissionReversed,
    decimal AcquisitionBonusGenerated,
    decimal RepeatCommissionGenerated,
    CommissionAccountingMetrics Accounting);

public sealed record ResellerPortfolioItemResponse(
    Guid MerchantId,
    string MerchantCode,
    string MerchantName,
    string CommissionPlan,
    Guid? AcquiredBySalespersonId,
    string? AcquiredBySalespersonCode,
    string? AcquiredBySalespersonName,
    Guid? AssignedSalespersonId,
    string? AssignedSalespersonCode,
    string? AssignedSalespersonName,
    DateTimeOffset? ActivationDate,
    Guid? ActivationOrderId,
    string? ActivationOrderNumber,
    DateTimeOffset? RepeatEligibleUntil,
    string RelationshipState,
    decimal LifetimeWholesaleRevenue,
    decimal RepeatEligibleRevenue);

public sealed record ResellerPortfolioFinancialItemResponse(
    Guid MerchantId,
    decimal? RepeatCommissionPercentage,
    decimal AcquisitionBonusGenerated,
    decimal RepeatCommissionGenerated,
    string Currency);
