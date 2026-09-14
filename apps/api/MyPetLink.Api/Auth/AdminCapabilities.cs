namespace MyPetLink.Api.Auth;

/// <summary>
/// The Admin Portal capability catalogue — the single authority for what an
/// operator may do. Every protected admin endpoint names one of these, every
/// role stores a subset of them, and the Admin Portal renders its navigation
/// and action buttons from the set the API reports back.
///
/// Adding a capability here is the only supported way to create one. A string
/// that is not in this catalogue is rejected when a role is saved and ignored
/// when access is resolved, so no request payload can invent permission.
/// </summary>
public static class AdminCapabilities
{
    // --- Access management ----------------------------------------------------
    public const string AdminUsersView = "admin.users.view";
    public const string AdminUsersManage = "admin.users.manage";
    public const string AdminRolesView = "admin.roles.view";
    public const string AdminRolesManage = "admin.roles.manage";
    public const string AuditLogView = "audit_log.view";

    // --- Retail orders --------------------------------------------------------
    public const string OrdersView = "orders.view";
    public const string OrdersExport = "orders.export";
    public const string OrdersManage = "orders.manage";
    public const string OrdersShippingManage = "orders.shipping.manage";
    public const string OrdersTagsAssign = "orders.tags.assign";

    // --- Payment proofs -------------------------------------------------------
    public const string PaymentProofsView = "payment_proofs.view";
    public const string PaymentProofsExport = "payment_proofs.export";
    public const string PaymentProofsReview = "payment_proofs.review";

    // --- Tag inventory --------------------------------------------------------
    public const string InventoryView = "inventory.view";
    public const string InventoryExport = "inventory.export";
    public const string InventoryManage = "inventory.manage";
    public const string InventoryGenerate = "inventory.generate";
    public const string InventoryReceiptsManage = "inventory.receipts.manage";
    public const string InventoryCostsView = "inventory.costs.view";

    // --- Smart Tags -----------------------------------------------------------
    public const string SmartTagsView = "smart_tags.view";
    public const string SmartTagsExport = "smart_tags.export";
    public const string SmartTagsManage = "smart_tags.manage";
    public const string SmartTagsAssign = "smart_tags.assign";
    public const string SmartTagsTransfer = "smart_tags.transfer";

    // --- Tag catalog ----------------------------------------------------------
    public const string CatalogView = "catalog.view";
    public const string CatalogManage = "catalog.manage";

    // --- Customers ------------------------------------------------------------
    public const string OwnersView = "owners.view";
    public const string OwnersManage = "owners.manage";
    public const string OwnersExport = "owners.export";
    public const string PetsView = "pets.view";
    public const string PetsManage = "pets.manage";
    public const string PetsExport = "pets.export";

    // --- Merchant sales -------------------------------------------------------
    // "Reseller" and "merchant" are the same record in this system, so sales.*
    // deliberately governs both rather than adding a parallel resellers.* key.
    public const string SalesView = "sales.view";
    public const string SalesManage = "sales.manage";
    public const string MerchantOrdersView = "merchant_orders.view";
    public const string MerchantOrdersManage = "merchant_orders.manage";
    public const string MerchantOrdersFulfil = "merchant_orders.fulfil";
    public const string MerchantDocumentsSend = "merchant_documents.send";

    // --- Finance --------------------------------------------------------------
    public const string MerchantInvoicesView = "merchant_invoices.view";
    public const string MerchantInvoicesManage = "merchant_invoices.manage";
    public const string MerchantInvoicesRecordPayment = "merchant_invoices.record_payment";
    public const string SalesCommissionsView = "sales_commissions.view";
    public const string SalesCommissionsExport = "sales_commissions.export";
    public const string SalesCommissionsReverse = "sales_commissions.reverse";
    public const string SalesCommissionRulesManage = "sales_commissions.rules.manage";
    public const string PayoutsView = "payouts.view";
    public const string PayoutsManage = "payouts.manage";
    public const string PayoutsSettle = "payouts.settle";

    // --- Marketing ------------------------------------------------------------
    public const string MarketingView = "marketing.view";
    public const string MarketingManage = "marketing.manage";

    // --- Configuration --------------------------------------------------------
    public const string PlansView = "plans.view";
    public const string SettingsView = "settings.view";
    public const string SettingsManage = "settings.manage";
    public const string EmailTemplatesView = "email_templates.view";
    public const string EmailTemplatesManage = "email_templates.manage";
    public const string SampleExperienceView = "sample_experience.view";
    public const string SampleExperienceManage = "sample_experience.manage";

    // --- System ---------------------------------------------------------------
    public const string OperationalStatusView = "operational_status.view";
}
