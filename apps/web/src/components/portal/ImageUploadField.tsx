"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { readImageAsDataUrl } from "@/lib/imageUpload";

type ImageUploadFieldProps = {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  onFileSelected?: (file?: File) => void;
  helper?: string;
  error?: string;
  shape?: "square" | "wide";
  emptyIcon?: ReactNode;
  fit?: "contain" | "cover";
  disabled?: boolean;
  acceptedTypes?: readonly string[];
  maxBytes?: number;
  preserveTransparency?: boolean;
  onReadingChange?: (reading: boolean) => void;
};

export function ImageUploadField({
  label,
  value,
  onChange,
  onFileSelected,
  helper,
  error,
  shape = "wide",
  emptyIcon,
  fit,
  disabled = false,
  acceptedTypes,
  maxBytes = 10 * 1024 * 1024,
  preserveTransparency = false,
  onReadingChange,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [failedValue, setFailedValue] = useState<string | null>(null);

  const frameClass =
    shape === "square"
      ? "aspect-square w-32"
      : "aspect-[16/10] w-full";

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];

    if (!file || disabled || isReading) {
      return;
    }

    setLocalError("");
    setIsReading(true);
    onReadingChange?.(true);

    try {
      if (acceptedTypes && !acceptedTypes.includes(file.type.toLowerCase()))
        throw new Error("Please choose a PNG, JPG, or WebP image.");
      if (file.size === 0 || file.size > maxBytes)
        throw new Error(`Choose an image up to ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      const dataUrl = await readImageAsDataUrl(file, preserveTransparency ? "image/png" : "image/jpeg");
      onFileSelected?.(file);
      onChange(dataUrl);
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : "Could not read this image."
      );
    } finally {
      setIsReading(false);
      onReadingChange?.(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  const message = error || localError;

  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-sm font-bold text-pet-ink">{label}</span>

      {value ? (
        <div className="grid min-w-0 gap-3">
          <div
            className={`overflow-hidden rounded-[1.25rem] border border-pet-border bg-pet-cream ${frameClass}`}
          >
            {/* Data-URL preview; static export + local mock means no next/image. */}
            {failedValue === value ? <span role="img" aria-label={`${label} unavailable`} className="grid h-full w-full place-items-center text-pet-muted">
              <Icon name="home" className="h-8 w-8" />
            </span> : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${label} preview`}
              className={`h-full w-full ${
                (fit ?? (shape === "wide" ? "contain" : "cover")) === "contain" ? "object-contain" : "object-cover"
              }`}
              src={value}
              onError={() => setFailedValue(value)}
            />)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-ink transition hover:bg-pet-cream"
              onClick={() => inputRef.current?.click()}
              type="button"
              disabled={disabled || isReading}
            >
              <Icon name="settings" className="h-4 w-4" />
              Replace
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-pet-border bg-white px-4 py-2 text-sm font-bold text-pet-coral transition hover:bg-pet-apricot"
              onClick={() => {
                setLocalError("");
                onFileSelected?.(undefined);
                onChange("");
              }}
              type="button"
              disabled={disabled || isReading}
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
            JPG, PNG, or WebP, up to {Math.round(maxBytes / 1024 / 1024)}MB
          </span>
        </label>
      )}

      <input
        accept={acceptedTypes?.join(",") ?? "image/*"}
        disabled={disabled || isReading}
        aria-label={label}
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
