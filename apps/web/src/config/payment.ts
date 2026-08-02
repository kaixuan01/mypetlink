// Phase 1 manual payment settings. There is no payment gateway yet: owners pay
// via a merchant QR and submit a receipt / screenshot for manual
// verification. Keep merchant labels and copy here so they are not scattered
// across components.

export const paymentConfig = {
  phase: "manual" as const,
  merchantQrLabel: "Merchant DuitNow QR",
  // Public URL only. The approved image lives under public/payment-qr and is
  // never read from a local filesystem path in browser code.
  merchantQrImage: "/payment-qr/merchant_duitnow_qr.jpg",
  supportText: "Contact MyPetLink support if you need help with payment proof.",
  instructions:
    "Scan the DuitNow QR and pay the exact amount shown. After payment, upload your payment receipt for verification.",
} as const;
