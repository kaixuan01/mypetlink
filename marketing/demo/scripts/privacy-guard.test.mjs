import assert from "node:assert/strict";
import test from "node:test";
import { detectPrivateText } from "./privacy-guard.mjs";

// What the marketing demo is expected to show, and nothing else.
const allowed = ["+601110000000", "+60 11-1000 0000", "support@mypetlink.com.my"];

const blocks = (text) => detectPrivateText(text, allowed).length > 0;

test("lets the seeded demo number through however it is written", () => {
  assert.equal(blocks("WhatsApp Owner +60 11-1000 0000"), false);
  assert.equal(blocks("+60-11-1000-0000"), false);
  assert.equal(blocks("601110000000"), false);
});

test("lets the published support address through", () => {
  assert.equal(blocks("Questions? support@mypetlink.com.my"), false);
  assert.equal(blocks("SUPPORT@MyPetLink.com.my"), false);
});

test("stops a Malaysian mobile written with a space after the country code", () => {
  // The spelling a page most often renders, and the one an over-strict pattern
  // misses.
  assert.equal(blocks("Call the owner on +60 12-345 6789"), true);
});

test("stops a Malaysian mobile in its other spellings", () => {
  assert.equal(blocks("+60123456789"), true);
  assert.equal(blocks("0123456789"), true);
  assert.equal(blocks("012-345 6789"), true);
});

test("stops the development walkthrough fixtures, which are not the demo", () => {
  // A capture pointed at the wrong database would put these on screen.
  assert.equal(blocks("WhatsApp +60123456789"), true);
});

test("stops any email address that is not the support one", () => {
  assert.equal(blocks("Contact siti.rahman@gmail.com"), true);
  assert.equal(blocks("owner@example.com"), true);
});

test("passes a clean brand page", () => {
  assert.equal(
    blocks(
      "MyPetLink @mypetlink Helping pets stay identifiable, safer and connected. "
        + "Linko Cat - Domestic Shorthair Kuala Lumpur Found Linko? WhatsApp Owner",
    ),
    false,
  );
});

test("names what it found, so a failed capture is actionable", () => {
  const findings = detectPrivateText("reach me on 012-345 6789 or a@b.com", allowed);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((finding) => finding.includes("a@b.com")));
  assert.ok(findings.some((finding) => finding.includes("012-345 6789")));
});

test("an empty allowlist permits nothing", () => {
  assert.equal(detectPrivateText("+60 11-1000 0000", []).length, 1);
});
