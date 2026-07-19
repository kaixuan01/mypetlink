"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";

export type AdminRowAction = {
  label: string;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
};

// Only one row menu may be open at a time across every admin listing. Opening
// a menu closes whichever one registered here before it.
let closeOpenRowMenu: (() => void) | null = null;

const MENU_WIDTH = 224; // Tailwind w-56
const VIEWPORT_GAP = 8;
const TRIGGER_GAP = 4;

type MenuPlacement = {
  top: number;
  left: number;
  maxHeight: number;
};

// Right-align the menu to its trigger, keep it inside the viewport
// horizontally, and flip it above the trigger when the row is near the bottom
// of the screen. Only the menu itself scrolls when space is tight.
function placeMenu(trigger: HTMLElement, menu: HTMLElement): MenuPlacement {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const menuHeight = menu.scrollHeight;

  const left = Math.max(
    VIEWPORT_GAP,
    Math.min(rect.right - MENU_WIDTH, viewportWidth - MENU_WIDTH - VIEWPORT_GAP)
  );

  const spaceBelow = viewportHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_GAP;
  const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_GAP;
  const openUp = menuHeight > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(48, openUp ? spaceAbove : spaceBelow);
  const height = Math.min(menuHeight, maxHeight);
  const top = openUp
    ? Math.max(VIEWPORT_GAP, rect.top - TRIGGER_GAP - height)
    : rect.bottom + TRIGGER_GAP;

  return { top, left, maxHeight };
}

// The open menu is rendered through a portal to document.body with fixed
// positioning, so it floats above the table and the surrounding cards instead
// of stretching the table's overflow container (which used to add a second
// vertical scrollbar and clip the menu for bottom rows).
export function AdminRowActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: AdminRowAction[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const registeredCloseRef = useRef<(() => void) | null>(null);
  const focusFirstOnOpenRef = useRef(false);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);

  const releaseRegistration = useCallback(() => {
    if (closeOpenRowMenu === registeredCloseRef.current) {
      closeOpenRowMenu = null;
    }

    registeredCloseRef.current = null;
  }, []);

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      releaseRegistration();
      setOpen(false);
      setPlacement(null);

      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    },
    [releaseRegistration]
  );

  const openMenu = useCallback((focusFirstItem: boolean) => {
    closeOpenRowMenu?.();
    const myClose = () => {
      setOpen(false);
      setPlacement(null);
    };
    registeredCloseRef.current = myClose;
    closeOpenRowMenu = myClose;
    focusFirstOnOpenRef.current = focusFirstItem;
    setOpen(true);
  }, []);

  // Position after the portal renders so the menu height can be measured.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const trigger = triggerRef.current;
    const menu = menuRef.current;

    if (trigger && menu) {
      setPlacement(placeMenu(trigger, menu));
    }
  }, [open, actions.length]);

  // Keyboard-opened menus focus their first item, but only once the menu is
  // placed — a still-hidden element cannot receive focus.
  useLayoutEffect(() => {
    if (open && placement && focusFirstOnOpenRef.current) {
      focusFirstOnOpenRef.current = false;
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    }
  }, [open, placement]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        closeMenu(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    }

    function onScroll(event: Event) {
      // Scrolling inside the menu itself is fine; anything else moves the
      // trigger, so close instead of drifting away from the row.
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return;
      }

      closeMenu(false);
    }

    function onResize() {
      closeMenu(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, closeMenu]);

  // If the row disappears (refetch, page change, navigation) the portal
  // unmounts with it; release the single-open registration too.
  useEffect(() => releaseRegistration, [releaseRegistration]);

  function focusMenuItem(offset: number) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );

    if (!items.length) {
      return;
    }

    const activeIndex = items.findIndex(
      (item) => item === document.activeElement
    );
    const nextIndex =
      activeIndex === -1
        ? offset > 0
          ? 0
          : items.length - 1
        : (activeIndex + offset + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(-1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]'
      );
      const item = event.key === "Home" ? items?.[0] : items?.[items.length - 1];
      item?.focus();
    } else if (event.key === "Tab") {
      // Hand focus back to the trigger so tabbing continues in table order.
      closeMenu(true);
    }
  }

  if (actions.length === 0) return <span className="text-slate-400">—</span>;

  const itemClass =
    "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none";

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-label={label}
            className="fixed z-50 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            onKeyDown={onMenuKeyDown}
            ref={menuRef}
            role="menu"
            style={
              placement
                ? {
                    top: placement.top,
                    left: placement.left,
                    maxHeight: placement.maxHeight,
                  }
                : { top: 0, left: 0, visibility: "hidden" }
            }
          >
            {actions.map((action) =>
              action.href ? (
                action.external ? (
                  <a
                    className={itemClass}
                    href={action.href}
                    key={action.label}
                    onClick={() => closeMenu(false)}
                    rel="noopener noreferrer"
                    role="menuitem"
                    target="_blank"
                  >
                    {action.label}
                  </a>
                ) : (
                  <Link
                    className={itemClass}
                    href={action.href}
                    key={action.label}
                    onClick={() => closeMenu(false)}
                    role="menuitem"
                  >
                    {action.label}
                  </Link>
                )
              ) : (
                <button
                  className={itemClass}
                  key={action.label}
                  onClick={() => {
                    closeMenu(true);
                    action.onSelect?.();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {action.label}
                </button>
              )
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pet-teal"
        onClick={() => (open ? closeMenu(false) : openMenu(false))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();

            if (open) {
              menuRef.current
                ?.querySelector<HTMLElement>('[role="menuitem"]')
                ?.focus();
            } else {
              openMenu(true);
            }
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <Icon className="h-4 w-4" name="more" />
      </button>
      {menu}
    </>
  );
}
