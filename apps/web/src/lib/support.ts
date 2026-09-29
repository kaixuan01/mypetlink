import { siteConfig } from "@/config/site";

/**
 * A `mailto:` link to MyPetLink Support, optionally pre-filled.
 *
 * The address comes from `siteConfig`, the one place the site keeps it, so a
 * page that needs a support action never writes the address a second time.
 * The subject and body only save the sender some typing; nothing depends on
 * them arriving unedited.
 */
export function supportMailtoHref(prefill: { subject?: string; body?: string } = {}) {
  const params = [
    prefill.subject ? `subject=${encodeURIComponent(prefill.subject)}` : "",
    prefill.body ? `body=${encodeURIComponent(prefill.body)}` : "",
  ].filter(Boolean);

  return `mailto:${siteConfig.supportEmail}${params.length ? `?${params.join("&")}` : ""}`;
}
