// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMerchantDraftGuard } from "./useMerchantDraftGuard";

const leave = vi.fn();
function Harness() {
  const guard = useMerchantDraftGuard();
  return <><button onClick={() => guard.onDirtyChange(true)}>Edit merchant</button><button onClick={() => guard.navigate(leave)}>Switch merchant</button>
    <a href="/admin/orders">Orders</a><ConfirmDialog open={guard.pending !== null} title="Discard changes?" message="Keep editing or discard." confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={guard.cancel} onConfirm={guard.discard} /></>;
}
beforeEach(() => { leave.mockReset(); window.history.replaceState(null, "", "/admin/merchant-sales?open=first"); });
afterEach(cleanup);
it("guards switching merchants and permits only explicit discard", () => {
  render(<Harness />); fireEvent.click(screen.getByText("Edit merchant")); fireEvent.click(screen.getByText("Switch merchant"));
  expect(leave).not.toHaveBeenCalled(); fireEvent.click(screen.getByText("Keep editing")); expect(leave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Switch merchant")); fireEvent.click(screen.getByText("Discard changes")); expect(leave).toHaveBeenCalledOnce();
});
it("protects reload and link navigation while dirty", () => {
  render(<Harness />); fireEvent.click(screen.getByText("Edit merchant"));
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByText("Orders")); expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByText("Keep editing")); expect(window.location.pathname).toBe("/admin/merchant-sales");
});
it("retains the current merchant on Back until discard is confirmed", () => {
  render(<Harness />); fireEvent.click(screen.getByText("Edit merchant"));
  window.history.replaceState(null, "", "/admin/merchant-sales?open=second"); fireEvent(window, new PopStateEvent("popstate"));
  expect(window.location.search).toBe("?open=first"); fireEvent.click(screen.getByText("Keep editing")); expect(window.location.search).toBe("?open=first");
  window.history.replaceState(null, "", "/admin/merchant-sales?open=second"); fireEvent(window, new PopStateEvent("popstate"));
  fireEvent.click(screen.getByText("Discard changes")); expect(window.location.search).toBe("?open=second");
});
it("allows list filters to change without discarding the selected merchant draft", () => {
  render(<Harness />); fireEvent.click(screen.getByText("Edit merchant"));
  window.history.replaceState(null, "", "/admin/merchant-sales?open=first&search=Pets"); fireEvent(window, new PopStateEvent("popstate"));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(window.location.search).toContain("search=Pets");
  fireEvent.click(screen.getByText("Switch merchant")); expect(screen.getByRole("dialog")).toBeTruthy();
});
it("protects the current draft after navigation that does not dispatch popstate", () => {
  render(<Harness />);
  window.history.pushState(null, "", "/admin/merchant-sales?open=second");
  fireEvent.click(screen.getByText("Edit merchant"));
  window.history.replaceState(null, "", "/admin/merchant-sales?open=first"); fireEvent(window, new PopStateEvent("popstate"));
  expect(window.location.search).toBe("?open=second");
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByText("Keep editing"));
  expect(window.location.search).toBe("?open=second");
});
