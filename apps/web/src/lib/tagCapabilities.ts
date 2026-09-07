// How a physical tag can be opened, in one place.
//
// MyPetLink sells one physical tag: the QR + NFC Smart Tag. A SKU that cannot
// be both scanned and tapped is a tag we no longer sell, so it is never offered
// for a new order, quotation, or production run. Tags made before that decision
// keep working, and their inventory and order history stay readable — this is a
// rule about new commitments only. It mirrors the same rule the service
// enforces, so the two never disagree about what may be sold.

export type TagCapabilities = {
  supportsQr: boolean;
  supportsNfc: boolean;
};

export function isSellableTagCapability(capabilities: TagCapabilities) {
  return capabilities.supportsQr && capabilities.supportsNfc;
}

export function tagCapabilityLabel(capabilities: TagCapabilities) {
  if (capabilities.supportsQr && capabilities.supportsNfc) {
    return "QR scan and NFC tap";
  }
  if (capabilities.supportsNfc) return "NFC tap only";
  return "QR scan only (no longer sold)";
}
