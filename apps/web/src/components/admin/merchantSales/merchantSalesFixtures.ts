import type {
  AdminMerchant,
  AdminMerchantOrder,
  AdminQuotation,
  AdminSalesperson,
} from "@/services/adminMerchantSalesService";
import type {
  AdminMerchantInvoice,
  AdminSalesCommission,
  MerchantSalesOverview,
} from "@/services/adminMerchantBillingService";

// Deterministic fixtures. Every test builds from these with an explicit
// override, so nothing leaks between cases through a shared mutable object.

export const address = {
  addressLine1: "88 Jalan Perdana Utama",
  addressLine2: "Blok B, Tingkat 3",
  postcode: "68000",
  city: "Ampang",
  state: "Selangor",
  country: "Malaysia",
};

export function merchant(overrides: Partial<AdminMerchant> = {}): AdminMerchant {
  return {
    id: "merchant-1",
    merchantCode: "MPL-MER-00001",
    legalBusinessName: "Happy Paws Veterinary Group Sdn Bhd",
    tradingName: "Happy Paws",
    businessRegistrationNumber: "AS9911223-P",
    taxIdentificationNumber: "IG12345678900",
    sstRegistrationNumber: null,
    contactPerson: "Aina Rahman",
    contactEmail: "orders@happypaws.example",
    contactPhone: "+60123456789",
    billingAddress: { ...address },
    deliveryAddressSameAsBilling: true,
    deliveryAddress: { ...address },
    assignedSalespersonId: "rep-1",
    assignedSalespersonName: "Nur Aisyah",
    paymentTerm: "Prepaid",
    internalNotes: "Margin is thin, do not discount further.",
    isActive: true,
    createdAt: "2026-08-01T02:00:00Z",
    updatedAt: "2026-08-01T02:00:00Z",
    concurrencyToken: "token-merchant-1",
    ...overrides,
  } as AdminMerchant;
}

export function salesperson(overrides: Partial<AdminSalesperson> = {}): AdminSalesperson {
  return {
    id: "rep-1",
    salespersonCode: "MPL-SALES-001",
    name: "Nur Aisyah",
    email: "aisyah@mypetlink.example",
    phone: "+60123456700",
    defaultCommissionPercentage: 5,
    internalNotes: null,
    isActive: true,
    createdAt: "2026-08-01T02:00:00Z",
    updatedAt: "2026-08-01T02:00:00Z",
    concurrencyToken: "token-rep-1",
    ...overrides,
  } as AdminSalesperson;
}

export function quotation(overrides: Partial<AdminQuotation> = {}): AdminQuotation {
  return {
    id: "quotation-1",
    quotationNumber: "MPL-QT-260806-0001",
    merchantId: "merchant-1",
    merchantCode: "MPL-MER-00001",
    merchantLegalName: "Happy Paws Veterinary Group Sdn Bhd",
    salespersonId: "rep-1",
    salespersonName: "Nur Aisyah",
    status: "Draft",
    quotationDate: "2026-08-06T02:00:00Z",
    validUntil: "2026-09-05T00:00:00Z",
    currency: "MYR",
    merchandiseSubtotal: 1700,
    discountTotal: 200,
    deliveryFee: 35,
    grandTotal: 1535,
    customerNotes: "Bulk pricing held for your three clinics.",
    internalNotes: "Internal: chase finance on Friday.",
    convertedOrderId: null,
    convertedOrderNumber: null,
    items: [
      {
        id: "line-1",
        productVariantId: "variant-1",
        sku: "WS-QR-0001",
        displayName: "Wholesale Smart Tag",
        supportsQr: true,
        supportsNfc: false,
        tagVariantName: "Lightweight",
        quantity: 100,
        wholesaleUnitPrice: 12.5,
        lineDiscount: 50,
        lineSubtotal: 1200,
      },
    ],
    createdAt: "2026-08-06T02:00:00Z",
    updatedAt: "2026-08-06T02:00:00Z",
    concurrencyToken: "token-quotation-1",
    ...overrides,
  } as AdminQuotation;
}

