// Phase 1 manual payment settings. There is no payment gateway yet: owners pay
// via a merchant QR and submit their payment reference / receipt for manual
// verification. Keep merchant labels and copy here so they are not scattered
// across components.

export const paymentConfig = {
  phase: "manual" as const,
  merchantQrLabel: "DuitNow QR / TNG Merchant QR",
  // When a real merchant QR image is available, set its path here (e.g.
  // "/merchant-qr.png"). While empty, a polished placeholder card is shown.
  merchantQrImage: "",
  deliveryFee: "Free",
  supportText: "Send us your payment reference if you need help.",
  instructions:
    "Scan the merchant QR code and pay the exact amount. After payment, enter your payment reference or upload a receipt so we can verify your order.",
} as const;
