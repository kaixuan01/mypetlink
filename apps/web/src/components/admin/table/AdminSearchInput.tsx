"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Debounced global keyword search for admin listings. Commits to the URL after
// a short pause (or immediately on Enter/blur), so typing does not fire a
// request per keystroke.
export function AdminSearchInput({
  value,
  onChange,
  placeholder = "Search",
  label = "Search",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [adoptedValue, setAdoptedValue] = useState(value);
  const timerRef = useRef<number | null>(null);

  // Adopt external changes (Back/Forward navigation, Clear all) during render.
  if (value !== adoptedValue) {
    setAdoptedValue(value);
    setDraft(value);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function commit(next: string) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (next !== value) {
      onChange(next);
    }
  }

  function handleChange(next: string) {
    setDraft(next);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => commit(next), 350);
  }

  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        className="min-h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
        onBlur={() => commit(draft)}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(draft);
          }
        }}
        placeholder={placeholder}
        type="search"
        value={draft}
      />
      {draft ? (
        <button
          aria-label="Clear search"
          className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
          onClick={() => {
            setDraft("");
            commit("");
          }}
          type="button"
        >
          ×
        </button>
      ) : null}
    </label>
  );
}
