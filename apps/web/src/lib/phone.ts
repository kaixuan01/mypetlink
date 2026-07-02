// Shared phone-number utilities for MyPetLink.
//
// All phone and WhatsApp numbers in the app are stored as a single E.164
// string (for example "+60123456789"). The PhoneNumberInput component reads
// and writes that string; these helpers parse it for editing and build the
// WhatsApp / call links shown on public profiles.

export type Country = {
  name: string;
  iso2: string;
  dialCode: string; // includes the leading "+", e.g. "+60"
  flag: string; // emoji flag
};

export type PhoneValue = {
  countryCode: string; // e.g. "+60"
  nationalNumber: string; // e.g. "123456789" (no leading zero)
  e164: string; // e.g. "+60123456789"
};

export const DEFAULT_DIAL_CODE = "+60";

// Common countries first (South-East Asia + key markets), then a wider list.
// Searchable by name or dial code in the selector.
export const COUNTRIES: Country[] = [
  { name: "Malaysia", iso2: "MY", dialCode: "+60", flag: "🇲🇾" },
  { name: "Singapore", iso2: "SG", dialCode: "+65", flag: "🇸🇬" },
  { name: "Indonesia", iso2: "ID", dialCode: "+62", flag: "🇮🇩" },
  { name: "Thailand", iso2: "TH", dialCode: "+66", flag: "🇹🇭" },
  { name: "Philippines", iso2: "PH", dialCode: "+63", flag: "🇵🇭" },
  { name: "Vietnam", iso2: "VN", dialCode: "+84", flag: "🇻🇳" },
  { name: "Brunei", iso2: "BN", dialCode: "+673", flag: "🇧🇳" },
  { name: "Cambodia", iso2: "KH", dialCode: "+855", flag: "🇰🇭" },
  { name: "Myanmar", iso2: "MM", dialCode: "+95", flag: "🇲🇲" },
  { name: "Laos", iso2: "LA", dialCode: "+856", flag: "🇱🇦" },
  { name: "China", iso2: "CN", dialCode: "+86", flag: "🇨🇳" },
  { name: "Hong Kong", iso2: "HK", dialCode: "+852", flag: "🇭🇰" },
  { name: "Macau", iso2: "MO", dialCode: "+853", flag: "🇲🇴" },
  { name: "Taiwan", iso2: "TW", dialCode: "+886", flag: "🇹🇼" },
  { name: "Japan", iso2: "JP", dialCode: "+81", flag: "🇯🇵" },
  { name: "South Korea", iso2: "KR", dialCode: "+82", flag: "🇰🇷" },
  { name: "India", iso2: "IN", dialCode: "+91", flag: "🇮🇳" },
  { name: "Pakistan", iso2: "PK", dialCode: "+92", flag: "🇵🇰" },
  { name: "Bangladesh", iso2: "BD", dialCode: "+880", flag: "🇧🇩" },
  { name: "Sri Lanka", iso2: "LK", dialCode: "+94", flag: "🇱🇰" },
  { name: "Nepal", iso2: "NP", dialCode: "+977", flag: "🇳🇵" },
  { name: "Australia", iso2: "AU", dialCode: "+61", flag: "🇦🇺" },
  { name: "New Zealand", iso2: "NZ", dialCode: "+64", flag: "🇳🇿" },
  { name: "United Kingdom", iso2: "GB", dialCode: "+44", flag: "🇬🇧" },
  { name: "Ireland", iso2: "IE", dialCode: "+353", flag: "🇮🇪" },
  { name: "United States", iso2: "US", dialCode: "+1", flag: "🇺🇸" },
  { name: "Canada", iso2: "CA", dialCode: "+1", flag: "🇨🇦" },
  { name: "Germany", iso2: "DE", dialCode: "+49", flag: "🇩🇪" },
  { name: "France", iso2: "FR", dialCode: "+33", flag: "🇫🇷" },
  { name: "Netherlands", iso2: "NL", dialCode: "+31", flag: "🇳🇱" },
  { name: "Spain", iso2: "ES", dialCode: "+34", flag: "🇪🇸" },
  { name: "Italy", iso2: "IT", dialCode: "+39", flag: "🇮🇹" },
  { name: "Portugal", iso2: "PT", dialCode: "+351", flag: "🇵🇹" },
  { name: "Switzerland", iso2: "CH", dialCode: "+41", flag: "🇨🇭" },
  { name: "Sweden", iso2: "SE", dialCode: "+46", flag: "🇸🇪" },
  { name: "Norway", iso2: "NO", dialCode: "+47", flag: "🇳🇴" },
  { name: "Denmark", iso2: "DK", dialCode: "+45", flag: "🇩🇰" },
  { name: "Finland", iso2: "FI", dialCode: "+358", flag: "🇫🇮" },
  { name: "Poland", iso2: "PL", dialCode: "+48", flag: "🇵🇱" },
  { name: "United Arab Emirates", iso2: "AE", dialCode: "+971", flag: "🇦🇪" },
  { name: "Saudi Arabia", iso2: "SA", dialCode: "+966", flag: "🇸🇦" },
  { name: "Qatar", iso2: "QA", dialCode: "+974", flag: "🇶🇦" },
  { name: "Turkey", iso2: "TR", dialCode: "+90", flag: "🇹🇷" },
  { name: "South Africa", iso2: "ZA", dialCode: "+27", flag: "🇿🇦" },
  { name: "Egypt", iso2: "EG", dialCode: "+20", flag: "🇪🇬" },
  { name: "Nigeria", iso2: "NG", dialCode: "+234", flag: "🇳🇬" },
  { name: "Brazil", iso2: "BR", dialCode: "+55", flag: "🇧🇷" },
  { name: "Mexico", iso2: "MX", dialCode: "+52", flag: "🇲🇽" },
];

