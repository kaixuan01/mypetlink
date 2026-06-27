"use client";

import { useEffect, useRef } from "react";

export type SegmentedTab = {
  id: string;
  /** Full label, shown from the `sm` breakpoint up. */
  label: string;
  /** Shorter label used on mobile. Falls back to `label`. */
  mobileLabel?: string;
};

type SegmentedTabsProps = {
  tabs: SegmentedTab[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
};

/**
 * Shared pill tab bar for the owner portal. On mobile it is horizontally
 * scrollable (tabs never shrink), sticks below the mobile header, hides its
 * scrollbar, and shows a right-edge fade so it's clear more tabs exist. From
 * the `sm` breakpoint up it becomes a normal inline pill bar.
 */
export function SegmentedTabs({
  tabs,
  activeId,
  onChange,
  ariaLabel,
}: SegmentedTabsProps) {
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Keep the active tab in view when it changes (including programmatic
  // changes, e.g. a validation error jumping to another tab). DOM-only.
  useEffect(() => {
    itemRefs.current[activeId]?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [activeId]);

  return (
    <div className="sticky top-[4.25rem] z-10 -mx-4 mb-5 min-w-0 bg-pet-cream/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:mb-6 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
      <div className="relative min-w-0">
        <div
          aria-label={ariaLabel}
          className="hide-scrollbar flex min-w-0 scroll-px-4 gap-1 overflow-x-auto rounded-full border border-pet-border bg-white p-1 pr-12 sm:pr-1"
          role="tablist"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <button
                aria-selected={active}
                className={`min-h-10 flex-[0_0_auto] whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${
                  active
                    ? "bg-pet-teal text-white"
                    : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
                }`}
                key={tab.id}
                onClick={() => onChange(tab.id)}
                ref={(node) => {
                  itemRefs.current[tab.id] = node;
                }}
                role="tab"
                type="button"
              >
                <span className="sm:hidden">{tab.mobileLabel ?? tab.label}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
        {/* Right-edge fade hint that the strip scrolls (mobile only). */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-full bg-gradient-to-l from-pet-cream to-transparent sm:hidden" />
      </div>
    </div>
  );
}
