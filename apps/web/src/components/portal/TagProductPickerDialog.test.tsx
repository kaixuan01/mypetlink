// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TagProduct, TagProductVariant } from "@/services/tagCatalogService";
import { TagProductPickerDialog } from "./TagProductPickerDialog";

const baseVariant: TagProductVariant = {
  key: "PAWSOME-QR",
  sku: "INTERNAL-PAWSOME-QR",
  name: "Pawsome QR",
  supportsQr: true,
  supportsNfc: false,
  tagVariant: "Lightweight",
  material: "-",
  price: {
    basePrice: 19.9,
    discountAmount: 0,
    finalPrice: 19.9,
    currency: "MYR",
  },
  inStock: true,
  media: [],
};

const products: TagProduct[] = [
  {
    slug: "pawsome",
    name: "MyPetLink Pawsome Pet Tag",
    shortDescription: "A cheerful paw design.",
    media: [
      { url: "/media/pawsome-front.jpg", altText: "Pawsome tag front", sortOrder: 0 },
      { url: "/media/pawsome-back.jpg", altText: "Pawsome tag back", sortOrder: 1 },
    ],
    variants: [
      baseVariant,
      {
        ...baseVariant,
        key: "PAWSOME-NFC",
        sku: "INTERNAL-PAWSOME-NFC",
        name: "Pawsome QR and NFC",
        supportsNfc: true,
        price: {
          basePrice: 49.9,
          discountAmount: 10,
          finalPrice: 39.9,
          currency: "MYR",
          promotionLabel: "Save RM10",
        },
      },
    ],
  },
  {
    slug: "queen",
    name: "MyPetLink Queen Pet Tag",
    shortDescription: "",
    media: [],
    variants: [
      {
        ...baseVariant,
        key: "QUEEN-QR",
        sku: "INTERNAL-QUEEN-QR",
        name: "Queen QR",
      },
      {
        ...baseVariant,
        key: "QUEEN-NFC-UNAVAILABLE",
        sku: "INTERNAL-QUEEN-NFC",
        name: "Queen NFC unavailable",
        supportsNfc: true,
        inStock: false,
      },
    ],
  },
];

afterEach(cleanup);

describe("TagProductPickerDialog", () => {
  it("groups sellable SKUs by product, uses the primary image, and omits unavailable capabilities", () => {
    render(
      <TagProductPickerDialog
        lineLabel="Tag 1"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        products={products}
        selectedVariantKey="PAWSOME-QR"
      />
    );

    expect(screen.getByRole("dialog", { name: "Choose a tag" })).toBeTruthy();
    const pawsomeHeading = screen.getByRole("heading", { name: "Pawsome Pet Tag" });
    const pawsomeCard = pawsomeHeading.closest("article");
    expect(pawsomeCard).not.toBeNull();
    expect(within(pawsomeCard!).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { name: "Pawsome Pet Tag" })).toHaveLength(1);

    const primaryImage = screen.getByRole("img", { name: "Pawsome tag front" });
    expect(primaryImage.getAttribute("src")).toBe("/media/pawsome-front.jpg");
    expect(screen.queryByRole("img", { name: "Pawsome tag back" })).toBeNull();
    expect(screen.getByText("Product image coming soon")).toBeTruthy();

    expect(screen.getByRole("radio", { name: /Pawsome Pet Tag, Lightweight, QR, RM\s*19\.90/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Pawsome Pet Tag, Lightweight, QR \+ NFC, RM\s*39\.90/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Queen Pet Tag, Lightweight, QR, RM\s*19\.90/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Queen Pet Tag.*QR \+ NFC/ })).toBeNull();
    expect(screen.queryByText("INTERNAL-PAWSOME-QR")).toBeNull();
    expect(screen.queryByText("-")).toBeNull();
  });

  it("returns the exact authoritative variant key from a fully tappable option", () => {
    const onSelect = vi.fn();
    render(
      <TagProductPickerDialog
        lineLabel="Tag 1"
        onClose={vi.fn()}
        onSelect={onSelect}
        products={products}
        selectedVariantKey="PAWSOME-QR"
      />
    );

    const option = screen.getByRole("radio", { name: /Pawsome Pet Tag, Lightweight, QR \+ NFC, RM\s*39\.90/ });
    expect(option.tagName).toBe("BUTTON");
    expect((option as HTMLButtonElement).tabIndex).toBe(0);
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith("PAWSOME-NFC");
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">Choose a tag for Tag 1</button>
          {open ? (
            <TagProductPickerDialog
              lineLabel="Tag 1"
              onClose={() => setOpen(false)}
              onSelect={vi.fn()}
              products={products}
              selectedVariantKey="PAWSOME-QR"
            />
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Choose a tag for Tag 1" });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Close tag picker"));

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose a tag" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
