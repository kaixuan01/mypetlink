"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, findCountryByDialCode, type Country } from "@/lib/phone";

type CountryCodeSelectProps = {
  /** Selected dial code, e.g. "+60". */
  value: string;
  onChange: (country: Country) => void;
  disabled?: boolean;
  buttonId?: string;
};

export function CountryCodeSelect({
  value,
  onChange,
  disabled,
  buttonId,
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = findCountryByDialCode(value) ?? COUNTRIES[0];

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return COUNTRIES;
    }
    const digits = term.replace(/[^\d]/g, "");
    return COUNTRIES.filter((country) => {
      const nameMatch = country.name.toLowerCase().includes(term);
      const dialMatch =
        country.dialCode.includes(term) ||
        (digits.length > 0 && country.dialCode.replace("+", "").includes(digits));
      return nameMatch || dialMatch;
    });
  }, [query]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    // Focus the search box when the panel opens (DOM side-effect only).
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  function handleSelect(country: Country) {
    onChange(country);
    closeMenu();
  }

  return (
    <div className="relative min-w-0 shrink-0">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-12 min-h-12 max-w-[7.5rem] shrink-0 items-center gap-1.5 rounded-l-2xl border border-r-0 border-pet-border bg-pet-cream px-3 text-sm font-bold text-pet-ink transition hover:bg-pet-apricot/50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        id={buttonId}
        onClick={() => (open ? closeMenu() : setOpen(true))}
        type="button"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {selected.flag}
        </span>
        <span className="truncate">{selected.dialCode}</span>
        <span aria-hidden="true" className="text-[0.6rem] text-pet-muted">
          ▼
        </span>
        <span className="sr-only">
          {selected.name} {selected.dialCode}. Change country code
        </span>
      </button>

      {open ? (
        <>
          <button
            aria-hidden="true"
            className="fixed inset-0 z-30 cursor-default"
            onClick={closeMenu}
            tabIndex={-1}
            type="button"
          />
          <div className="absolute left-0 top-14 z-40 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-[1.25rem] border border-pet-border bg-white shadow-xl shadow-[#0d1b3d]/10">
            <div className="border-b border-pet-border p-2">
              <input
                aria-label="Search country or dial code"
                className="brand-input h-10 min-h-10"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    closeMenu();
                  }
                  if (event.key === "Enter" && results.length) {
                    event.preventDefault();
                    handleSelect(results[0]);
                  }
                }}
                placeholder="Search country or +code"
                ref={searchRef}
                type="text"
                value={query}
              />
            </div>
            <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
              {results.length ? (
                results.map((country) => {
                  const isSelected =
                    country.iso2 === selected.iso2 &&
                    country.dialCode === selected.dialCode;
                  return (
                    <li key={country.iso2}>
                      <button
                        aria-selected={isSelected}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition hover:bg-pet-cream ${
                          isSelected ? "bg-pet-cream text-pet-ink" : "text-pet-ink"
                        }`}
                        onClick={() => handleSelect(country)}
                        role="option"
                        type="button"
                      >
                        <span aria-hidden="true" className="text-base leading-none">
                          {country.flag}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {country.name}
                        </span>
                        <span className="shrink-0 font-bold text-pet-muted">
                          {country.dialCode}
                        </span>
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="px-4 py-3 text-sm text-pet-muted">
                  No countries match &ldquo;{query}&rdquo;.
                </li>
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
