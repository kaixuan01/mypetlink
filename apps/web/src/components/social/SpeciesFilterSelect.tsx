"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { SocialSpeciesOption } from "@/services/socialDiscoveryService";

export const allSpeciesValue = "all";
const allSpeciesLabel = "All pets";

type SpeciesFilterSelectProps = {
  options: SocialSpeciesOption[];
  value: string;
  onChange: (species: string) => void;
};

/**
 * One control for "which kind of pet", instead of a row of chips.
 *
 * The chips were fine while the answer was Dogs and Cats. The product has
 * supported twenty-one species since long before Social, and the row is built
 * from whichever ones actually have discoverable pets — so it grows as the
 * product does, wraps onto three lines on a phone, and pushes the content
 * somebody came to Explore for below the fold. A filter should cost one line
 * whatever the catalogue does.
 *
 * **One panel, two shapes.** A bottom sheet on a phone and a popover on a
 * desktop are the same list, the same keyboard handling and the same selection
 * rules — only the position differs, so only the position is responsive. Two
 * components would be two chances for the keyboard behaviour to diverge.
 *
 * **No Apply button.** This is a single-select filter, so a selection is the
 * whole of the decision and there is nothing left to confirm. Apply belongs to
 * sheets that collect several answers at once, and adding one here would make a
 * reader press twice to do one thing.
 */
export function SpeciesFilterSelect({
  options,
  value,
  onChange,
}: SpeciesFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listId = `species-filter-${useId()}`;

  const choices = [
    { species: allSpeciesValue, label: allSpeciesLabel, petCount: 0 },
    ...options,
  ];
  const selected =
    choices.find((choice) => choice.species === value) ?? choices[0];

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Escape closes from anywhere, and a pointer outside dismisses without
  // choosing — the two ways out people expect from a menu.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, open]);

  // Focus lands on the current choice, so Up and Down move from where the
  // reader already is rather than from the top of a twenty-item list.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus();
  }, [open]);

  function select(species: string) {
    onChange(species);
    close(true);
  }

  function onOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    event.preventDefault();
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []
    );
    const index = items.indexOf(event.currentTarget);
    const next =
      event.key === "ArrowDown"
        ? items[index + 1] ?? items[0]
        : event.key === "ArrowUp"
          ? items[index - 1] ?? items[items.length - 1]
          : event.key === "Home"
            ? items[0]
            : items[items.length - 1];

    next?.focus();
  }

  return (
    <div className="relative">
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Filter pets by type. ${selected.label} selected.`}
        className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        data-testid="species-filter-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="truncate">{selected.label}</span>
        <Icon
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-pet-muted transition ${open ? "rotate-180" : ""}`}
          name="chevron"
        />
      </button>

      {open ? (
        <>
          {/*
            The sheet covers the page on a phone, so it gets a backdrop to sit
            on. A desktop popover is anchored to its trigger and leaves the page
            usable behind it, so it does not.
          */}
          <button
            aria-hidden="true"
            className="fixed inset-0 cursor-default bg-pet-ink/35 sm:hidden"
            onClick={() => close(false)}
            style={{ zIndex: "var(--owner-layer-backdrop)" }}
            tabIndex={-1}
            type="button"
          />

          <div
            aria-label="Filter pets by type"
            className="fixed inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-[1.75rem] border border-pet-border bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+0.5rem)] sm:max-h-80 sm:w-64 sm:rounded-[1.25rem] sm:pb-2"
            data-testid="species-filter-panel"
            id={listId}
            ref={panelRef}
            role="listbox"
            style={{ zIndex: "var(--owner-layer-surface)" }}
          >
            <p className="px-3 py-2 text-xs font-black uppercase tracking-wide text-pet-muted sm:hidden">
              Filter pets
            </p>

            {choices.map((choice) => {
              const active = choice.species === selected.species;

              return (
                <button
                  aria-selected={active}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-[1rem] px-3 py-2 text-left text-sm font-bold transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pet-teal ${
                    active
                      ? "bg-pet-cream text-pet-ink"
                      : "text-pet-ink hover:bg-pet-cream"
                  }`}
                  key={choice.species}
                  onClick={() => select(choice.species)}
                  onKeyDown={onOptionKeyDown}
                  role="option"
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 ${active ? "text-pet-teal" : "text-transparent"}`}
                    name="check"
                  />
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  {choice.petCount > 0 ? (
                    <span className="shrink-0 text-xs font-bold tabular-nums text-pet-muted">
                      {choice.petCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
