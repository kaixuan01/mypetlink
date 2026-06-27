"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { readImageAsDataUrl } from "@/lib/imageUpload";

type ImageUploadFieldProps = {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  helper?: string;
  error?: string;
  shape?: "square" | "wide";
  emptyIcon?: ReactNode;
};

export function ImageUploadField({
  label,
  value,
  onChange,
  helper,
  error,
  shape = "wide",
  emptyIcon,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [localError, setLocalError] = useState("");

  const frameClass =
    shape === "square"
      ? "aspect-square w-32"
      : "aspect-[16/10] w-full";

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];

    if (!file) {
      return;
    }

    setLocalError("");
    setIsReading(true);

    try {
      const dataUrl = await readImageAsDataUrl(file);
      onChange(dataUrl);
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : "Could not read this image."
      );
    } finally {
      setIsReading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  const message = error || localError;

  return (
    <div className="grid gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>

      {value ? (
        <div className="grid gap-3">
          <div
            className={`overflow-hidden rounded-[1.25rem] border border-pet-border bg-pet-cream ${frameClass}`}
          >
            {/* Data-URL preview; static export + local mock means no next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`${label} preview`}
              className="h-full w-full object-cover"
              src={value}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <Icon name="settings" className="h-4 w-4" />
              Replace
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-coral transition hover:bg-pet-apricot"
              onClick={() => {
                setLocalError("");
                onChange("");
              }}
              type="button"
            >
              <Icon name="plus" className="h-4 w-4 rotate-45" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`grid cursor-pointer place-items-center gap-2 rounded-[1.25rem] border-2 border-dashed border-pet-border bg-pet-cream p-6 text-center transition hover:border-pet-teal ${frameClass}`}
          htmlFor={inputId}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-pet-teal">
            {emptyIcon ?? <Icon name="heart" className="h-5 w-5" />}
          </span>
          <span className="text-sm font-bold text-pet-ink">
            {isReading ? "Adding photo..." : "Click to upload a photo"}
          </span>
          <span className="text-xs font-semibold text-pet-muted">
            JPG or PNG, up to 8MB
          </span>
        </label>
      )}

      <input
        accept="image/*"
        className="hidden"
        id={inputId}
        onChange={(event) => handleFiles(event.target.files)}
        ref={inputRef}
        type="file"
      />

      {helper && !message ? (
        <span className="text-xs font-semibold text-pet-muted">{helper}</span>
      ) : null}
      {message ? (
        <span className="text-xs font-bold text-[#a63c2e]">{message}</span>
      ) : null}
    </div>
  );
}
