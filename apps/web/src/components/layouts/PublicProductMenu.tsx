"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { productNav } from "@/components/layouts/PublicNav";
import { Icon } from "@/components/ui/Icon";
import { useDismissableMenu } from "@/lib/useDismissableMenu";

/**
 * The Product group in the public header.
 *
 * A menu, not a hover card. Hover-only menus cannot be opened from a keyboard
 * and behave badly on a touch screen, where the first tap becomes a hover the
 * reader never asked for — so this opens on click and on Enter or Space like
 * the button it is.
 *
 * Four links and nothing else. A mega-menu would put the product's whole story
 * in a panel nobody reads; the job here is only to stop four pages competing
 * with Community and Pricing at the top level.
 */
export function PublicProductMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = `product-menu-${useId()}`;

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useDismissableMenu({ menuRef, onClose: close, open, triggerRef });

  return (
    <div className="relative">
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-pet-muted transition hover:text-pet-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pet-teal"
        data-testid="product-menu-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        Product
        <Icon
          aria-hidden="true"
          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
          name="chevron"
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+0.75rem)] z-50 grid w-56 gap-0.5 rounded-[1.25rem] border border-pet-border bg-white p-2 shadow-xl shadow-[#0d1b3d]/10"
          data-testid="product-menu"
          id={menuId}
          ref={menuRef}
          role="menu"
        >
          {productNav.map((item) => (
            <Link
              className="flex min-h-11 items-center rounded-[0.875rem] px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-cream hover:text-pet-teal focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pet-teal"
              href={item.href}
              key={item.href}
              onClick={() => close(false)}
              role="menuitem"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