export const DEFAULT_COUNTRY =
  COUNTRIES.find((country) => country.dialCode === DEFAULT_DIAL_CODE) ??
  COUNTRIES[0];

// Dial codes sorted longest-first so "+852" wins over "+85" / "+8" when parsing.
const DIAL_CODES_BY_LENGTH = [...new Set(COUNTRIES.map((c) => c.dialCode))].sort(
  (a, b) => b.length - a.length
);

/** Keep digits only, then drop any leading zeros (national trunk prefix). */
export function normalizeNationalNumber(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

/** Return the first country registered for a dial code (e.g. "+1" -> US). */
export function findCountryByDialCode(dialCode: string): Country | undefined {
  return COUNTRIES.find((country) => country.dialCode === dialCode);
}

/**
 * Build an E.164 string from a dial code and a national number.
 * Leading zeros on the national number are removed so we never store a
 * duplicate trunk prefix after the country code.
 */
export function toE164(dialCode: string, nationalNumber: string): string {
  const national = normalizeNationalNumber(nationalNumber);
  if (!national) {
    return "";
  }
  return `${dialCode}${national}`;
}

/**
 * Parse a stored value (E.164, "60123...", "0123..." or messy input) into its
 * country code + national parts. Falls back to the default country when no
 * dial code can be confidently detected.
 */
export function parsePhone(raw: string | undefined | null): PhoneValue {
  const cleaned = (raw ?? "").replace(/[^\d+]/g, "");

  if (!cleaned) {
    return {
      countryCode: DEFAULT_DIAL_CODE,
      nationalNumber: "",
      e164: "",
    };
  }

  // Normalise to a leading "+" so dial-code matching is consistent.
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;

  for (const dialCode of DIAL_CODES_BY_LENGTH) {
    if (withPlus.startsWith(dialCode) && withPlus.length > dialCode.length) {
      const nationalNumber = normalizeNationalNumber(
        withPlus.slice(dialCode.length)
      );
      return {
        countryCode: dialCode,
        nationalNumber,
        e164: toE164(dialCode, nationalNumber),
      };
    }
  }

  // No known dial code: treat the digits as a national number under default.
  const nationalNumber = normalizeNationalNumber(withPlus);
  return {
    countryCode: DEFAULT_DIAL_CODE,
    nationalNumber,
    e164: toE164(DEFAULT_DIAL_CODE, nationalNumber),
  };
}

/** Normalise any stored phone string to a clean E.164 string (or ""). */
export function normalizeStoredPhone(raw: string | undefined | null): string {
  return parsePhone(raw).e164;
}

/** A national number is valid when it is 6–14 digits (E.164 allows max 15 total). */
export function isValidNationalNumber(nationalNumber: string): boolean {
  const digits = nationalNumber.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 14;
}

/** Validate a full E.164 string. */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}

/**
 * WhatsApp deep link. wa.me requires the number without the leading "+".
 * Example: "+60123456789" -> "https://wa.me/60123456789".
 */
export function getWhatsAppLink(e164: string, message?: string): string {
  const phone = e164.replace(/[^\d]/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phone}${query}`;
}

/** Telephone link in E.164 format, e.g. "tel:+60123456789". */
export function getCallLink(e164: string): string {
  const normalized = normalizeStoredPhone(e164);
  return `tel:${normalized}`;
}
