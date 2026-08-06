// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AllocationProgress,
  FulfilmentStatusBadge,
  batchSummaryText,
  fulfilmentStatusLabel,
} from "./shared";

afterEach(cleanup);

describe("Allocation progress", () => {
  it("reads as nothing allocated before any tag is held", () => {
    render(<AllocationProgress allocated={0} required={125} />);

    expect(screen.getByText("0 / 125 allocated")).toBeTruthy();
    expect(screen.getByText("125 remaining")).toBeTruthy();

    const meter = screen.getByRole("progressbar");
    expect(meter.getAttribute("aria-valuenow")).toBe("0");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("125");
  });

  it("reads as partly allocated part way through", () => {
    render(<AllocationProgress allocated={40} required={125} />);

    expect(screen.getByText("40 / 125 allocated")).toBeTruthy();
    expect(screen.getByText("85 remaining")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "40 of 125 allocated, 85 remaining"
    );
  });

  it("says fully allocated in words, not only by colour", () => {
    render(<AllocationProgress allocated={125} required={125} />);

    expect(screen.getByText("125 / 125 allocated")).toBeTruthy();
    // Completion is a sentence a screen reader reads, not a green bar.
    expect(screen.getByText("Fully allocated")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "125 of 125 allocated, 0 remaining"
    );
  });

  it("clamps a count that somehow exceeds the order rather than reading over 100%", () => {
    render(<AllocationProgress allocated={200} required={125} />);

    expect(screen.getByText("125 / 125 allocated")).toBeTruthy();
    const meter = screen.getByRole("progressbar");
    expect(meter.getAttribute("aria-valuenow")).toBe("125");
    expect(Number(meter.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(
      Number(meter.getAttribute("aria-valuemax"))
    );
    expect((meter.firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("treats a negative count as none rather than rendering below zero", () => {
    render(<AllocationProgress allocated={-5} required={10} />);

    expect(screen.getByText("0 / 10 allocated")).toBeTruthy();
    expect((screen.getByRole("progressbar").firstElementChild as HTMLElement).style.width).toBe(
      "0%"
    );
  });

  it("survives an order with nothing to allocate without dividing by zero", () => {
    render(<AllocationProgress allocated={0} required={0} />);

    expect(screen.getByText("0 / 0 allocated")).toBeTruthy();
    const meter = screen.getByRole("progressbar");
    expect(meter.getAttribute("aria-valuemax")).toBe("0");
    expect((meter.firstElementChild as HTMLElement).style.width).toBe("0%");
    // Zero of zero is not "fully allocated"; there is simply nothing to do.
    expect(screen.getByText("0 remaining")).toBeTruthy();
  });

  it("names what the meter is measuring", () => {
    render(<AllocationProgress allocated={3} label="WS-QR-0001 allocation" required={10} />);

    expect(
      screen.getByRole("progressbar").getAttribute("aria-label")
    ).toBe("WS-QR-0001 allocation: 3 of 10 tags allocated");
  });
});

describe("Fulfilment status", () => {
  it("uses operator wording rather than the stored value", () => {
    expect(fulfilmentStatusLabel("NotStarted")).toBe("Not started");
    expect(fulfilmentStatusLabel("ReadyToShip")).toBe("Ready to ship");
    expect(fulfilmentStatusLabel("Preparing")).toBe("Preparing");
    expect(fulfilmentStatusLabel("Shipped")).toBe("Shipped");
    expect(fulfilmentStatusLabel("Delivered")).toBe("Delivered");
  });

  it("carries the state in text, so colour is never the only signal", () => {
    const { rerender } = render(<FulfilmentStatusBadge status="NotStarted" />);
    expect(screen.getByText("Not started")).toBeTruthy();

    rerender(<FulfilmentStatusBadge status="Preparing" />);
    expect(screen.getByText("Preparing")).toBeTruthy();

    rerender(<FulfilmentStatusBadge status="Delivered" />);
    expect(screen.getByText("Delivered")).toBeTruthy();
  });
});

describe("Batch summary", () => {
  it("lists each batch and its count", () => {
    expect(
      batchSummaryText([
        { batchNo: "B-2601", quantity: 50 },
        { batchNo: "B-2602", quantity: 25 },
      ])
    ).toBe("B-2601 × 50 · B-2602 × 25");
  });

  it("shows a dash rather than an empty cell when nothing is allocated", () => {
    expect(batchSummaryText([])).toBe("—");
  });
});
