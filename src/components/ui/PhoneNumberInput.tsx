"use client";

import { useId, useState } from "react";
import { CountryCodeSelect } from "@/components/ui/CountryCodeSelect";
import {
  DEFAULT_COUNTRY,
  findCountryByDialCode,
  parsePhone,
  toE164,
  type Country,
} from "@/lib/phone";

type PhoneNumberInputProps = {
  label: string;
  /** Stored E.164 string, e.g. "+60123456789". Empty string when unset. */
  value: string;
  /** Emits a normalised E.164 string (or "" when the number is cleared). */
  onChange: (e164: string) => void;
  error?: string;
  helper?: string;
  placeholder?: string;
  required?: boolean;
};

type Draft = {
  country: Country;
  national: string;
  e164: string;
};

function draftFromValue(value: string): Draft {
  const parsed = parsePhone(value);
  return {
    country: findCountryByDialCode(parsed.countryCode) ?? DEFAULT_COUNTRY,
    national: parsed.nationalNumber,
    e164: value,
  };
}

export function PhoneNumberInput({
  label,
  value,
  onChange,
  error,
  helper,
  placeholder = "12 345 6789",
  required,
}: PhoneNumberInputProps) {
  const inputId = useId();
  const [draft, setDraft] = useState<Draft>(() => draftFromValue(value));

  // Re-sync from props when the parent changes the value externally (e.g. a
  // form reset). When the parent simply echoes back what we emitted, value
  // equals draft.e164, so we keep the local national digits the user typed
  // (including any leading zero). This render-time sync avoids a setState
  // effect.
  if (value !== draft.e164) {
    setDraft(draftFromValue(value));
  }

  function emit(next: Draft) {
    setDraft(next);
    onChange(next.e164);
  }

  function handleCountry(country: Country) {
    emit({
      country,
      national: draft.national,
      e164: toE164(country.dialCode, draft.national),
    });
  }

  function handleNational(raw: string) {
    // Strip spaces, dashes, and any letters before storing.
    const national = raw.replace(/\D/g, "");
    emit({
      country: draft.country,
      national,
      e164: toE164(draft.country.dialCode, national),
    });
  }

  return (
    <label className="grid w-full min-w-0 gap-2" htmlFor={inputId}>
      <span className="text-sm font-bold text-pet-ink">
        {label}
        {required ? <span className="text-pet-coral"> *</span> : null}
      </span>
      <div className="flex w-full min-w-0 items-stretch">
        <CountryCodeSelect value={draft.country.dialCode} onChange={handleCountry} />
        <input
          autoComplete="tel-national"
          className="brand-input min-w-0 flex-1 rounded-l-none"
          id={inputId}
          inputMode="numeric"
          onChange={(event) => handleNational(event.target.value)}
          placeholder={placeholder}
          type="tel"
          value={draft.national}
        />
      </div>
      {helper ? (
        <span className="text-xs leading-5 text-pet-muted">{helper}</span>
      ) : null}
      {error ? (
        <span className="text-xs font-bold text-[#a63c2e]">{error}</span>
      ) : null}
    </label>
  );
}
