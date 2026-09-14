using MyPetLink.Api.Entities;
using C = MyPetLink.Api.Auth.AdminCapabilities;

namespace MyPetLink.Api.Auth;

public sealed record AdminRoleTemplate(
    Guid Id,
    string Code,
    string Name,
    string Description,
    bool GrantsAllCapabilities,
    int SortOrder,
    IReadOnlyList<string> Capabilities);

/// <summary>
/// The built-in roles seeded with the access-management release.
///
/// The first four reproduce, capability for capability, what each legacy
/// <see cref="AdminRole"/> value could already do. Existing operators are moved
/// onto them so nobody's access changes the moment the migration runs; they can
/// then be narrowed deliberately from the Roles screen.
///
/// The remaining five are the new least-privilege templates. They are seeded
/// unassigned, so they change nothing until someone is given one.
/// </summary>
public static class AdminRoleTemplates
{
    public const string SuperAdminCode = "super-admin";
    public const string AdministratorCode = "administrator";
    public const string OperationsCode = "operations";
    public const string OwnerSupportCode = "owner-support";
    public const string SalesCode = "sales";
    public const string MarketingCode = "marketing";
    public const string FinanceCode = "finance";
    public const string SupportCode = "support";
    public const string AuditorCode = "auditor";

    /// <summary>
    /// Everything an active admin of any legacy role could already reach,
    /// because those endpoints were behind the single shared admin policy.
    /// </summary>
    private static readonly string[] LegacySharedAdminAccess =
    [
        C.AdminUsersView, C.AdminRolesView, C.AuditLogView,
        C.OrdersView, C.OrdersExport, C.OrdersManage, C.OrdersShippingManage, C.OrdersTagsAssign,
        C.PaymentProofsView, C.PaymentProofsExport, C.PaymentProofsReview,
        C.InventoryView, C.InventoryExport, C.InventoryManage, C.InventoryGenerate,
        C.InventoryReceiptsManage, C.InventoryCostsView,
        C.SmartTagsView, C.SmartTagsExport, C.SmartTagsManage, C.SmartTagsAssign, C.SmartTagsTransfer,
        C.CatalogView, C.CatalogManage,
        C.OwnersView, C.OwnersManage, C.OwnersExport, C.PetsView, C.PetsManage, C.PetsExport,
        C.MerchantOrdersView, C.MerchantOrdersManage, C.MerchantOrdersFulfil, C.MerchantDocumentsSend,
        C.MerchantInvoicesView, C.MerchantInvoicesManage,
        C.MarketingView, C.MarketingManage,
        C.PlansView, C.SettingsView, C.SettingsManage,
        C.EmailTemplatesView, C.EmailTemplatesManage,
        C.SampleExperienceView, C.SampleExperienceManage,
        C.OperationalStatusView,
    ];

    public static IReadOnlyList<AdminRoleTemplate> All { get; } = BuildAll();

    public static AdminRoleTemplate Require(string code) =>
        All.SingleOrDefault(role => role.Code == code)
        ?? throw new InvalidOperationException($"Unknown built-in role '{code}'.");

    /// <summary>
    /// Which built-in role an existing operator is moved onto. This mapping is
    /// what guarantees no administrator loses access at deployment.
    /// </summary>
    public static string CodeForLegacyRole(AdminRole role) => role switch
    {
        AdminRole.SuperAdmin => SuperAdminCode,
        AdminRole.Admin => AdministratorCode,
        AdminRole.Operations => OperationsCode,
        AdminRole.OwnerSupport => OwnerSupportCode,
        _ => OwnerSupportCode,
    };

