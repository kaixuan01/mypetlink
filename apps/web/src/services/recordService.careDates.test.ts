import { describe, expect, it } from "vitest";
import { buildBackendRecordPayload } from "./recordService";

describe("care record date request mapping", () => {
  it("preserves the existing API date properties", () => {
    expect(
      buildBackendRecordPayload({
        type: "Grooming",
        date: "15 Jul 2026",
        dueDate: "15 Aug 2026",
      })
    ).toMatchObject({
      type: "Grooming",
      date: "2026-07-15",
      dueDate: "2026-08-15",
    });
  });

  it("marks an explicitly cleared next date on update", () => {
    expect(
      buildBackendRecordPayload(
        { dueDate: undefined },
        { allowDueDateClear: true }
      )
    ).toMatchObject({ dueDate: null, clearDueDate: true });
  });

  it("does not clear the next date for an unrelated partial update", () => {
    const payload = buildBackendRecordPayload(
      { title: "Updated title" },
      { allowDueDateClear: true }
    );

    expect(payload).not.toHaveProperty("clearDueDate");
  });
});