export function order(overrides: Partial<AdminMerchantOrder> = {}): AdminMerchantOrder {
  return {
    id: "order-1",
    merchantOrderNumber: "MPL-B2B-ORD-260806-0001",
    sourceQuotationId: "quotation-1",
    sourceQuotationNumber: "MPL-QT-260806-0001",
    merchantId: "merchant-1",
    merchantCode: "MPL-MER-00001",
    merchantLegalName: "Happy Paws Veterinary Group Sdn Bhd",
    salespersonId: "rep-1",
    salespersonName: "Nur Aisyah",
    paymentStatus: "AwaitingPayment",
    currency: "MYR",
    merchandiseSubtotal: 1700,
    discountTotal: 200,
    deliveryFee: 35,
    grandTotal: 1535,
    billingAddress: { ...address },
    deliveryAddress: { ...address },
    internalNotes: null,
    items: [],
    createdAt: "2026-08-06T02:10:00Z",
    updatedAt: "2026-08-06T02:10:00Z",
    concurrencyToken: "token-order-1",
    ...overrides,
  } as AdminMerchantOrder;
}

export function invoice(overrides: Partial<AdminMerchantInvoice> = {}): AdminMerchantInvoice {
  return {
    id: "invoice-1",
    invoiceNumber: "MPL-INV-260806-0001",
    merchantOrderId: "order-1",
    merchantOrderNumber: "MPL-B2B-ORD-260806-0001",
    sourceQuotationNumber: "MPL-QT-260806-0001",
    merchantId: "merchant-1",
    merchantCode: "MPL-MER-00001",
    merchantLegalName: "Happy Paws Veterinary Group Sdn Bhd",
    merchantTradingName: "Happy Paws",
    contactPerson: "Aina Rahman",
    contactEmail: "orders@happypaws.example",
    invoiceDate: "2026-08-06T02:20:00Z",
    dueDate: "2026-08-06T02:20:00Z",
    paymentTerm: "Prepaid",
    currency: "MYR",
    merchandiseSubtotal: 1700,
    discountTotal: 200,
    deliveryFee: 35,
    grandTotal: 1535,
    status: "Issued",
    issuedAt: "2026-08-06T02:20:00Z",
    paidAt: null,
    cancelledAt: null,
    internalNotes: null,
    items: [],
    payment: null,
    receipt: null,
    concurrencyToken: "token-invoice-1",
    ...overrides,
  } as AdminMerchantInvoice;
}

export function commission(
  overrides: Partial<AdminSalesCommission> = {}
): AdminSalesCommission {
  return {
    id: "commission-1",
    merchantOrderId: "order-1",
    merchantOrderNumber: "MPL-B2B-ORD-260806-0001",
    salespersonId: "rep-1",
    salespersonCode: "MPL-SALES-001",
    salespersonName: "Nur Aisyah",
    commissionPercentage: 5,
    commissionBaseAmount: 1500,
    commissionAmount: 75,
    currency: "MYR",
    status: "Payable",
    calculatedAt: "2026-08-06T02:30:00Z",
    paidAt: null,
    reversedAt: null,
    concurrencyToken: "token-commission-1",
    ...overrides,
  } as AdminSalesCommission;
}

export function overview(
  overrides: Partial<MerchantSalesOverview> = {}
): MerchantSalesOverview {
  return {
    activeMerchants: 3,
    draftQuotations: 2,
    sentQuotations: 1,
    ordersAwaitingInvoice: 0,
    outstandingInvoiceTotal: 1035,
    payableCommissionTotal: 75,
    currency: "MYR",
    ...overrides,
  } as MerchantSalesOverview;
}

export const paged = <T,>(items: T[], total = items.length) => ({ items, total });
