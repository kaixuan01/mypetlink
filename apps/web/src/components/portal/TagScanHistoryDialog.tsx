"use client";

import { useEffect, useMemo, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { isApiClientError } from "@/services/apiClient";
import { getFriendlyTagErrorMessage, getTagScanHistory } from "@/services/tagService";
import type { TagScanHistoryItem, TagScanSource } from "@/types";

type OwnerScanFilter = "" | "Qr" | "Nfc";

type TagScanHistoryDialogProps = {
  hasNfc: boolean;
  onRequestClose: () => void;
  open: boolean;
  tagCode: string;
  tagId: string;
};

const pageSize = 20;

export function TagScanHistoryDialog({
  hasNfc,
  onRequestClose,
  open,
  tagCode,
  tagId,
}: TagScanHistoryDialogProps) {
  const [filter, setFilter] = useState<OwnerScanFilter>("");
  const [items, setItems] = useState<TagScanHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    let active = true;

    async function loadHistory() {
      setLoading(true);
      setError("");
      setItems([]);
      setPage(1);

      try {
        const history = await getTagScanHistory(
          tagId,
          filter || undefined,
          1,
          pageSize
        );
        if (!active) return;
        setItems(history.items);
        setTotal(history.total);
        setHasMore(history.hasMore);
      } catch (caught) {
        if (!active) return;
        setError(getScanHistoryErrorMessage(caught));
        setTotal(0);
        setHasMore(false);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [filter, open, tagId]);

  const groups = useMemo(() => groupScansByDate(items), [items]);
  const filters: { label: string; value: OwnerScanFilter }[] = [
    { label: "All", value: "" },
    { label: "QR", value: "Qr" },
    ...(hasNfc ? [{ label: "NFC", value: "Nfc" as const }] : []),
  ];

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    setError("");

    try {
      const history = await getTagScanHistory(
        tagId,
        filter || undefined,
        nextPage,
        pageSize
      );
      setItems((current) => [
        ...current,
        ...history.items.filter(
          (item) => !current.some((existing) => existing.id === item.id)
        ),
      ]);
      setPage(nextPage);
      setTotal(history.total);
      setHasMore(history.hasMore);
    } catch (caught) {
      setError(getScanHistoryErrorMessage(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <FormDialog
      description={`QR scans and NFC taps for ${tagCode}.`}
      eyebrow="Smart Tag activity"
      maxWidthClassName="sm:max-w-2xl"
      onRequestClose={onRequestClose}
      open={open}
      title="Scan history"
    >
      <div aria-label="Filter scan history" className="flex flex-wrap gap-2" role="group">
        {filters.map((option) => (
          <button
            aria-pressed={filter === option.value}
            className={`min-h-11 rounded-full px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal ${
              filter === option.value
                ? "bg-pet-teal text-white"
                : "border border-pet-border bg-white text-pet-ink hover:bg-pet-cream"
            }`}
            key={option.value || "all"}
            onClick={() => setFilter(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-5 text-sm font-semibold text-pet-muted" role="status">
          Loading scan history…
        </p>
      ) : error && !items.length ? (
        <p className="mt-5 text-sm font-semibold text-[#a63c2e]" role="alert">
          {error}
        </p>
      ) : !items.length ? (
        <div className="mt-5 rounded-[1.25rem] bg-pet-cream p-5">
          <h3 className="font-black text-pet-ink">No scans yet</h3>
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            {filter
              ? `No ${filter === "Qr" ? "QR scans" : "NFC taps"} match this view.`
              : "Activity will appear here after someone scans or taps this physical tag."}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5">
          <p className="text-xs font-bold text-pet-muted" aria-live="polite">
            Showing {items.length} of {total} scans
          </p>
          {groups.map((group) => (
            <section aria-labelledby={group.id} key={group.id}>
              <h3
                className="text-xs font-black uppercase tracking-wide text-pet-muted"
                id={group.id}
              >
                {group.label}
              </h3>
              <ol className="mt-2 divide-y divide-pet-border rounded-[1.25rem] bg-pet-cream px-4">
                {group.items.map((scan) => (
                  <li
                    className="flex min-h-12 items-center justify-between gap-4 py-3 text-sm"
                    key={scan.id}
                  >
                    <time
                      className="font-bold text-pet-ink"
                      dateTime={scan.scannedAt}
                    >
                      {formatScanTime(scan.scannedAt)}
                    </time>
                    <span className="font-semibold text-pet-muted">
                      {ownerScanSourceLabel(scan.scanSource)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {error ? (
            <p className="text-sm font-semibold text-[#a63c2e]" role="alert">
              {error}
            </p>
          ) : null}
          {hasMore ? (
            <button
              className="min-h-11 justify-self-center rounded-full border border-pet-border bg-white px-5 text-sm font-bold text-pet-ink transition hover:bg-pet-cream disabled:cursor-wait disabled:opacity-60"
              disabled={loadingMore}
              onClick={loadMore}
              type="button"
            >
              {loadingMore ? "Loading more…" : "Load more"}
            </button>
          ) : null}
        </div>
      )}
    </FormDialog>
  );
}

export function ownerScanSourceLabel(source: TagScanSource) {
  if (source === "Qr") return "QR scan";
  if (source === "Nfc") return "NFC tap";
  return "Other scan";
}

function formatScanTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-MY", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function groupScansByDate(items: TagScanHistoryItem[]) {
  const now = new Date();
  const todayKey = localDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);
  const groups = new Map<string, { id: string; label: string; items: TagScanHistoryItem[] }>();

  for (const item of items) {
    const date = new Date(item.scannedAt);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? localDateKey(date) : "unknown";
    const label = !valid
      ? "Date unavailable"
      : key === todayKey
        ? "Today"
        : key === yesterdayKey
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-MY", { dateStyle: "long" }).format(date);
    const group = groups.get(key) ?? {
      id: `scan-date-${key}`,
      label,
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function getScanHistoryErrorMessage(error: unknown) {
  if (isApiClientError(error) && error.code === "premium_feature_required") {
    return "Full scan history is not available on your current plan.";
  }
  return getFriendlyTagErrorMessage(error);
}
