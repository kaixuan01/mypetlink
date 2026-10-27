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
                    "Change non-shipping order status, retry a confirmation email and cancel an order."),
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
                Sensitive(C.InventoryQaManage, "inventory", "Tag Inventory", "Inspect and release physical tags",
                    "Enroll stock for inspection, record reader results and release passed tags for sale."),
                Sensitive(C.InventoryGenerate, "inventory", "Tag Inventory", "Create new tag stock",
                    "Generate new tag codes. New stock is held for physical inspection before it can be sold, and creating it is kept separate from everyday inventory work."),
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
                Sensitive(C.OwnerSocialHandleAssign, "customers", "Owners and Pets",
                    "Assign a reserved social handle",
                    "Give an owner's Community Profile a protected name such as the official "
                    + "MyPetLink account. Reserved names can never be claimed by owners themselves."),
                Sensitive(C.PetsExport, "customers", "Owners and Pets", "Download pet records",
                    "Download pet data as a spreadsheet."),
                Sensitive(C.OwnersSuspend, "customers", "Owners and Pets", "Suspend owner accounts",
                    "Suspend an owner's whole account, so they can no longer sign in, and reinstate it. "
                    + "For fraud, scams or serious abuse only — use a Community restriction for Community behaviour."),
            ]),

        new AdminCapabilityModule("community", "Community moderation",
            "Reports about Comments, Moments and Community Profiles, and what is done about them. "
            + "Affects Community only — never an owner's pets, Safety Profile, Smart Tags or orders.",
            [
                SensitiveRead(C.CommunityReportsView, "community", "Community moderation",
                    "View Community reports and content",
                    "See reports, who made them and the reported content, the Community Moments and "
                    + "comments lists, and each household's moderation history."),
                Write(C.CommunityReportsResolve, "community", "Community moderation",
                    "Resolve reports, remove comments and warn",
                    "Dismiss a report, remove a comment or reply, and issue a Community warning."),
                Sensitive(C.CommunityModerationEnforce, "community", "Community moderation",
                    "Remove Moments and restrict Community access",
                    "Remove a Moment from everyone, or restrict a household's Community participation "
                    + "for a set time or until lifted, and undo either."),
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

        new AdminCapabilityModule("consignment", "Consignment", "Partner agreements and physical stock custody.",
            [
                Sensitive(C.ConsignmentSelfReview, "consignment", "Consignment", "Self-review in Solo Mode", "Review your own consignment terms or receiving findings only when explicitly named in Solo Mode, with genuine partner evidence."),
                Sensitive(C.ConsignmentPolicyManage, "consignment", "Consignment", "Manage approval policy", "Switch Team or Solo Mode and explicitly authorize one founder. Every change is confirmed and audited."),
                Read(C.ConsignmentView, "consignment", "Consignment", "View consignment", "See agreements and custody counts without private customer details or tag manifests."),
                Write(C.ConsignmentAgreementsManage, "consignment", "Consignment", "Manage agreements", "Create and edit draft partner terms."),
                Sensitive(C.ConsignmentAgreementsApprove, "consignment", "Consignment", "Approve agreements", "Approve another administrator's terms or close reconciled agreements."),
                Sensitive(C.ConsignmentWriteOff, "consignment", "Consignment", "Write off damaged returns", "Retain failed returned stock as unavailable with supporting evidence. No financial posting is created."),
                Write(C.ConsignmentAllocate, "consignment", "Consignment", "Reserve consignment stock", "Reserve individual inspected tags or cancel an unshipped allocation."),
                Sensitive(C.ConsignmentDispatch, "consignment", "Consignment", "Dispatch consignment stock", "Confirm physical handover of reserved stock."),
                Write(C.ConsignmentReconcile, "consignment", "Consignment", "Reconcile custody", "Record receipt and references to externally tracked customer handovers."),
                Write(C.ConsignmentReturn, "consignment", "Consignment", "Receive returns", "Receive unsold units into inspection quarantine."),
                Sensitive(C.ConsignmentRelease, "consignment", "Consignment", "Release returned stock", "Return freshly inspected units to available stock."),
                Sensitive(C.ConsignmentManifestExport, "consignment", "Consignment", "Download consignment documents", "Download dispatch notes and controlled Tag Code manifests."),
                Write(C.ConsignmentPriceTermsManage, "consignment", "Consignment", "Manage selling prices", "Prepare the selling prices and promotions a partner may use. Approval is separate."),
                Write(C.ConsignmentSalesReportsRecord, "consignment", "Consignment", "Record sales reports", "Enter a partner's reported sales by SKU exactly as reported. Recorded reports stay unverified."),
                Sensitive(C.ConsignmentSalesReportsVerify, "consignment", "Consignment", "Verify sales reports", "Check reported sales against evidence and move sold quantities out of partner stock. Verifying records what the partner owes for the period and the sales commission it carries, which stays pending until the partner pays in full. Never creates invoices or payments."),
                Write(C.ConsignmentStocktakeRecord, "consignment", "Consignment", "Record stocktakes", "Enter a partner's monthly stock count by SKU with its evidence. A recorded count changes no stock until the month is closed."),
                Sensitive(C.ConsignmentPeriodsClose, "consignment", "Consignment", "Close stocktake months", "Approve a monthly stocktake: freeze the count, send shortages to investigation and carry stock forward to the next month."),
                Sensitive(C.ConsignmentDiscrepanciesResolve, "consignment", "Consignment", "Resolve stock discrepancies", "Settle a counted shortage, surplus or damaged stock with evidence, such as found, damaged, an approved loss or a recount error. Never creates financial records."),
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
                    "See the commission ledger and financial reports."),
                Sensitive(C.SalesCommissionsExport, "finance", "Finance", "Download commission records",
                    "Download commission ledgers and reseller portfolio records as spreadsheets."),
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
                SensitiveRead(C.ConsignmentSettlementsView, "finance", "Finance", "View consignment settlements",
                    "See what each consignment partner owes for a verified period, what they paid, and the sales commission each period carries."),
                Sensitive(C.ConsignmentSettlementsRecordReceipt, "finance", "Finance", "Record consignment partner payments",
                    "Record money a consignment partner paid, or void one recorded by mistake. A fully paid period makes its sales commission payable."),
                Sensitive(C.ConsignmentSettlementsResolve, "finance", "Finance", "Confirm consignment commission earners",
                    "Decide who earns a period's commission when the partner's salesperson changed or was missing, and recalculate a period."),
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
                Sensitive(C.DocumentSignatureManage, "settings", "Configuration", "Sign documents with your own signature",
                    "Keep your own signature on file and apply it, after confirming each time, to Delivery Orders you generate. Never another administrator's signature."),
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

    /// <summary>
    /// Reads only, but exposes something the read-only template must not get
    /// by default — such as who reported whom.
    /// </summary>
    private static AdminCapabilityDescriptor SensitiveRead(
        string key, string moduleKey, string moduleName, string name, string description) =>
        new(key, moduleKey, moduleName, name, description, IsWriteAccess: false, IsSensitive: true);
}
