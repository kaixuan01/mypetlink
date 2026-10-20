import type * as api from "@/services/adminConsignmentService";
import { dateInputValue, endOfDayIso } from "./model";

// Default terms fill a new draft's form once; after that the form is the agreement's own.

type CommercialKey =
  | "partnerCommissionPercentage"
  | "durationTerms"
  | "settlementFrequency"
  | "paymentDeadlineDays"
  | "discountTerms"
  | "returnTerms"
  | "lossTerms";

const commercialKeys: CommercialKey[] = [
  "partnerCommissionPercentage",
  "durationTerms",
  "settlementFrequency",
  "paymentDeadlineDays",
  "discountTerms",
  "returnTerms",
  "lossTerms",
];

/** Copies the defaults into the commercial fields only. Dates and evidence stay as they are. */
export function applyDefaultTerms(form: api.AgreementInput, defaults: api.DefaultTermsValues): api.AgreementInput {
  const next = { ...form };
  for (const key of commercialKeys) (next as Record<CommercialKey, unknown>)[key] = defaults[key];
  return next;
}

/** True when the operator has changed any commercial field away from the defaults. */
export function differsFromDefaults(form: api.AgreementInput, defaults: api.DefaultTermsValues): boolean {
  return commercialKeys.some((key) => (form[key] ?? null) !== (defaults[key] ?? null));
}

/**
 * The last day of a trial that starts on `startIso` and lasts `days` calendar days, counting the
 * start day as day 1 (a 60-day trial from 1 Nov runs to the end of 30 Dec). Null without both.
 */
export function suggestedEndIso(startIso: string | null, days: number | null): string | null {
  if (!startIso || !days || days < 1) return null;
  const start = dateInputValue(startIso);
  if (!start) return null;
  const [y, m, d] = start.split("-").map(Number);
  const last = new Date(y, m - 1, d + days - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return endOfDayIso(`${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`);
}

/** Uppercase letters and numbers only, as the server stores a prefix. */
export function normalizePrefix(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function prefixProblem(prefix: string): string | null {
  if (prefix.length < 2 || prefix.length > 12) return "Use 2–12 letters and numbers.";
  if (!/^[A-Z]/.test(prefix)) return "Start with a letter.";
  return null;
}

export const emptyDefaultTerms: api.DefaultTermsValues = {
  partnerCommissionPercentage: null,
  trialDurationDays: null,
  durationTerms: null,
  settlementFrequency: null,
  paymentDeadlineDays: null,
  discountTerms: null,
  returnTerms: null,
  lossTerms: null,
};
