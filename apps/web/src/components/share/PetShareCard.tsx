"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { copyTextToClipboard } from "@/components/portal/PublicLinkActions";
import { Icon } from "@/components/ui/Icon";
import {
  AnalyticsEvent,
  trackEvent,
  type AnalyticsCardAction,
} from "@/lib/analytics";
import {
  addPublicProfileShareVersion,
  getPetShareCardFileName,
  getPetShareCardMessage,
  getPublicProfileSocialTitle,
  publicProfileShareCardImageSize,
} from "@/lib/publicProfileSocial";
import { getServerFallbackBaseUrl, toAbsoluteUrl } from "@/lib/siteUrl";
import type { PetShareCardVariant } from "@/lib/petOccasions";

export type PetShareCardOption = {
  variant: PetShareCardVariant;
  label: string;
  imagePath: string;
};

type PetShareCardProps = {
  imagePath: string;
  petName: string;
  profilePath: string;
  shareVersion?: string;
  className?: string;
  variants?: PetShareCardOption[];
  initialVariant?: PetShareCardVariant;
  /** Replaces the default pill trigger, so the Share Center can present this as a full-width choice. */
  triggerLabel?: React.ReactNode;
  triggerClassName?: string;
};

type PreviewState = "loading" | "ready" | "error";

