using C = MyPetLink.Api.Auth.AdminCapabilities;

namespace MyPetLink.Api.Auth;

/// <summary>
/// One capability, with the wording the Admin Portal shows for it.
/// <para><c>IsWriteAccess</c> is true when the capability changes data, money,
/// stock or access rather than only reading it.</para>
/// <para><c>IsSensitive</c> marks the small number that carry outsized risk —
/// releasing money, creating stock, changing who may administer the system, or
/// sending customer data out of the portal.</para>
/// </summary>
public sealed record AdminCapabilityDescriptor(
    string Key,
    string ModuleKey,
    string ModuleName,
    string Name,
    string Description,
    bool IsWriteAccess,
    bool IsSensitive);

public sealed record AdminCapabilityModule(
    string Key,
    string Name,
    string Description,
    IReadOnlyList<AdminCapabilityDescriptor> Capabilities);

/// <summary>
/// The catalogue behind <see cref="AdminCapabilities"/>. It drives policy
/// registration, role validation, the permissions picker in the Roles screen,
/// and the grouped effective-permission view on a user.
/// </summary>
public static class AdminCapabilityCatalog
{
    private static readonly AdminCapabilityModule[] ModuleList = BuildModules();

    private static readonly IReadOnlyDictionary<string, AdminCapabilityDescriptor> ByKey =
        ModuleList
            .SelectMany(module => module.Capabilities)
            .ToDictionary(capability => capability.Key, StringComparer.Ordinal);

    public static IReadOnlyList<AdminCapabilityModule> Modules => ModuleList;

    public static IReadOnlyList<string> AllKeys { get; } =
        ModuleList.SelectMany(module => module.Capabilities).Select(item => item.Key).ToArray();

    public static IReadOnlySet<string> AllKeySet { get; } =
        AllKeys.ToHashSet(StringComparer.Ordinal);

    public static bool IsKnown(string? capability) =>
        !string.IsNullOrWhiteSpace(capability) && ByKey.ContainsKey(capability);

    public static AdminCapabilityDescriptor? Find(string capability) =>
        ByKey.TryGetValue(capability, out var descriptor) ? descriptor : null;

    /// <summary>
    /// Every capability that only reads and is not sensitive. This is what the
    /// Read Only / Auditor template is built from, so a new read-only
    /// capability joins it automatically while exports never do.
    /// </summary>
    public static IReadOnlyList<string> ReadOnlyKeys { get; } =
        ModuleList
            .SelectMany(module => module.Capabilities)
            .Where(capability => !capability.IsWriteAccess && !capability.IsSensitive)
            .Select(capability => capability.Key)
            .ToArray();

    /// <summary>
    /// Keeps only catalogue keys, in catalogue order, without duplicates.
    /// Stored rows for a capability that no longer exists are dropped here
    /// rather than being treated as a grant.
    /// </summary>
    public static IReadOnlyList<string> Normalize(IEnumerable<string> capabilities)
    {
        var wanted = capabilities
            .Where(capability => !string.IsNullOrWhiteSpace(capability))
            .Select(capability => capability.Trim())
            .ToHashSet(StringComparer.Ordinal);

        return AllKeys.Where(wanted.Contains).ToArray();
    }