    private static AdminRoleTemplate[] BuildAll()
    {
        // Legacy Operations additionally held the sales-performance policy.
        var operations = Combine(LegacySharedAdminAccess, [C.SalesView]);

        // Legacy Admin additionally held sales administration, commission
        // accounting, invoice payment recording and payout preparation — but
        // never payout settlement, commission reversal or rule management.
        var administrator = Combine(
            operations,
            [
                C.SalesManage,
                C.MerchantInvoicesRecordPayment,
                C.SalesCommissionsView,
                C.SalesCommissionsExport,
                C.PayoutsView,
                C.PayoutsManage,
            ]);

        return
        [
            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d01"),
                SuperAdminCode,
                "Super Admin",
                "Complete access to everything, including who else can use the Admin Portal. "
                + "Only a Super Admin can grant or remove Super Admin access.",
                GrantsAllCapabilities: true,
                SortOrder: 10,
                Array.Empty<string>()),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02"),
                AdministratorCode,
                "Administrator",
                "Day-to-day running of the business across every operational area, plus commission "
                + "accounting and payout preparation. Cannot release payouts, reverse commission, "
                + "change commission rules, or change who has Admin Portal access.",
                GrantsAllCapabilities: false,
                SortOrder: 20,
                administrator),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03"),
                OperationsCode,
                "Operations",
                "Orders, shipping, inventory, Smart Tags, customer support information and business "
                + "configuration, with visibility of sales performance. No commission accounting, "
                + "payouts or access management.",
                GrantsAllCapabilities: false,
                SortOrder: 30,
                operations),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04"),
                OwnerSupportCode,
                "Owner Support",
                "Customer-facing operational work across orders, Smart Tags, owners and pets. "
                + "No sales, commission, payout or access management.",
                GrantsAllCapabilities: false,
                SortOrder: 40,
                LegacySharedAdminAccess),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05"),
                SalesCode,
                "Sales",
                "Resellers, salespeople, referral credit, quotations and merchant orders, with "
                + "visibility of commission earned. No stock creation, no payment approval, no payouts.",
                GrantsAllCapabilities: false,
                SortOrder: 50,
                [
                    C.SalesView, C.SalesManage,
                    C.MerchantOrdersView, C.MerchantOrdersManage, C.MerchantDocumentsSend,
                    C.MerchantInvoicesView,
                    C.SalesCommissionsView, C.SalesCommissionsExport,
                    C.OrdersView,
                    C.OwnersView,
                    C.CatalogView,
                    C.PlansView,
                ]),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06"),
                MarketingCode,
                "Marketing",
                "Promotions, the sample pet experience, and campaign and referral reporting. "
                + "No payment proofs, payouts, stock costs or access management.",
                GrantsAllCapabilities: false,
                SortOrder: 60,
                [
                    C.MarketingView, C.MarketingManage,
                    C.SampleExperienceView, C.SampleExperienceManage,
                    C.SalesView,
                    C.CatalogView,
                    C.PlansView,
                ]),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07"),
                FinanceCode,
                "Finance",
                "Payment approval, invoices and receipts, commission accounting, payouts and "
                + "financial reporting. No stock creation, Smart Tag operations or access management.",
                GrantsAllCapabilities: false,
                SortOrder: 70,
                [
                    C.PaymentProofsView, C.PaymentProofsExport, C.PaymentProofsReview,
                    C.OrdersView, C.OrdersExport,
                    C.MerchantOrdersView,
                    C.MerchantInvoicesView, C.MerchantInvoicesManage, C.MerchantInvoicesRecordPayment,
                    C.MerchantDocumentsSend,
                    C.SalesCommissionsView, C.SalesCommissionsExport,
                    C.SalesCommissionsReverse, C.SalesCommissionRulesManage,
                    C.PayoutsView, C.PayoutsManage, C.PayoutsSettle,
                    C.SalesView,
                    C.InventoryCostsView,
                    C.AuditLogView,
                    C.CatalogView,
                    C.PlansView,
                ]),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08"),
                SupportCode,
                "Support",
                "Helping owners with their pets, Smart Tags and orders. No financial approval, "
                + "no stock creation, no customer data downloads and no access management.",
                GrantsAllCapabilities: false,
                SortOrder: 80,
                [
                    C.OwnersView, C.OwnersManage,
                    C.PetsView, C.PetsManage,
                    C.SmartTagsView, C.SmartTagsManage, C.SmartTagsAssign,
                    C.OrdersView,
                    C.PaymentProofsView,
                    C.CatalogView,
                    C.PlansView,
                ]),

            new AdminRoleTemplate(
                Guid.Parse("b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09"),
                AuditorCode,
                "Read Only / Auditor",
                "Can open every module and read what is there, including the activity history, "
                + "but cannot change, approve or download anything.",
                GrantsAllCapabilities: false,
                SortOrder: 90,
                AdminCapabilityCatalog.ReadOnlyKeys),
        ];
    }

    private static IReadOnlyList<string> Combine(
        IReadOnlyList<string> baseline,
        IReadOnlyList<string> extra) =>
        AdminCapabilityCatalog.Normalize(baseline.Concat(extra));
}
