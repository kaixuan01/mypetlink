// Admin Portal capability keys, mirroring the API's capability catalogue.
//
// These names exist so the portal can decide what to show. They are NOT the
// authorization: every protected destination and action is enforced by the API
// against the same key, so calling it directly without the capability is
// refused. Hiding a button here is a courtesy to the operator, never a control.

export const adminCapabilities = {
  // Access management
  adminUsersView: "admin.users.view",
  adminUsersManage: "admin.users.manage",
  adminRolesView: "admin.roles.view",
  adminRolesManage: "admin.roles.manage",
  auditLogView: "audit_log.view",

  // Retail orders
  ordersView: "orders.view",
  ordersExport: "orders.export",
  ordersManage: "orders.manage",
  ordersShippingManage: "orders.shipping.manage",
  ordersTagsAssign: "orders.tags.assign",

  // Payment proofs
  paymentProofsView: "payment_proofs.view",
  paymentProofsExport: "payment_proofs.export",
  paymentProofsReview: "payment_proofs.review",

  // Tag inventory
  inventoryView: "inventory.view",
  inventoryExport: "inventory.export",
  inventoryManage: "inventory.manage",
  inventoryGenerate: "inventory.generate",
  inventoryReceiptsManage: "inventory.receipts.manage",
  inventoryCostsView: "inventory.costs.view",

  // Smart Tags
  smartTagsView: "smart_tags.view",
  smartTagsExport: "smart_tags.export",
  smartTagsManage: "smart_tags.manage",
  smartTagsAssign: "smart_tags.assign",
  smartTagsTransfer: "smart_tags.transfer",

  // Tag catalog
  catalogView: "catalog.view",
  catalogManage: "catalog.manage",

  // Owners and pets
  ownersView: "owners.view",
  ownersManage: "owners.manage",
  ownersExport: "owners.export",
  petsView: "pets.view",
  petsManage: "pets.manage",
  petsExport: "pets.export",
  ownerSocialHandleAssign: "owners.social_handle.assign",

  // Community moderation
  communityReportsView: "community_reports.view",
  communityReportsResolve: "community_reports.resolve",
  communityModerationEnforce: "community_moderation.enforce",

  // Merchant sales
  salesView: "sales.view",
  salesManage: "sales.manage",
  merchantOrdersView: "merchant_orders.view",
  merchantOrdersManage: "merchant_orders.manage",
  merchantOrdersFulfil: "merchant_orders.fulfil",
  merchantDocumentsSend: "merchant_documents.send",

  // Finance
  merchantInvoicesView: "merchant_invoices.view",
  merchantInvoicesManage: "merchant_invoices.manage",
  merchantInvoicesRecordPayment: "merchant_invoices.record_payment",
  salesCommissionsView: "sales_commissions.view",
  salesCommissionsExport: "sales_commissions.export",
  salesCommissionsReverse: "sales_commissions.reverse",
  salesCommissionRulesManage: "sales_commissions.rules.manage",
  payoutsView: "payouts.view",
  payoutsManage: "payouts.manage",
  payoutsSettle: "payouts.settle",

  // Marketing
  marketingView: "marketing.view",
  marketingManage: "marketing.manage",

  // Configuration
  plansView: "plans.view",
  settingsView: "settings.view",
  settingsManage: "settings.manage",
  emailTemplatesView: "email_templates.view",
  emailTemplatesManage: "email_templates.manage",
  sampleExperienceView: "sample_experience.view",
  sampleExperienceManage: "sample_experience.manage",

  // System
  operationalStatusView: "operational_status.view",
} as const;

export type AdminCapabilityKey =
  (typeof adminCapabilities)[keyof typeof adminCapabilities];

/**
 * What the signed-in operator may do, as reported by the API.
 *
 * `granted` is already expanded: someone whose role grants everything arrives
 * here with every key listed, so nothing downstream needs a special case.
 */
export type AdminAccessCapabilities = {
  isSuperAdmin: boolean;
  roles: readonly AdminAssignedRole[];
  granted: ReadonlySet<string>;
};

export type AdminAssignedRole = {
  roleId: string;
  code: string;
  name: string;
  grantsAllCapabilities: boolean;
};

/** Deny by default. This is what an unresolved or refused session looks like. */
export const noAdminAccess: AdminAccessCapabilities = {
  isSuperAdmin: false,
  roles: [],
  granted: new Set<string>(),
};

/** Every capability, for local preview where there is no API to ask. */
export function allAdminCapabilities(): AdminAccessCapabilities {
  return {
    isSuperAdmin: true,
    roles: [],
    granted: new Set<string>(Object.values(adminCapabilities)),
  };
}

export function hasCapability(
  access: AdminAccessCapabilities,
  capability: AdminCapabilityKey
): boolean {
  return access.granted.has(capability);
}

export function hasAnyCapability(
  access: AdminAccessCapabilities,
  capabilities: readonly AdminCapabilityKey[]
): boolean {
  return capabilities.length === 0 || capabilities.some((key) => access.granted.has(key));
}

export function hasEveryCapability(
  access: AdminAccessCapabilities,
  capabilities: readonly AdminCapabilityKey[]
): boolean {
  return capabilities.every((key) => access.granted.has(key));
}

export function toAdminAccessCapabilities(
  source:
    | {
        isSuperAdmin?: boolean;
        roles?: readonly AdminAssignedRole[];
        capabilities?: readonly string[];
      }
    | null
    | undefined
): AdminAccessCapabilities {
  if (!source) {
    return noAdminAccess;
  }

  return {
    isSuperAdmin: Boolean(source.isSuperAdmin),
    roles: source.roles ?? [],
    granted: new Set<string>(source.capabilities ?? []),
  };
}