    private static AdminCapabilityModule[] BuildModules() =>
    [
        new AdminCapabilityModule("access", "Access Management",
            "Who can sign in to the Admin Portal and what each of them may do.",
            [
                Read(C.AdminUsersView, "access", "Access Management", "View admin users",
                    "See the list of people with Admin Portal access and the roles they hold."),
                Sensitive(C.AdminUsersManage, "access", "Access Management", "Manage admin users",
                    "Change which roles someone holds, and turn their Admin Portal access on or off."),
                Read(C.AdminRolesView, "access", "Access Management", "View roles",
                    "See each role and the permissions it grants."),
                Sensitive(C.AdminRolesManage, "access", "Access Management", "Manage roles",
                    "Create roles and change the permissions a role grants."),
                Read(C.AuditLogView, "access", "Access Management", "View activity history",
                    "Read the record of who changed what, and when."),
            ]),

        new AdminCapabilityModule("orders", "Retail Orders",
            "Orders placed by pet owners for a Smart Tag.",
            [
                Read(C.OrdersView, "orders", "Retail Orders", "View orders",
                    "Open the order list and any individual order."),
                Sensitive(C.OrdersExport, "orders", "Retail Orders", "Download order records",
                    "Download order data as a spreadsheet, including customer details."),
                Write(C.OrdersManage, "orders", "Retail Orders", "Process orders",
                    "Confirm payment, reject a payment proof, change order status and cancel an order."),
                Write(C.OrdersShippingManage, "orders", "Retail Orders", "Manage shipping",
                    "Record tracking details and move an order through preparing, shipped and delivered."),
                Write(C.OrdersTagsAssign, "orders", "Retail Orders", "Assign the tag on an order",
                    "Choose which physical tag an order ships with, swap it before shipping, or replace it afterwards."),
            ]),

        new AdminCapabilityModule("payment_proofs", "Payment Proofs",
            "Bank transfer receipts customers upload to pay for an order.",
            [
                Read(C.PaymentProofsView, "payment_proofs", "Payment Proofs", "View payment proofs",
                    "Open the payment proof queue and view an uploaded receipt."),
                Sensitive(C.PaymentProofsExport, "payment_proofs", "Payment Proofs", "Download payment proof records",
                    "Download payment proof data as a spreadsheet, including customer details."),
                Sensitive(C.PaymentProofsReview, "payment_proofs", "Payment Proofs", "Approve or reject payments",
                    "Decide whether a customer payment is accepted. Approving releases the order for fulfilment."),
            ]),

        new AdminCapabilityModule("inventory", "Tag Inventory",
            "Physical tag stock, from manufacturing to the moment a tag is assigned.",
            [
                Read(C.InventoryView, "inventory", "Tag Inventory", "View inventory",
                    "See current tag stock and its status."),
                Sensitive(C.InventoryExport, "inventory", "Tag Inventory", "Download inventory records",
                    "Download stock lists, including the manufacturer file."),
                Write(C.InventoryManage, "inventory", "Tag Inventory", "Update inventory status",
                    "Change the status of tags already in stock, individually or in bulk."),
                Sensitive(C.InventoryGenerate, "inventory", "Tag Inventory", "Create new tag stock",
                    "Generate new tag codes. This creates sellable stock, so it is kept separate from everyday inventory work."),
                Write(C.InventoryReceiptsManage, "inventory", "Tag Inventory", "Record stock received",
                    "Record a delivery from the manufacturer, including quantity and unit cost."),
                Read(C.InventoryCostsView, "inventory", "Tag Inventory", "View stock costs and margins",
                    "See what tags cost to produce and the profitability figures derived from it."),
            ]),

        new AdminCapabilityModule("smart_tags", "Smart Tags",
            "Tags that are already in a customer's hands.",
            [
                Read(C.SmartTagsView, "smart_tags", "Smart Tags", "View Smart Tags",
                    "Open the Smart Tag list, an individual tag, and its scan history."),
                Sensitive(C.SmartTagsExport, "smart_tags", "Smart Tags", "Download Smart Tag records",
                    "Download tag and scan data as a spreadsheet."),
                Write(C.SmartTagsManage, "smart_tags", "Smart Tags", "Manage Smart Tags",
                    "Mark a tag lost, disable it, archive it or return it to stock. A disabled tag stops showing owner contact details."),
                Write(C.SmartTagsAssign, "smart_tags", "Smart Tags", "Assign a tag to a pet",
                    "Link a tag to a pet, or unlink it, on behalf of an owner."),
                Sensitive(C.SmartTagsTransfer, "smart_tags", "Smart Tags", "Move a tag to another owner",
                    "Transfer a tag between owners. This changes whose contact details the tag shows."),
            ]),

        new AdminCapabilityModule("catalog", "Tag Catalog",
            "The tag products and variants customers can buy, and their prices.",
            [
                Read(C.CatalogView, "catalog", "Tag Catalog", "View the catalog",
                    "See tag products, variants and prices."),
                Sensitive(C.CatalogManage, "catalog", "Tag Catalog", "Manage the catalog",
                    "Create and edit tag products, variants and prices, and archive them."),
            ]),

        new AdminCapabilityModule("customers", "Owners and Pets",
            "Customer accounts and the pet profiles they keep.",
            [
                Read(C.OwnersView, "customers", "Owners and Pets", "View owners",
                    "Open the owner list and an individual owner's account details."),
                Write(C.OwnersManage, "customers", "Owners and Pets", "Help owners with their account",
                    "Take account actions on an owner's behalf, such as resending their welcome email."),
                Sensitive(C.OwnersExport, "customers", "Owners and Pets", "Download owner records",
                    "Download owner data as a spreadsheet, including contact details."),
                Read(C.PetsView, "customers", "Owners and Pets", "View pets",
                    "Open the pet list and an individual pet profile."),
                Write(C.PetsManage, "customers", "Owners and Pets", "Manage pet profiles",
                    "Change pet settings that support staff can adjust on an owner's behalf."),
                Sensitive(C.PetsExport, "customers", "Owners and Pets", "Download pet records",
                    "Download pet data as a spreadsheet."),
            ]),

        new AdminCapabilityModule("sales", "Merchant Sales",
            "Bulk sales to business customers, and the people and resellers behind them.",
            [
                Read(C.SalesView, "sales", "Merchant Sales", "View sales and resellers",
                    "See resellers, salespeople, referral attribution and sales performance figures."),
                Write(C.SalesManage, "sales", "Merchant Sales", "Manage sales and resellers",
                    "Add and edit resellers and salespeople, and change who a sale or an owner is credited to."),
                Read(C.MerchantOrdersView, "sales", "Merchant Sales", "View quotations and merchant orders",
                    "Open quotations, merchant orders and their timelines."),
                Write(C.MerchantOrdersManage, "sales", "Merchant Sales", "Manage quotations and merchant orders",
                    "Create and send quotations, convert them to orders, and cancel a quotation or order."),
                Write(C.MerchantOrdersFulfil, "sales", "Merchant Sales", "Fulfil merchant orders",
                    "Allocate stock to a merchant order and move it through preparing, shipped and delivered."),
                Write(C.MerchantDocumentsSend, "sales", "Merchant Sales", "Email documents to merchants",
                    "Send a quotation or invoice to the merchant by email."),
            ]),

        new AdminCapabilityModule("finance", "Finance",
            "Invoices, commission accounting and payouts.",
            [
                Read(C.MerchantInvoicesView, "finance", "Finance", "View invoices and receipts",
                    "Open merchant invoices and download invoice, receipt and delivery order documents."),
                Write(C.MerchantInvoicesManage, "finance", "Finance", "Manage invoices",
                    "Issue an invoice for a merchant order and cancel an invoice."),
                Sensitive(C.MerchantInvoicesRecordPayment, "finance", "Finance", "Record an invoice payment",
                    "Record money received against an invoice. This is what makes commission payable."),
                Read(C.SalesCommissionsView, "finance", "Finance", "View commission accounting",
                    "See the commission ledger, financial reports and commission downloads."),
                Sensitive(C.SalesCommissionsReverse, "finance", "Finance", "Reverse a commission",
                    "Cancel a commission that should not have been earned. This changes what is owed."),
                Sensitive(C.SalesCommissionRulesManage, "finance", "Finance", "Manage commission rules",
                    "Change the rates and rules that decide how much commission every future sale earns."),
                Read(C.PayoutsView, "finance", "Finance", "View payouts",
                    "Open payout batches and download a payout statement."),
                Write(C.PayoutsManage, "finance", "Finance", "Prepare payouts",
                    "Prepare a payout batch for approval, and cancel one that has not been paid."),
                Sensitive(C.PayoutsSettle, "finance", "Finance", "Record a payout as paid",
                    "Confirm that money has actually left the business. This cannot be undone by preparing a new batch."),
            ]),

        new AdminCapabilityModule("marketing", "Marketing",
            "Promotions and campaign attribution.",
            [
                Read(C.MarketingView, "marketing", "Marketing", "View promotions",
                    "See current and past promotions."),
                Write(C.MarketingManage, "marketing", "Marketing", "Manage promotions",
                    "Create and edit promotions."),
            ]),

        new AdminCapabilityModule("settings", "Configuration",
            "Business settings that change how the product behaves for customers.",
            [
                Read(C.PlansView, "settings", "Configuration", "View plans",
                    "See the plans available to owners and who is on each one."),
                Read(C.SettingsView, "settings", "Configuration", "View business settings",
                    "See business identity, delivery rates, shipping and checkout settings."),
                Sensitive(C.SettingsManage, "settings", "Configuration", "Manage business settings",
                    "Change business identity, delivery rates, couriers and the checkout payment window. These affect what every customer is charged and sees."),
                Read(C.EmailTemplatesView, "settings", "Configuration", "View email settings",
                    "See which customer emails are switched on and who receives operations notices."),
                Sensitive(C.EmailTemplatesManage, "settings", "Configuration", "Manage email settings",
                    "Switch customer emails on or off and change where operations notices are sent."),
                Read(C.SampleExperienceView, "settings", "Configuration", "View the sample experience",
                    "See which pet profile is shown to visitors as the sample."),
                Write(C.SampleExperienceManage, "settings", "Configuration", "Manage the sample experience",
                    "Choose the pet profile shown to visitors as the sample."),
            ]),

        new AdminCapabilityModule("system", "System",
            "Read-only health and readiness information about the running service.",
            [
                Read(C.OperationalStatusView, "system", "System", "View operational status",
                    "See whether storage, email and payment features are ready."),
            ]),
    ];

    private static AdminCapabilityDescriptor Read(
        string key, string moduleKey, string moduleName, string name, string description) =>
        new(key, moduleKey, moduleName, name, description, IsWriteAccess: false, IsSensitive: false);

    private static AdminCapabilityDescriptor Write(
        string key, string moduleKey, string moduleName, string name, string description) =>
        new(key, moduleKey, moduleName, name, description, IsWriteAccess: true, IsSensitive: false);

    private static AdminCapabilityDescriptor Sensitive(
        string key, string moduleKey, string moduleName, string name, string description) =>
        new(key, moduleKey, moduleName, name, description, IsWriteAccess: true, IsSensitive: true);
}
