// Phase 1 manual payment settings. There is no payment gateway yet: owners pay
// via a merchant QR and submit a receipt / screenshot for manual
// verification. Keep merchant labels and copy here so they are not scattered
// across components.

export const paymentConfig = {
  phase: "manual" as const,
  merchantQrLabel: "DuitNow QR / TNG Merchant QR",
  // When a real merchant QR image is available, set its path here (e.g.
  // "/merchant-qr.png"). While empty, a polished placeholder card is shown.
  merchantQrImage: "",
  deliveryFee: "Free",
  supportText: "Contact MyPetLink support if you need help with payment proof.",
  instructions:
    "Scan the merchant QR code and pay the exact amount. After payment, upload your receipt or screenshot. You may also add the bank/eWallet transaction ID if available.",
} as const;
