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
import { AnalyticsEvent, trackEvent } from "@/lib/analytics";
import {
  addPublicProfileShareVersion,
  getPetShareCardFileName,
  getPublicProfileSocialDescription,
  getPublicProfileSocialTitle,
  publicProfileShareCardImageSize,
} from "@/lib/publicProfileSocial";
import { getServerFallbackBaseUrl, toAbsoluteUrl } from "@/lib/siteUrl";

type PetShareCardProps = {
  imagePath: string;
  petName: string;
  profilePath: string;
  shareVersion?: string;
  className?: string;
};

type PreviewState = "loading" | "ready" | "error";

export function PetShareCard({
  imagePath,
  petName,
  profilePath,
  shareVersion,
  className = "",
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
  const viewTrackedRef = useRef(false);
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
    const absolute = toAbsoluteUrl(imagePath, origin);
    if (retryKey === 0) return absolute;

    try {
      const url = new URL(absolute);
      url.searchParams.set("retry", String(retryKey));
      return url.toString();
    } catch {
      return absolute;
    }
  }, [imagePath, origin, retryKey]);
  const fileName = getPetShareCardFileName(petName);

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
    viewTrackedRef.current = false;
    setPreviewState("loading");
    setStatus("");
    setOpen(true);
  }

  function handlePreviewLoaded() {
    setPreviewState("ready");
    if (!viewTrackedRef.current) {
      viewTrackedRef.current = true;
      trackEvent(AnalyticsEvent.ShareCardViewed, { card_variant: "profile" });
    }
  }

  function retryPreview() {
    setPreviewState("loading");
    setRetryKey((value) => value + 1);
  }

  async function copyProfileLink(message = "Profile link copied.") {
    const copied = await copyTextToClipboard(profileUrl);
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

    if (file && canShareFiles(file)) {
      const requested = await requestNativeShare({
        files: [file],
        text: `${getPublicProfileSocialDescription(petName)}\n${profileUrl}`,
        title: getPublicProfileSocialTitle(petName),
      });
      if (requested === "completed" || requested === "cancelled") return;
    } else {
      const requested = await requestNativeShare({
        text: getPublicProfileSocialDescription(petName),
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
      trackEvent(AnalyticsEvent.ShareCardShared, { card_variant: "profile" });
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
      setStatus("Image download started.");
    } catch {
      setStatus("We couldn't save the image. Please try again.");
    }
  }

  return (
    <>
      <button
        className={[
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-pet-coral bg-pet-coral px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#f26155]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        <Icon className="h-4 w-4" name="heart" />
        Share Card
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
                alt={`${petName}'s MyPetLink Share Card`}
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

            <div className="mt-4 grid grid-cols-2 gap-2">
              {nativeShareAvailable ? (
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-pet-teal px-4 text-sm font-extrabold text-white"
                  onClick={handleShare}
                  type="button"
                >
                  <Icon className="h-4 w-4" name="heart" />
                  Share
                </button>
              ) : null}
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 text-sm font-extrabold text-pet-ink"
                onClick={handleSave}
                type="button"
              >
                <Icon className="h-4 w-4" name="record" />
                Save Image
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-4 text-sm font-extrabold text-pet-ink"
                onClick={() => void copyProfileLink()}
                type="button"
              >
                <Icon className="h-4 w-4" name="copy" />
                Copy Profile Link
              </button>
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-center text-sm font-extrabold text-pet-ink"
                href={imageUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open Image
              </a>
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
