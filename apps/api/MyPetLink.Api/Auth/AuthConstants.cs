namespace MyPetLink.Api.Auth;

public static class RoleConstants
{
    public const string Admin = "Admin";
    public const string Owner = "Owner";
}

public static class AuthorizationPolicies
{
    public const string Admin = "AdminOnly";
    public const string Owner = "OwnerOnly";
    public const string SalesPerformance = "SalesPerformance";
    public const string SalesAdministration = "SalesAdministration";
    public const string CommissionFinancial = "CommissionFinancial";
    public const string PrepareCommissionPayout = "PrepareCommissionPayout";
    public const string MarkCommissionPaid = "MarkCommissionPaid";
    public const string ReverseCommission = "ReverseCommission";
    public const string ManageCommissionRules = "ManageCommissionRules";
}
