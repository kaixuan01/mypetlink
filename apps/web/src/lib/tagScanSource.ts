import type { TagScanSource } from "@/types";

export const tagScanSourceOptions: {
  label: string;
  value: TagScanSource | "";
}[] = [
  { label: "All scan sources", value: "" },
  { label: "QR scans", value: "Qr" },
  { label: "NFC taps", value: "Nfc" },
  { label: "Legacy links", value: "Legacy" },
  { label: "Unknown", value: "Unknown" },
];

export function tagScanSourceLabel(source: TagScanSource) {
  switch (source) {
    case "Qr":
      return "QR scan";
    case "Nfc":
      return "NFC tap";
    case "Legacy":
      return "Legacy link";
    default:
      return "Unknown source";
  }
}

export function normalizeTagScanSource(source: unknown): TagScanSource {
  if (typeof source !== "string") return "Unknown";
  const normalized = source.trim().toLowerCase();
  if (normalized === "qr") return "Qr";
  if (normalized === "nfc") return "Nfc";
  if (normalized === "legacy") return "Legacy";
  return "Unknown";
}

export function formatTagScanDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
