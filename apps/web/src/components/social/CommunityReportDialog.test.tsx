// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), block: vi.fn() }));
vi.mock("@/services/communityReportService", async () => {
  const actual = await vi.importActual<typeof import("@/services/communityReportService")>("@/services/communityReportService");
  return { ...actual, submitCommunityReport: (...args: unknown[]) => mocks.submit(...args) };
});
vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<typeof import("@/services/socialGraphService")>("@/services/socialGraphService");
  return { ...actual, blockOwner: (...args: unknown[]) => mocks.block(...args) };
});

import { CommunityReportDialog } from "@/components/social/CommunityReportDialog";
import { CommunityReportError, reportReasons } from "@/services/communityReportService";

const report = { type: "comment" as const, target: "comment-id", household: { handle: "limfamily", displayName: "Lim Family" } };
function show(overrides = {}) {
  const onClose = vi.fn();
  const onBlocked = vi.fn();
  render(<CommunityReportDialog onBlocked={onBlocked} onClose={onClose} open report={{ ...report, ...overrides }} />);
  return { onClose, onBlocked };
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "Submit report" })); }

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Community report dialog", () => {
  it("shows the seven exact reasons, comment context, and a focusable radio group", () => {
    show();
    expect(screen.getByRole("dialog").getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText(/Comment by Lim Family/)).toBeTruthy();
    for (const item of reportReasons) expect(screen.getByRole("radio", { name: item.label })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Spam or scam" }));
  });

  it("requires a reason and details for Other without deleting typed details", async () => {
    show();
    submit();
    expect(screen.getByRole("alert").textContent).toContain("Choose a reason");
    fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
    submit();
    expect(screen.getByRole("alert").textContent).toContain("Add details");
    const field = screen.getByRole("textbox", { name: "Add details (optional)" }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "🐶 concern" } });
    fireEvent.click(screen.getByRole("radio", { name: "Privacy concern" }));
    expect(field.value).toBe("🐶 concern");
    mocks.submit.mockResolvedValue(undefined);
    submit();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({ targetType: "comment", target: "comment-id", reason: "PrivacyConcern", details: "🐶 concern" }));
  });

  it("caps details at 500 characters and shows the counter near the limit", () => {
    show();
    const field = screen.getByRole("textbox", { name: "Add details (optional)" }) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(500);
    fireEvent.change(field, { target: { value: "a".repeat(500) } });
    expect(screen.getByText("500 / 500")).toBeTruthy();
  });

  it("keeps form state and prevents a second request while sending", async () => {
    let resolve!: () => void;
    mocks.submit.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Spam or scam" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a detail" } });
    submit();
    expect(screen.getByRole("button", { name: "Sending…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Sending report");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    resolve();
    await screen.findByText("Reports are private.");
  });

  it("shows the same private confirmation for any accepted response, then Done", async () => {
    mocks.submit.mockResolvedValue(undefined);
    const { onClose } = show();
    fireEvent.click(screen.getByRole("radio", { name: "Impersonation" }));
    submit();
    await screen.findByText("Reports are private.");
    expect(screen.queryByText(/already reported|report id|moderation status/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    ["unavailable", "This content is no longer available."],
    ["own", "You can’t report your own content."],
    ["profile", "Set up your Community profile to send a report."],
    ["restricted", "Reporting isn’t available for this account right now."],
  ] as const)("handles %s without showing a technical code", async (reason, message) => {
    mocks.submit.mockRejectedValue(new CommunityReportError(reason, message));
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Spam or scam" }));
    submit();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(reason)).toBeNull();
  });

  it("keeps the current Community page as the sign-in return after an expired session", async () => {
    window.history.replaceState({}, "", "/moments/moment-id?from=feed");
    mocks.submit.mockRejectedValue(new CommunityReportError("session", "Sign in to send a report."));
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Spam or scam" }));
    submit();
    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/login?redirect=%2Fmoments%2Fmoment-id%3Ffrom%3Dfeed");
  });

  it.each(["rate-limit", "error"] as const)("preserves the form after %s", async (reason) => {
    mocks.submit.mockRejectedValueOnce(new CommunityReportError(reason, reason === "rate-limit" ? "You’ve sent several reports recently. Please try again later." : "Couldn’t send report. Please try again."));
    show();
    fireEvent.click(screen.getByRole("radio", { name: "Animal welfare concern" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Need review 🐕" } });
    submit();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Need review 🐕");
    expect((screen.getByRole("radio", { name: "Animal welfare concern" }) as HTMLInputElement).checked).toBe(true);
  });

  it("offers a separate confirmed Block after reporting", async () => {
    mocks.submit.mockResolvedValue(undefined);
    mocks.block.mockResolvedValue({ hasBlocked: true });
    const { onBlocked } = show();
    fireEvent.click(screen.getByRole("radio", { name: "Spam or scam" }));
    submit();
    await screen.findByText("Reports are private.");
    expect(mocks.block).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Block Lim Family" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(mocks.block).toHaveBeenCalledWith("limfamily"));
    expect(onBlocked).toHaveBeenCalled();
    expect(await screen.findByText("Household blocked.")).toBeTruthy();
  });
});
