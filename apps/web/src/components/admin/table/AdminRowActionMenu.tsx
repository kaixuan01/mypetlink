"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export type AdminRowAction = {
  label: string;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
};

export function AdminRowActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: AdminRowAction[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (actions.length === 0) return <span className="text-slate-400">—</span>;

  const itemClass =
    "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none";

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pet-teal"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <Icon className="h-4 w-4" name="more" />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          role="menu"
        >
          {actions.map((action) =>
            action.href ? (
              action.external ? (
                <a
                  className={itemClass}
                  href={action.href}
                  key={action.label}
                  onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
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
                  setOpen(false);
                  action.onSelect?.();
                }}
                role="menuitem"
                type="button"
              >
                {action.label}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
