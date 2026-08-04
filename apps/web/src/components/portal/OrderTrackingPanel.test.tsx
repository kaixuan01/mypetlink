// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MissingTrackingNumberNote,
  OrderTrackingPanel,
} from "./OrderTrackingPanel";
import type { OrderShipmentView } from "@/lib/orders";

const missingLinkText =
  "Tracking link is not available. Use this number on the courier’s website.";

function shipment(overrides: Partial<OrderShipmentView>): OrderShipmentView {
  return { visible: true, ...overrides };
}

afterEach(cleanup);

describe("owner tracking panel", () => {
  it("shows the tracking number and an explanation when no tracking link exists", () => {
    render(
      <OrderTrackingPanel
        shipment={shipment({
          courierName: "J&T Express",
          trackingNumber: "JT123456789MY",
        })}
      />
    );

    expect(screen.getByText("JT123456789MY")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy tracking number/i })).toBeTruthy();
    expect(screen.getByText(missingLinkText)).toBeTruthy();
    // Never a dead or disabled tracking control.
    expect(screen.queryByRole("link", { name: /track parcel/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /track parcel/i })).toBeNull();
  });

  it("offers the tracking link and drops the explanation when a link exists", () => {
    render(
      <OrderTrackingPanel
        shipment={shipment({
          courierName: "J&T Express",
          trackingNumber: "JT123456789MY",
          trackingUrl: "https://www.jtexpress.my/track?no=JT123456789MY",
        })}
      />
    );

    const link = screen.getByRole("link", { name: /track parcel/i });
    expect(link.getAttribute("href")).toBe(
      "https://www.jtexpress.my/track?no=JT123456789MY"
    );
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("button", { name: /copy tracking number/i })).toBeTruthy();
    expect(screen.queryByText(missingLinkText)).toBeNull();
  });

  it("renders nothing before the parcel has shipped, even with courier data present", () => {
    const { container } = render(
      <OrderTrackingPanel
        shipment={{ visible: false, trackingNumber: "JT123456789MY" }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("lets a long tracking number wrap so it can never widen or clip the card", () => {
    render(
      <OrderTrackingPanel
        shipment={shipment({ trackingNumber: "JT9999999999999999999999999MY" })}
      />
    );

    const value = screen.getByText("JT9999999999999999999999999MY");
    expect(value.className).toContain("break-all");
    expect(value.className).not.toContain("truncate");
  });
});

describe("missing tracking number note", () => {
  it("explains a shipped order whose number has not been recorded yet", () => {
    render(<MissingTrackingNumberNote shipment={shipment({ courierName: "J&T Express" })} />);

    expect(screen.getByText("Tracking number has not been added yet.")).toBeTruthy();
  });

  it("stays silent when a number exists or the order has not shipped", () => {
    const withNumber = render(
      <MissingTrackingNumberNote
        shipment={shipment({ trackingNumber: "JT123456789MY" })}
      />
    );
    expect(withNumber.container.firstChild).toBeNull();
    cleanup();

    const notShipped = render(
      <MissingTrackingNumberNote shipment={{ visible: false }} />
    );
    expect(notShipped.container.firstChild).toBeNull();
  });
});
