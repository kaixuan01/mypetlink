"use client";

import { useEffect, useId, useRef, useState } from "react";

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
  sticky?: boolean;
  className?: string;
};

/**
 * Shared pill tab bar for the owner portal. It measures the available width and
 * keeps tabs on one row by moving overflow items into a More menu.
 */
export function SegmentedTabs({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  sticky = true,
  className = "",
}: SegmentedTabsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const measureRowRef = useRef<HTMLDivElement | null>(null);
  const measureRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const moreMeasureRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleCountForRender = Math.min(visibleCount, tabs.length);
  const visibleTabs = tabs.slice(0, visibleCountForRender);
  const hiddenTabs = tabs.slice(visibleCountForRender);
  const hasHiddenTabs = hiddenTabs.length > 0;
  const moreActive = hiddenTabs.some((tab) => tab.id === activeId);
  const moreMenuOpen = moreOpen && hasHiddenTabs;
  const tabSignature = tabs
    .map((tab) => `${tab.id}:${tab.label}:${tab.mobileLabel ?? ""}`)
    .join("|");

  useEffect(() => {
    function computeVisibleTabs() {
      const tabList = tabListRef.current;
      const moreButton = moreMeasureRef.current;

      if (!tabList || !moreButton || tabs.length === 0) {
        return;
      }

      const styles = window.getComputedStyle(tabList);
      const horizontalPadding =
        parseFloat(styles.paddingLeft || "0") +
        parseFloat(styles.paddingRight || "0");
      const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
      const availableWidth = tabList.clientWidth - horizontalPadding;
      const tabWidths = tabs.map((tab) => measureRefs.current[tab.id]?.offsetWidth ?? 0);

      if (!availableWidth || tabWidths.some((width) => width === 0)) {
        return;
      }

      const totalTabsWidth =
        tabWidths.reduce((total, width) => total + width, 0) +
        Math.max(0, tabs.length - 1) * gap;

      if (totalTabsWidth <= availableWidth) {
        setVisibleCount((current) => (current === tabs.length ? current : tabs.length));
        setMoreOpen(false);
        return;
      }

      const moreWidth = moreButton.offsetWidth;

      for (let count = tabs.length - 1; count >= 1; count -= 1) {
        const visibleWidth =
          tabWidths.slice(0, count).reduce((total, width) => total + width, 0) +
          moreWidth +
          count * gap;

        if (visibleWidth <= availableWidth) {
          setVisibleCount((current) => (current === count ? current : count));
          return;
        }
      }

      setVisibleCount((current) => (current === 1 ? current : 1));
    }

    const frame = window.requestAnimationFrame(computeVisibleTabs);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => computeVisibleTabs())
        : null;

    if (tabListRef.current) {
      observer?.observe(tabListRef.current);
    }

    // The measurement row is content-sized, so it resizes when tab label
    // widths settle late (web font load, stylesheet apply, breakpoint label
    // swap) even though the tab list container keeps the same width. Without
    // this, a measurement taken before fonts load can leave overflowing tabs
    // clipped instead of collapsed into More.
    if (measureRowRef.current) {
      observer?.observe(measureRowRef.current);
    }

    window.addEventListener("resize", computeVisibleTabs);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", computeVisibleTabs);
    };
  }, [tabs, tabSignature]);

  useEffect(() => {
    if (!moreMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreMenuOpen]);

  function handleSelect(id: string) {
    onChange(id);
    setMoreOpen(false);
  }

  const wrapperClassName = sticky
    ? "sticky top-[4.25rem] z-10 -mx-4 mb-5 min-w-0 bg-pet-cream/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:mb-6 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none"
    : "min-w-0";

  return (
    <div
      className={`${wrapperClassName} ${className}`.trim()}
      ref={rootRef}
    >
      <div className="relative min-w-0">
        <div
          aria-label={ariaLabel}
          className="flex min-w-0 flex-nowrap gap-1 rounded-full border border-pet-border bg-white p-1"
          ref={tabListRef}
          role="tablist"
        >
          {visibleTabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <button
                aria-selected={active}
                className={getTabClassName(active)}
                key={tab.id}
                onClick={() => handleSelect(tab.id)}
                role="tab"
                type="button"
              >
                <TabLabel tab={tab} />
              </button>
            );
          })}

          {hasHiddenTabs ? (
            <div className="relative shrink-0">
              <button
                aria-controls={moreMenuOpen ? menuId : undefined}
                aria-expanded={moreMenuOpen}
                aria-haspopup="menu"
                className={getTabClassName(moreActive)}
                onClick={() => setMoreOpen((open) => !open)}
                type="button"
              >
                More
              </button>

              {moreMenuOpen ? (
                <div
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-56 overflow-hidden rounded-[1.25rem] border border-pet-border bg-white p-2 shadow-xl shadow-[#0d1b3d]/12"
                  id={menuId}
                  role="menu"
                >
                  {hiddenTabs.map((tab) => {
                    const active = tab.id === activeId;
                    return (
                      <button
                        className={`flex min-h-11 w-full items-center justify-between rounded-2xl px-4 py-2 text-left text-sm font-bold transition ${
                          active
                            ? "bg-[#e8f3ff] text-pet-teal"
                            : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
                        }`}
                        key={tab.id}
                        onClick={() => handleSelect(tab.id)}
                        role="menuitem"
                        type="button"
                      >
                        <span>{tab.label}</span>
                        {active ? <span className="text-xs">Active</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 -z-10 flex min-w-0 flex-nowrap gap-1 rounded-full border border-transparent p-1 opacity-0"
          ref={measureRowRef}
        >
          {tabs.map((tab) => (
            <button
              className={getTabClassName(false)}
              key={tab.id}
              ref={(node) => {
                measureRefs.current[tab.id] = node;
              }}
              tabIndex={-1}
              type="button"
            >
              <TabLabel tab={tab} />
            </button>
          ))}
          <button
            className={getTabClassName(false)}
            ref={moreMeasureRef}
            tabIndex={-1}
            type="button"
          >
            More
          </button>
        </div>
      </div>
    </div>
  );
}

function TabLabel({ tab }: { tab: SegmentedTab }) {
  return (
    <>
      <span className="sm:hidden">{tab.mobileLabel ?? tab.label}</span>
      <span className="hidden sm:inline">{tab.label}</span>
    </>
  );
}

function getTabClassName(active: boolean) {
  return `min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${
    active
      ? "bg-pet-teal text-white"
      : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
  }`;
}
