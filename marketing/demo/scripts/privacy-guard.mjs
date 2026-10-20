/**
 * The check that decides whether a recording is safe to publish.
 *
 * It runs against the page text before and after every captured scene. Its job
 * is not to be clever about what a phone number is — it is to make the capture
 * fail loudly the moment something that looks like a person's contact details
 * appears in shot, because these clips go to Instagram, TikTok and Facebook and
 * nobody reviews them frame by frame.
 *
 * Lives in its own module so it can be tested directly. See `privacy-guard.test.mjs`.
 */

/**
 * Malaysian mobile numbers, in the spellings a page actually renders.
 *
 * The separator after the country code is optional on purpose: "+60 12-345
 * 6789" is how one is normally written, and a pattern that demands the digits
 * run straight on from "60" walks past the most common spelling of the exact
 * thing it is meant to catch.
 */
const MalaysianMobile = /(?:\+?60[-\s]?|0)1\d[-\s]?\d{3,4}[-\s]?\d{4}\b/g;

const EmailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const digitsOnly = (value) => value.replace(/\D/g, "");

/**
 * Contact-shaped text in `text`, minus the values this demo is known to carry.
 *
 * `allowedContact` is a list of exact values, never a relaxed pattern: the
 * seeded demo number and the published support address are permitted, and every
 * other number and address still stops the recording. Switching the guard off
 * for a marketing run would disable the one check that matters most on the
 * material that actually gets published.
 *
 * Phone numbers are compared on their digits alone, so the permitted number is
 * recognised however the page spaces or punctuates it. Emails are compared
 * case-insensitively and otherwise exactly.
 *
 * @param {string} text Visible page text.
 * @param {string[]} allowedContact Exact values this demo is expected to show.
 * @returns {string[]} Human-readable findings; empty means nothing was found.
 */
export function detectPrivateText(text, allowedContact = []) {
  const allowedPhones = new Set(allowedContact.map(digitsOnly).filter(Boolean));
  const allowedEmails = new Set(allowedContact.map((value) => value.toLowerCase()));
  const findings = [];

  const emails = (text.match(EmailAddress) ?? []).filter(
    (email) => !allowedEmails.has(email.toLowerCase()),
  );
  const phones = (text.match(MalaysianMobile) ?? []).filter(
    (phone) => !allowedPhones.has(digitsOnly(phone)),
  );

  if (emails.length) findings.push(`email-like value(s): ${[...new Set(emails)].join(", ")}`);
  if (phones.length) findings.push(`phone-like value(s): ${[...new Set(phones)].join(", ")}`);
  return findings;
}
