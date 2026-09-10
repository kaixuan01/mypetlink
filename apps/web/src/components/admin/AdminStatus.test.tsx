// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminStat, AdminStatusRow } from "./AdminStatus";

afterEach(cleanup);

describe("AdminStat semantic zero state", () => {
  it("mutes an explicitly zero formatted financial value", () => {
    render(
      <AdminStat
        isZero
        label="Outstanding invoice total"
        tone="warning"
        value="MYR 0.00"
      />
    );

    expect(screen.getByText("MYR 0.00").className).toContain("text-slate-300");
  });

  it("does not guess whether an arbitrary formatted string represents zero", () => {
    render(
      <AdminStat
        label="Outstanding invoice total"
        tone="warning"
        value="MYR 0.00"
      />
    );

    expect(screen.getByText("MYR 0.00").className).toContain("text-[#8a5a10]");
  });

  it("retains the requested tone for a non-zero financial value", () => {
    render(
      <AdminStat
        isZero={false}
        label="Payable commission"
        tone="info"
        value="MYR 75.00"
      />
    );

    expect(screen.getByText("MYR 75.00").className).toContain("text-[#1b4f9c]");
  });
});

describe("AdminStatusRow semantic zero state", () => {
  it("mutes an explicitly zero reference metric", () => {
    render(<AdminStatusRow isZero label="Lost Mode pets" tone="warning" value={0} />);

    expect(screen.getByText("0").className).toContain("text-slate-400");
  });

  it("retains the requested tone for a non-zero reference metric", () => {
    render(<AdminStatusRow label="Lost Mode pets" tone="warning" value={2} />);

    expect(screen.getByText("2").className).toContain("text-[#8a5a10]");
  });
});