export function PetShareCard({
  imagePath,
  petName,
  profilePath,
  shareVersion,
  className = "",
  variants,
  initialVariant = "profile",
  triggerLabel,
  triggerClassName,
}: PetShareCardProps) {
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserOrigin,
    getServerOrigin
  );
  const nativeShareAvailable = useSyncExternalStore(
    subscribeToOrigin,
    getBrowserShareAvailability,
    getServerShareAvailability
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const viewTrackedRef = useRef(new Set<PetShareCardVariant>());
  const options = useMemo<PetShareCardOption[]>(
    () => variants?.length ? variants : [{ variant: "profile", label: "Profile", imagePath }],
    [imagePath, variants]
  );
  const initialOption = options.find((option) => option.variant === initialVariant) ?? options[0];
  const [selectedVariant, setSelectedVariant] = useState<PetShareCardVariant>(initialOption.variant);
  const selectedOption = options.find((option) => option.variant === selectedVariant) ?? initialOption;
  const [open, setOpen] = useState(false);
  const [previewState, setPreviewState] =
    useState<PreviewState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState("");
  const profileUrl = useMemo(
    () =>
      toAbsoluteUrl(
        addPublicProfileShareVersion(profilePath, shareVersion),
        origin
      ),
    [origin, profilePath, shareVersion]
  );
  const imageUrl = useMemo(() => {
    const absolute = toAbsoluteUrl(selectedOption.imagePath, origin);
    if (retryKey === 0) return absolute;

    try {
      const url = new URL(absolute);
      url.searchParams.set("retry", String(retryKey));
      return url.toString();
    } catch {
      return absolute;
    }
  }, [origin, retryKey, selectedOption.imagePath]);
  const fileName = getPetShareCardFileName(petName, selectedOption.variant);

  const closeDialog = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, open]);

  function openDialog() {
    viewTrackedRef.current.clear();
    setSelectedVariant(initialOption.variant);
    setPreviewState("loading");
    setStatus("");
    setOpen(true);
  }

  function handlePreviewLoaded() {
    setPreviewState("ready");
    if (!viewTrackedRef.current.has(selectedOption.variant)) {
      viewTrackedRef.current.add(selectedOption.variant);
      trackEvent(AnalyticsEvent.ShareCardViewed, { card_variant: selectedOption.variant });
    }
  }

  function selectVariant(variant: PetShareCardVariant) {
    if (variant === selectedOption.variant) return;
    setSelectedVariant(variant);
    setPreviewState("loading");
    setRetryKey(0);
    setStatus("");
  }

  function retryPreview() {
    setPreviewState("loading");
    setRetryKey((value) => value + 1);
  }

  function trackCardAction(action: AnalyticsCardAction) {
    trackEvent(AnalyticsEvent.ShareCardAction, {
      card_action: action,
      card_variant: selectedOption.variant,
    });
  }

  // Recorded on clipboard success only, and from every route that reaches it —
  // including the Share fallback — because the measurable outcome is the same:
  // the owner now has this pet's profile link to paste.
  async function copyProfileLink(message = "Profile link copied.") {
    const copied = await copyTextToClipboard(profileUrl);
    if (copied) {
      trackCardAction("copy_link");
    }
    setStatus(
      copied
        ? message
        : "Unable to copy automatically. Please select and copy the profile link."
    );
    return copied;
  }

  async function handleShare() {
    setStatus("");

    if (typeof navigator.share !== "function") {
      await copyProfileLink(
        "Native sharing is unavailable here, so the profile link was copied."
      );
      return;
    }

    let file: File | null = null;
    try {
      const blob = await fetchShareCardBlob(imageUrl);
      if (typeof File !== "undefined") {
        file = new File([blob], fileName, { type: "image/jpeg" });
      }
    } catch {
      // The public profile share below remains available without a card file.
    }

    // Exactly one native share per user click, whichever branch runs. The
    // profile URL rides inside `text` rather than as a separate `url`, because
    // targets that accept files commonly drop `url` - and those that keep both
    // would show the same link twice.
    if (file && canShareFiles(file)) {
      const requested = await requestNativeShare({
        files: [file],
        text: `${getPetShareCardMessage(petName)}\n${profileUrl}`,
        title: getPublicProfileSocialTitle(petName),
      });
      if (requested === "completed" || requested === "cancelled") return;
    } else {
      const requested = await requestNativeShare({
        text: getPetShareCardMessage(petName),
        title: getPublicProfileSocialTitle(petName),
        url: profileUrl,
      });
      if (requested === "completed" || requested === "cancelled") return;
    }

    await copyProfileLink(
      "Sharing could not open, so the profile link was copied instead."
    );
  }

  async function requestNativeShare(data: ShareData) {
    try {
      await navigator.share(data);
      trackEvent(AnalyticsEvent.ShareCardShared, { card_variant: selectedOption.variant });
      setStatus("Share options opened.");
      return "completed" as const;
    } catch (error) {
      if (isShareCancellation(error)) {
        setStatus("");
        return "cancelled" as const;
      }
      return "failed" as const;
    }
  }

  async function handleSave() {
    setStatus("");
    try {
      const blob = await fetchShareCardBlob(imageUrl);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      // Only once a valid image was fetched and the download actually started.
      // A failed or rejected fetch throws above and records nothing.
      trackCardAction("save");
      setStatus("Image download started.");
    } catch {
      setStatus("We couldn't save the image. Please try again.");
    }
  }

  return (
    <>
      <button
        className={[
          triggerClassName ??
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-coral bg-pet-coral px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#f26155]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        {triggerLabel ?? (
          <>
            <Icon className="h-4 w-4" name="heart" />
            Share Card
          </>
        )}
      </button>

      {open ? (
        <div
          aria-labelledby="pet-share-card-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#102247]/55 p-2 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
          role="dialog"
        >
          <section className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-pet-border bg-pet-cream p-4 pb-6 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem] sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-pet-coral">
                  Ready to share
                </p>
                <h2
                  className="mt-1 text-2xl font-black text-pet-ink"
                  id="pet-share-card-title"
                >
                  {petName}&apos;s Share Card
                </h2>
                <p className="mt-1 text-sm leading-6 text-pet-muted">
                  Share the image or save it for later.
                </p>
              </div>
              <button
                aria-label="Close Share Card"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-pet-border bg-white text-pet-ink transition hover:bg-pet-cream"
                onClick={closeDialog}
                ref={closeRef}
                type="button"
              >
                <Icon className="h-5 w-5" name="close" />
              </button>
            </div>

            {options.length > 1 ? (
              <div
                aria-label="Share Card style"
                className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-white p-1"
                role="group"
              >
                {options.map((option) => (
                  <button
                    aria-pressed={option.variant === selectedOption.variant}
                    className={`min-h-11 rounded-xl px-2 text-xs font-extrabold transition ${
                      option.variant === selectedOption.variant
                        ? "bg-pet-teal text-white"
                        : "text-pet-muted hover:bg-pet-cream"
                    }`}
                    key={option.variant}
                    onClick={() => selectVariant(option.variant)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div
              aria-busy={previewState === "loading"}
              className="relative mt-4 aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-pet-border bg-white shadow-lg shadow-[#102247]/10"
            >
              {previewState === "loading" ? (
                <div
                  className="absolute inset-0 z-10 grid place-items-center bg-white px-6 text-center text-sm font-bold text-pet-muted"
                  role="status"
                >
                  Preparing the Share Card…
                </div>
              ) : null}
              {previewState === "error" ? (
                <div
                  className="absolute inset-0 z-20 grid place-items-center bg-white p-6 text-center"
                  role="alert"
                >
                  <div>
                    <p className="font-black text-pet-ink">
                      We couldn&apos;t load the Share Card.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-pet-muted">
                      Check your connection and try again.
                    </p>
                    <button
                      className="mt-4 min-h-11 rounded-full border border-pet-border bg-pet-cream px-5 text-sm font-extrabold text-pet-ink"
                      onClick={retryPreview}
                      type="button"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : null}
              {/* The image is mounted only while this owner-opened dialog is visible. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`${petName}'s MyPetLink ${
                  selectedOption.variant === "profile" ? "" : `${selectedOption.label} `
                }Share Card`}
                className={`h-full w-full object-contain transition-opacity ${
                  previewState === "ready" ? "opacity-100" : "opacity-0"
                }`}
                height={publicProfileShareCardImageSize.height}
                onError={() => setPreviewState("error")}
                onLoad={handlePreviewLoaded}
                src={imageUrl}
                width={publicProfileShareCardImageSize.width}
              />
            </div>

            <div className="mt-4 grid gap-2">
              {nativeShareAvailable ? (
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-pet-teal px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0f5fd0]"
                  onClick={handleShare}
                  type="button"
                >
                  <Icon aria-hidden="true" className="h-4 w-4" name="heart" />
                  Share
                </button>
              ) : null}
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
                onClick={handleSave}
                type="button"
              >
                <Icon aria-hidden="true" className="h-4 w-4" name="record" />
                Save Image
              </button>
              {/* Same actions as before, demoted to text so Share and Save lead. */}
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                <button
                  className="inline-flex min-h-11 items-center text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
                  onClick={() => void copyProfileLink()}
                  type="button"
                >
                  Copy profile link
                </button>
                <a
                  className="inline-flex min-h-11 items-center text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
                  href={imageUrl}
                  onClick={() => trackCardAction("open_image")}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View full image
                </a>
              </div>
            </div>

            {status ? (
              <p
                aria-live="polite"
                className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-pet-muted"
                role="status"
              >
                {status}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function subscribeToOrigin() {
  return () => {};
}

function getBrowserOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return getServerFallbackBaseUrl();
}

function getBrowserShareAvailability() {
  return typeof navigator.share === "function";
}

function getServerShareAvailability() {
  return false;
}

function canShareFiles(file: File) {
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function isShareCancellation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

async function fetchShareCardBlob(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "image/jpeg" },
  });
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .toLowerCase();
  if (!response.ok || contentType !== "image/jpeg") {
    throw new Error("Share Card image unavailable.");
  }

  const blob = await response.blob();
  if (blob.size === 0 || (blob.type && blob.type !== "image/jpeg")) {
    throw new Error("Share Card image invalid.");
  }
  return blob.type === "image/jpeg"
    ? blob
    : new Blob([blob], { type: "image/jpeg" });
}
