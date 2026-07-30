import { describe, expect, it } from "vitest";

import { getAdminOrderActions } from "./orders";

// These expectations mirror the server-side transition guards in
// AdminService (mark-preparing / mark-ready-to-ship / shipment / mark-shipped /
// mark-delivered). If the two ever drift, an admin either sees a control that
// fails, or loses one the API still supports.
describe("admin order actions across the manual shipping lifecycle", () => {
  it("offers tag assignment before a tag is attached", () => {
    expect(getAdminOrderActions({ status: "Payment Confirmed", tagId: undefined })).toContain("assign-tag");
    expect(getAdminOrderActions({ status: "Payment Confirmed", tagId: undefined })).not.toContain("mark-preparing");
  });

  it("offers preparation and a tag swap once a tag is assigned", () => {
    const actions = getAdminOrderActions({ status: "Payment Confirmed", tagId: "tag-1" });
    expect(actions).toContain("mark-preparing");
    expect(actions).toContain("change-tag");
  });

  it("offers ready-to-ship and shipment entry while preparing", () => {
    const actions = getAdminOrderActions({ status: "Preparing", tagId: "tag-1" });
    expect(actions).toContain("mark-ready-to-ship");
    expect(actions).toContain("edit-shipment");
    expect(actions).not.toContain("mark-shipped");
  });

  it("offers shipping once the order is ready to ship", () => {
    const actions = getAdminOrderActions({ status: "Ready to Ship", tagId: "tag-1" });
    expect(actions).toContain("edit-shipment");
    expect(actions).toContain("mark-shipped");
    expect(actions).toContain("change-tag");
    expect(actions).not.toContain("mark-delivered");
  });

  it("keeps shipment details editable after shipping so tracking typos can be corrected", () => {
    const actions = getAdminOrderActions({ status: "Shipped", tagId: "tag-1" });
    expect(actions).toContain("edit-shipment");
    expect(actions).toContain("mark-delivered");
    // After handover the tag can only be replaced, never swapped.
    expect(actions).toContain("replace-tag");
    expect(actions).not.toContain("change-tag");
  });

  it("stops offering delivery and cancellation once delivered", () => {
    const actions = getAdminOrderActions({ status: "Delivered", tagId: "tag-1" });
    expect(actions).not.toContain("mark-delivered");
    expect(actions).not.toContain("cancel-order");
    expect(actions).toContain("replace-tag");
  });

  it("offers nothing to progress a cancelled order", () => {
    const actions = getAdminOrderActions({ status: "Cancelled", tagId: "tag-1" });
    for (const blocked of ["mark-preparing", "mark-ready-to-ship", "mark-shipped", "mark-delivered", "edit-shipment"] as const) {
      expect(actions).not.toContain(blocked);
    }
  });
});
