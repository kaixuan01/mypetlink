"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/Icon";

const TYPEAHEAD_RESET_MS = 500;

export type SelectOption<Value extends string = string> = {
  value: Value;
  label: string;
  disabled?: boolean;
  keywords?: readonly string[];
};

export type SelectProps<Value extends string = string> = {
  options: readonly SelectOption<Value>[];
  value: Value | null;
  onChange: (value: Value, option: SelectOption<Value>) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchThreshold?: number;
  searchLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode | ((query: string) => ReactNode);
  renderOption?: (
    option: SelectOption<Value>,
    state: { active: boolean; selected: boolean }
  ) => ReactNode;
  renderValue?: (option: SelectOption<Value>) => ReactNode;
  className?: string;
  id?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-required"?: boolean | "false" | "true";
};

export function Select<Value extends string = string>(
  props: SelectProps<Value>
) {
  const generatedId = useId();
  const triggerId = props.id ?? `select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const typeaheadBufferRef = useRef("");
  const typeaheadTimeoutRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState<Value | null>(null);
  const selectedOption = props.options.find(
    (option) => option.value === props.value
  );
  const showSearch =
    props.searchable ?? props.options.length >= (props.searchThreshold ?? 10);

  const visibleOptions = useMemo(() => {
    return filterOptions(props.options, query);
  }, [props.options, query]);
  const optionIds = useMemo(
    () =>
      new Map(
        props.options.map((option, index) => [
          option.value,
          `${listboxId}-option-${index}`,
        ])
      ),
    [listboxId, props.options]
  );

  useEffect(() => {
    if (!open || activeValue === null) return;
    const optionId = optionIds.get(activeValue);
    if (!optionId) return;
    document.getElementById(optionId)?.scrollIntoView({ block: "nearest" });
  }, [activeValue, open, optionIds]);

  useEffect(
    () => () => {
      if (typeaheadTimeoutRef.current !== null) {
        window.clearTimeout(typeaheadTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointer(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
        setActiveValue(null);
        typeaheadBufferRef.current = "";
        if (typeaheadTimeoutRef.current !== null) {
          window.clearTimeout(typeaheadTimeoutRef.current);
          typeaheadTimeoutRef.current = null;
        }
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  function openMenu(direction: 1 | -1 = 1) {
    if (props.disabled) return;
    setOpen(true);
    const selectedIndex = visibleOptions.findIndex(
      (option) => option.value === props.value && !option.disabled
    );
    const nextIndex =
      selectedIndex >= 0
        ? selectedIndex
        : findEnabledIndex(
            visibleOptions,
            direction === 1 ? 0 : visibleOptions.length - 1,
            direction
          );
    setActiveValue(visibleOptions[nextIndex]?.value ?? null);
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    setQuery("");
    setActiveValue(null);
    resetTypeahead();
    if (restoreFocus) triggerRef.current?.focus();
  }

  function resetTypeahead() {
    typeaheadBufferRef.current = "";
    if (typeaheadTimeoutRef.current !== null) {
      window.clearTimeout(typeaheadTimeoutRef.current);
      typeaheadTimeoutRef.current = null;
    }
  }

  function moveByTypeahead(character: string) {
    if (typeaheadTimeoutRef.current !== null) {
      window.clearTimeout(typeaheadTimeoutRef.current);
    }

    const nextBuffer = `${typeaheadBufferRef.current}${character}`.toLocaleLowerCase();
    const bufferedMatch = findTypeaheadMatch(visibleOptions, nextBuffer);
    const match =
      bufferedMatch ??
      findTypeaheadMatch(visibleOptions, character.toLocaleLowerCase());
    typeaheadBufferRef.current = bufferedMatch
      ? nextBuffer
      : character.toLocaleLowerCase();
    typeaheadTimeoutRef.current = window.setTimeout(() => {
      typeaheadBufferRef.current = "";
      typeaheadTimeoutRef.current = null;
    }, TYPEAHEAD_RESET_MS);

    if (match) {
      if (!open) setOpen(true);
      setActiveValue(match.value);
    }
  }

  function selectOption(option: SelectOption<Value>) {
    if (option.disabled) return;
    props.onChange(option.value, option);
    closeMenu(true);
  }

  function moveActive(direction: 1 | -1) {
    if (!visibleOptions.length) return;
    const activeIndex = visibleOptions.findIndex(
      (option) => option.value === activeValue
    );
    const start = activeIndex < 0 ? (direction === 1 ? 0 : visibleOptions.length - 1) : activeIndex + direction;
    const next = findEnabledIndex(visibleOptions, start, direction, true);
    if (next >= 0) setActiveValue(visibleOptions[next]?.value ?? null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (props.disabled) return;
    const searchHasFocus = event.target instanceof HTMLInputElement;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        openMenu(event.key === "ArrowUp" || event.key === "End" ? -1 : 1);
      } else if (isTypeaheadKey(event, searchHasFocus)) {
        event.preventDefault();
        moveByTypeahead(event.key);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      closeMenu(false);
      return;
    }
    if (!searchHasFocus && (event.key === " " || event.key === "Spacebar")) {
      event.preventDefault();
      const option = visibleOptions.find((item) => item.value === activeValue);
      if (option) selectOption(option);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!searchHasFocus && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const direction = event.key === "Home" ? 1 : -1;
      const nextIndex = findEnabledIndex(
        visibleOptions,
        direction === 1 ? 0 : visibleOptions.length - 1,
        direction
      );
      setActiveValue(visibleOptions[nextIndex]?.value ?? null);
      return;
    }
    const activeIndex = visibleOptions.findIndex(
      (option) => option.value === activeValue
    );
    if (event.key === "Enter") {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) selectOption(option);
      return;
    }
    if (isTypeaheadKey(event, searchHasFocus)) {
      event.preventDefault();
      moveByTypeahead(event.key);
    }
  }

  const activeIndex = visibleOptions.findIndex(
    (option) => option.value === activeValue
  );
  const activeOption = activeIndex >= 0 ? visibleOptions[activeIndex] : undefined;
  const activeDescendant = activeOption
    ? optionIds.get(activeOption.value)
    : undefined;
  const hasVisibleOptions = visibleOptions.length > 0;

  return (
    <div
      className={`relative min-w-0 ${props.className ?? ""}`}
      onKeyDown={handleKeyDown}
      ref={wrapperRef}
    >
      <button
        aria-activedescendant={open ? activeDescendant : undefined}
        aria-autocomplete="none"
        aria-controls={open && hasVisibleOptions ? listboxId : undefined}
        aria-describedby={props["aria-describedby"]}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={props["aria-invalid"]}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-required={props["aria-required"] ?? props.required}
        className="brand-input flex min-h-12 items-center justify-between gap-4 text-left"
        disabled={props.disabled}
        id={triggerId}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span
          className={`min-w-0 truncate ${selectedOption ? "" : "text-pet-muted"}`}
        >
          {selectedOption
            ? props.renderValue?.(selectedOption) ?? selectedOption.label
            : props.placeholder ?? "Select an option"}
        </span>
        <Icon
          className={`pointer-events-none h-4 w-4 shrink-0 text-pet-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          name="chevron"
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-[1.25rem] border border-pet-border bg-white p-2 shadow-xl shadow-[#0d1b3d]/12"
          style={{ zIndex: "var(--owner-layer-surface)" }}
        >
          {showSearch ? (
            <div className="pb-2">
              <input
                aria-activedescendant={activeDescendant}
                aria-controls={hasVisibleOptions ? listboxId : undefined}
                aria-label={props.searchLabel ?? "Search options"}
                className="brand-input min-h-11"
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  const nextOptions = filterOptions(props.options, nextQuery);
                  const nextIndex = findEnabledIndex(nextOptions, 0, 1);
                  setQuery(nextQuery);
                  setActiveValue(nextOptions[nextIndex]?.value ?? null);
                }}
                placeholder={props.searchPlaceholder ?? "Search"}
                type="search"
                value={query}
              />
            </div>
          ) : null}

          {hasVisibleOptions ? (
            <div
              aria-label={props["aria-label"]}
              aria-labelledby={props["aria-labelledby"]}
              className="max-h-64 overflow-y-auto overscroll-contain pr-1"
              id={listboxId}
              role="listbox"
            >
              {visibleOptions.map((option, index) => {
                const selected = option.value === props.value;
                const active = index === activeIndex;
                const optionId = optionIds.get(option.value);

                return (
                  <button
                    aria-disabled={option.disabled || undefined}
                    aria-selected={selected}
                    className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left text-sm font-bold transition ${
                      selected
                        ? "bg-[#e8f3ff] text-pet-teal"
                        : active
                          ? "bg-pet-cream text-pet-ink"
                          : "text-pet-ink hover:bg-pet-cream"
                    } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    disabled={option.disabled}
                    id={optionId}
                    key={option.value}
                    onClick={() => selectOption(option)}
                    onPointerMove={() => {
                      if (!option.disabled) setActiveValue(option.value);
                    }}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {props.renderOption?.(option, { active, selected }) ??
                        option.label}
                    </span>
                    {selected ? (
                      <span className="shrink-0 text-xs text-pet-teal">
                        Selected
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-pet-muted" role="status">
              {typeof props.emptyMessage === "function"
                ? props.emptyMessage(query)
                : props.emptyMessage ?? "No matching options."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SearchableSelect<Value extends string = string>(
  props: Omit<SelectProps<Value>, "searchable">
) {
  return <Select {...props} searchable />;
}

function findEnabledIndex<Value extends string>(
  options: readonly SelectOption<Value>[],
  start: number,
  direction: 1 | -1,
  wrap = false
) {
  if (!options.length) return -1;

  for (let offset = 0; offset < options.length; offset += 1) {
    let index = start + offset * direction;
    if (wrap) index = (index + options.length) % options.length;
    if (index < 0 || index >= options.length) continue;
    if (!options[index]?.disabled) return index;
  }

  return -1;
}

function filterOptions<Value extends string>(
  options: readonly SelectOption<Value>[],
  query: string
) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return options;

  return options.filter((option) =>
    [option.label, ...(option.keywords ?? [])].some((candidate) =>
      candidate.toLocaleLowerCase().includes(term)
    )
  );
}

function findTypeaheadMatch<Value extends string>(
  options: readonly SelectOption<Value>[],
  buffer: string
) {
  return options.find(
    (option) =>
      !option.disabled &&
      [option.label, ...(option.keywords ?? [])].some((candidate) =>
        candidate.toLocaleLowerCase().startsWith(buffer)
      )
  );
}

function isTypeaheadKey(
  event: KeyboardEvent<HTMLElement>,
  searchHasFocus: boolean
) {
  return (
    !searchHasFocus &&
    event.key.length === 1 &&
    event.key !== " " &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  );
}
