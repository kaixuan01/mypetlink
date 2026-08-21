import { describe, expect, it } from "vitest";
import {
  getPetLifecycleActionExecution,
  getPetLifecycleActions,
  getPetLifecycleConfirmation,
} from "@/lib/petLifecycleActions";

describe("pet lifecycle actions", () => {
  it.each([
    [
      "Active",
      [
        { action: "memorial", label: "Move to Memorial" },
        { action: "archive", label: "Archive Pet" },
      ],
    ],
    [
      "Memorial",
      [
        { action: "active", label: "Restore to Active" },
        { action: "archive", label: "Archive Pet" },
      ],
    ],
    ["Archived", [{ action: "restore", label: "Restore to List" }]],
  ] as const)("offers only valid actions for %s pets", (status, expected) => {
    expect(getPetLifecycleActions({ lifecycleStatus: status })).toEqual(expected);
  });

  it.each([
    ["active", { kind: "update", status: "Active" }],
    ["memorial", { kind: "update", status: "Memorial" }],
    ["archive", { kind: "update", status: "Archived" }],
    ["restore", { kind: "restore" }],
  ] as const)("maps %s to its existing endpoint semantics", (action, expected) => {
    expect(getPetLifecycleActionExecution(action)).toEqual(expected);
  });

  it("provides the canonical confirmation copy", () => {
    expect(getPetLifecycleConfirmation("memorial", "Milo")).toEqual({
      title: "Move to Memorial?",
      message:
        "This keeps Milo's profile, memories, and timeline, but the Safety Profile will no longer show emergency finder contact actions.",
      confirmLabel: "Move to Memorial",
      cancelLabel: "Cancel",
    });
  });
});
