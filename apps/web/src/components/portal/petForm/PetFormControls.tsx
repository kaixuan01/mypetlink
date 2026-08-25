"use client";

import {
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import type { CoverCropMetrics } from "@/lib/coverCrop";
import { getBioTemplates } from "@/lib/petSuggestions";
import type { PetProfileTheme } from "@/lib/petProfileThemes";

export function UrlDisplay({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase text-pet-muted">{label}</p>
        <p className="mt-0.5 min-w-0 text-sm font-bold text-pet-ink [overflow-wrap:anywhere]">
          {url}
        </p>
      </div>
      <button
        className="shrink-0 rounded-full border border-pet-border bg-white px-3 py-1.5 text-xs font-bold text-pet-muted transition hover:bg-pet-cream"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export function ContactSummary({
  ownerName,
  whatsapp,
  phone,
  generalArea,
}: {
  ownerName: string;
  whatsapp: string;
  phone: string;
  generalArea: string;
}) {
  const items = [
    ["Owner display name", ownerName || "Not provided"],
    ["WhatsApp number", whatsapp || "Not provided"],
    ["Phone number", phone || "Not provided"],
    ["General area", generalArea || "Not provided"],
  ];

  return (
    <dl className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="min-w-0 rounded-[1rem] bg-pet-cream p-3" key={label}>
          <dt className="text-xs font-bold uppercase text-pet-muted">
            {label}
          </dt>
          <dd className="mt-1 min-w-0 text-sm font-black text-pet-ink [overflow-wrap:anywhere]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const INITIAL_SUGGESTION_COUNT = 6;

export function normalizeTagList(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = raw.replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();

    if (!value || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);

    if (result.length >= max) {
      break;
    }
  }

  return result;
}

export function TagListInput({
  label,
  values,
  onChange,
  suggestions,
  max,
  placeholder,
  error,
  helper,
  maxLength = 80,
  deferSuggestions = false,
  mobileLongValueLayout = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  max: number;
  placeholder: string;
  error?: string;
  helper?: string;
  maxLength?: number;
  /**
   * When true, suggestion chips stay hidden until the owner focuses the input
   * or asks for them, so small screens are not flooded with chips up front.
   */
  deferSuggestions?: boolean;
  /**
   * Gives long safety values a wrapping label and mobile-sized actions without
   * changing the denser tag fields used by Basic Info.
   */
  mobileLongValueLayout?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [suggestionsRevealed, setSuggestionsRevealed] = useState(
    !deferSuggestions
  );
  const selectedKeys = new Set(values.map((value) => value.toLowerCase()));
  const canAdd = values.length < max;
  const remainingSuggestions = suggestions.filter(
    (suggestion) => !selectedKeys.has(suggestion.toLowerCase())
  );
  const visibleSuggestions = showAllSuggestions
    ? remainingSuggestions
    : remainingSuggestions.slice(0, INITIAL_SUGGESTION_COUNT);
  const hiddenCount = remainingSuggestions.length - visibleSuggestions.length;

  function addValue(raw: string) {
    const value = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();

    if (!value || !canAdd || selectedKeys.has(value.toLowerCase())) {
      return;
    }

    onChange([...values, value]);
    setDraft("");
  }

  function removeValue(value: string) {
    onChange(values.filter((current) => current !== value));
  }

  return (
    <div className="grid min-w-0 content-start gap-2">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-pet-ink">{label}</span>
        <span className="text-xs font-bold text-pet-muted">
          {values.length}/{max}
        </span>
      </span>

      {helper ? (
        <span className="text-xs font-semibold leading-5 text-pet-muted">
          {helper}
        </span>
      ) : null}

      {values.length ? (
        <div className="flex min-w-0 flex-wrap gap-2">
          {values.map((value) => (
            <button
              aria-label={`Remove ${value}`}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-pet-teal bg-[#e8f3ff] px-3 text-xs font-bold text-pet-teal transition hover:bg-[#d8edff] ${
                mobileLongValueLayout
                  ? "min-h-11 py-2 text-left sm:min-h-9 sm:py-1.5"
                  : "min-h-9 py-1.5"
              }`}
              key={value}
              onClick={() => removeValue(value)}
              type="button"
            >
              <span
                className={
                  mobileLongValueLayout
                    ? "min-w-0 break-words [overflow-wrap:anywhere]"
                    : undefined
                }
              >
                {value}
              </span>
              <Icon name="plus" className="h-3 w-3 shrink-0 rotate-45" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex min-w-0 gap-2">
        <input
          aria-label={`${label}: add your own`}
          className="brand-input min-w-0 flex-1"
          disabled={!canAdd}
          maxLength={maxLength}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setSuggestionsRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue(draft);
            }
          }}
          placeholder={canAdd ? placeholder : `Limit of ${max} reached`}
          type="text"
          value={draft}
        />
        <button
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canAdd || !draft.trim()}
          onClick={() => addValue(draft)}
          type="button"
        >
          Add
        </button>
      </div>

      {!suggestionsRevealed && remainingSuggestions.length ? (
        <button
          aria-expanded={false}
          className={`inline-flex items-center self-start rounded-full px-3 py-1.5 text-xs font-bold text-pet-teal transition hover:underline ${
            mobileLongValueLayout ? "min-h-11 sm:min-h-9" : "min-h-9"
          }`}
          onClick={() => setSuggestionsRevealed(true)}
          type="button"
        >
          Show suggestions ({remainingSuggestions.length})
        </button>
      ) : null}

      {suggestionsRevealed && visibleSuggestions.length ? (
        <div aria-label={`Suggested ${label.toLowerCase()}`} role="group">
          <div className="flex min-w-0 flex-wrap gap-2">
            {visibleSuggestions.map((option) => (
              <button
                className={`inline-flex items-center rounded-full border border-pet-border bg-white px-3 py-1.5 text-xs font-bold text-pet-muted transition hover:border-pet-teal hover:text-pet-teal disabled:cursor-not-allowed disabled:opacity-50 ${
                  mobileLongValueLayout ? "min-h-11 sm:min-h-9" : "min-h-9"
                }`}
                disabled={!canAdd}
                key={option}
                onClick={() => addValue(option)}
                type="button"
              >
                {option}
              </button>
            ))}
            {hiddenCount > 0 ? (
              <button
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold text-pet-teal transition hover:underline ${
                  mobileLongValueLayout ? "min-h-11 sm:min-h-9" : "min-h-9"
                }`}
                onClick={() => setShowAllSuggestions(true)}
                type="button"
              >
                More suggestions ({hiddenCount})
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <span className="text-xs font-bold text-[#a63c2e]">{error}</span>
      ) : null}
    </div>
  );
}

// Single segmented control for gender. A legacy custom value (e.g. "Male
// (neutered)") keeps its saved text and highlights the matching option until
// the owner picks one.
export function GenderSegmentedControl({
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
  "aria-required"?: boolean | "false" | "true";
}) {
  const normalized = value.trim().toLowerCase();

  return (
    <div
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-label={ariaLabelledBy ? undefined : ariaLabel ?? "Gender"}
      aria-labelledby={ariaLabelledBy}
      aria-required={ariaRequired}
      className="grid grid-cols-3 gap-1 rounded-full border border-pet-border bg-white p-1"
      id={id}
      role="radiogroup"
    >
      {(["Male", "Female", "Unknown"] as const).map((option) => {
        const selected =
          normalized === option.toLowerCase() ||
          (option !== "Unknown" && normalized.startsWith(option.toLowerCase()));

        return (
          <button
            aria-checked={selected}
            className={`min-h-10 rounded-full px-2 text-sm font-bold transition ${
              selected
                ? "bg-[#e8f3ff] text-pet-teal"
                : "text-pet-muted hover:bg-pet-cream hover:text-pet-ink"
            }`}
            key={option}
            onClick={() => onChange(option)}
            role="radio"
            type="button"
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// Bio starter templates in a bottom sheet, opened only on request so the main
// form stays compact. Selecting one fills the textarea with editable text.
export function BioTemplateSheet({
  open,
  petName,
  onPick,
  onClose,
}: {
  open: boolean;
  petName: string;
  onPick: (template: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-label="Bio starters"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end bg-pet-ink/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="dialog"
    >
      <button
        aria-label="Close bio starters"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div className="relative w-full max-w-lg rounded-t-[2rem] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[2rem] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-pet-ink">
              Need a starting point?
            </h2>
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              Tap one and edit it to match your pet.
            </p>
          </div>
          <button
            aria-label="Close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pet-cream text-pet-muted transition hover:text-pet-ink"
            onClick={onClose}
            type="button"
          >
            <Icon name="plus" className="h-5 w-5 rotate-45" />
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {getBioTemplates(petName).map((template) => (
            <button
              className="rounded-[1.25rem] border border-pet-border bg-pet-cream px-4 py-3 text-left text-sm font-semibold leading-6 text-pet-ink transition hover:border-pet-teal hover:bg-white"
              key={template}
              onClick={() => onPick(template)}
              type="button"
            >
              {template}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TextInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  helper,
  maxLength,
  id,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  maxLength?: number;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? `pet-text-${generatedId}`;

  return (
    <Field
      errorText={error}
      helperText={helper}
      htmlFor={inputId}
      label={label}
    >
      <input
        className="brand-input"
        id={inputId}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </Field>
  );
}

export function CoverPositionControl({
  axis,
  description,
  disabled,
  onChange,
  value,
}: {
  axis: "Horizontal" | "Vertical";
  description?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="flex items-center justify-between gap-3 text-xs font-bold text-pet-ink">
        {axis} position
        <span className="text-pet-muted">{value}%</span>
      </span>
      <input
        aria-label={`${axis} cover position`}
        className="min-h-11 w-full cursor-pointer accent-pet-teal disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled}
        max={100}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
      {description ? (
        <span className="text-xs font-semibold leading-5 text-pet-muted">
          {description}
        </span>
      ) : null}
    </label>
  );
}

export function getCoverAxisDescription(
  metrics: CoverCropMetrics | null,
  axis: "Horizontal" | "Vertical"
) {
  if (!metrics) {
    return "Checking how this photo fits in the cover area.";
  }

  const canMove = axis === "Horizontal" ? metrics.canMoveX : metrics.canMoveY;
  return canMove
    ? undefined
    : `This photo already fits ${axis.toLowerCase()}ly in the cover area.`;
}

export function PrivacyGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-pet-border pt-5 sm:rounded-[1.5rem] sm:border sm:bg-white sm:p-5">
      <p className="mb-3 text-sm font-black text-pet-ink">{title}</p>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function ThemeOptionCard({
  name,
  onSelect,
  selected,
  theme,
}: {
  name: string;
  onSelect: () => void;
  selected: boolean;
  theme: PetProfileTheme;
}) {
  return (
    <label
      className={`relative min-h-14 min-w-0 cursor-pointer rounded-[1.25rem] border p-3 text-left transition sm:min-h-[220px] sm:p-4 ${
        selected
          ? "shadow-lg shadow-[#0d1b3d]/10"
          : "border-pet-border bg-white hover:-translate-y-0.5 hover:shadow-md"
      }`}
      onClick={onSelect}
      style={
        selected
          ? {
              background: theme.colors.surface,
              borderColor: theme.colors.primary,
              boxShadow: `0 4px 20px ${theme.colors.primary}22`,
            }
          : undefined
      }
    >
      <input
        checked={selected}
        className="peer sr-only"
        name="profile-theme"
        onChange={onSelect}
        type="radio"
        value={theme.id}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[1.25rem] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pet-teal"
      />
      <div className="flex min-w-0 items-center justify-between gap-3 sm:block">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 text-sm font-black text-pet-ink">
            {theme.name}
          </span>
          {selected ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase"
              style={{
                background: theme.colors.primarySoft,
                color: theme.colors.primary,
              }}
            >
              <span aria-hidden="true">✓</span>
              Selected
            </span>
          ) : null}
        </div>
        <p className="mt-2 hidden min-h-10 text-xs leading-5 text-pet-muted sm:block">
          {theme.description}
        </p>
        <div className="mt-2 flex shrink-0 gap-1.5 sm:mt-3">
          {theme.swatches.map((swatch) => (
            <span
              aria-hidden="true"
              className="h-4 w-4 rounded-full border border-white shadow-sm sm:h-5 sm:w-5"
              key={swatch}
              style={{ background: swatch }}
            />
          ))}
        </div>
      </div>
      <div
        className="mt-4 hidden overflow-hidden rounded-2xl border sm:block"
        data-theme-miniature
        style={{
          background: theme.gradients.cover,
          borderColor: theme.colors.border,
        }}
      >
        <div className="p-3">
          <div
            className="h-8 rounded-xl"
            style={{ background: theme.gradients.decorative }}
          />
          <div className="-mt-3 grid place-items-center">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl border-2 text-xs font-black"
              style={{
                background: theme.colors.accentSoft,
                borderColor: theme.colors.surface,
                color: theme.colors.accent,
              }}
            >
              {getInitial(name)}
            </span>
          </div>
          <div className="mt-2 text-center">
            <p
              className="truncate text-xs font-black"
              style={{ color: theme.colors.text }}
            >
              {name}
            </p>
            <span
              className="mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black"
              style={{
                background: theme.colors.badgeBackground,
                color: theme.colors.primary,
              }}
            >
              Gentle
            </span>
          </div>
        </div>
      </div>
    </label>
  );
}

export function ThemePreviewPanel({
  petName,
  theme,
}: {
  petName: string;
  theme: PetProfileTheme;
}) {
  return (
    <div
      aria-label={`${petName} theme preview`}
      className="min-w-0 overflow-hidden rounded-[1.5rem] border"
      data-theme-live-preview
      role="region"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div
        className="grid min-w-0 gap-4 p-3 sm:gap-5 sm:p-5 lg:grid-cols-[0.9fr_1.1fr]"
        style={{ background: theme.gradients.page }}
      >
        <div>
          <p
            className="text-sm font-black"
            style={{ color: theme.colors.text }}
          >
            How {petName}&apos;s public profile will look
          </p>
          <p
            className="mt-2 text-sm leading-6"
            style={{ color: theme.colors.mutedText }}
          >
            {theme.description}
          </p>
        </div>

        <div
          className="min-w-0 rounded-[1.25rem] border p-3"
          style={{
            background: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
        >
          <div
            className="relative h-24 rounded-2xl"
            style={{ background: theme.gradients.cover }}
          >
            <span
              className="absolute bottom-3 left-3 h-3 w-3 rounded-full"
              style={{ background: theme.colors.timelineDot }}
            />
            <span
              className="absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-black"
              style={{
                background: theme.colors.badgeBackground,
                color: theme.colors.primary,
              }}
            >
              Gentle
            </span>
          </div>
          <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 pt-4 sm:grid-cols-[88px_minmax(0,1fr)]">
            <div
              className="grid h-16 w-16 place-items-center rounded-[1.25rem] text-xl font-black sm:h-20 sm:w-20"
              style={{
                background: theme.colors.accentSoft,
                color: theme.colors.accent,
              }}
            >
              {getInitial(petName)}
            </div>
            <div className="min-w-0">
              <p
                className="text-lg font-black"
                style={{ color: theme.colors.text }}
              >
                {petName}
              </p>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <span
                  className="h-10 w-2 shrink-0 rounded-full"
                  style={{ background: theme.colors.timelineLine }}
                />
                <div
                  className="min-w-0 rounded-2xl p-3 text-sm"
                  style={{
                    background: theme.colors.surfaceAlt,
                    color: theme.colors.mutedText,
                  }}
                >
                  First day home
                </div>
              </div>
            </div>
          </div>
          <div
            className="mt-3 rounded-2xl p-4"
            style={{ background: theme.colors.surfaceAlt }}
          >
            <p
              className="text-xs font-black uppercase"
              style={{ color: theme.colors.accent }}
            >
              Pet Memory
            </p>
            <p
              className="mt-1 text-sm font-black"
              style={{ color: theme.colors.text }}
            >
              Park walk after breakfast
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "P";
}
