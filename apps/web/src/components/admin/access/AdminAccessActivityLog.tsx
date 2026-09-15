"use client";

import { useState } from "react";
import { AdminActionButton, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { useAdminAccessQuery } from "@/lib/useAdminAccessQuery";
import { apiRequest } from "@/services/apiClient";
import { getAdminAccessError } from "@/services/adminAccessService";

type AuditEntry = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorType: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

type Scope = "access" | "all";

// Access-management actions in the wording an operator reads, so the history
// is a record of what happened rather than a list of internal event names.
const accessActionLabels: Record<string, string> = {
  "admin-access.user.roles-changed": "Changed someone’s roles",
  "admin-access.user.activated": "Turned on Admin Portal access",
  "admin-access.user.deactivated": "Turned off Admin Portal access",
  "admin-access.role.created": "Created a role",
  "admin-access.role.updated": "Changed what a role allows",
  "admin-access.role.deleted": "Deleted a role",
};

/**
 * Activity history.
 *
 * Defaults to access-management changes, because that is what this section is
 * for and what somebody reviewing security actually came to read.
 */
export function AdminAccessActivityLog() {
  const [scope, setScope] = useState<Scope>("access");

  const history = useAdminAccessQuery<AuditEntry[]>(
    scope,
    async (signal) => {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (scope === "access") params.set("action", "admin-access.");
      const response = await apiRequest<AuditEntry[]>(
        `/api/v1/admin/audit-logs?${params.toString()}`,
        { signal }
      );
      return response.data ?? [];
    },
    (error) => getAdminAccessError(error, "We couldn’t load the activity history.")
  );

  const entries = history.data ?? [];

  return (
    <AdminSection
      compact
      description="A record of who changed what, and when."
      title="Activity history"
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <div className="basis-56">
          <span className="block text-xs font-extrabold uppercase text-slate-500">Show</span>
          <div className="mt-1">
            <Select
              aria-label="Show"
              onChange={(value) => setScope(value as Scope)}
              options={[
                { value: "access", label: "Access changes only" },
                { value: "all", label: "Everything" },
              ]}
              value={scope}
            />
          </div>
        </div>
      </div>

      {history.error ? (
        <div className="p-5">
          <AdminNotice>{history.error}</AdminNotice>
          <div className="mt-3">
            <AdminActionButton onClick={history.reload}>Try again</AdminActionButton>
          </div>
        </div>
      ) : history.loading ? (
        <p className="p-5 text-sm text-slate-500">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState
          description={
            scope === "access"
              ? "Nothing has changed about who can use the Admin Portal yet."
              : "There is no recorded activity yet."
          }
          icon="record"
          title="Nothing to show"
        />
      ) : (
        <ul className="grid gap-2 p-5">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-black text-slate-900">
                  {accessActionLabels[entry.action] ?? entry.action}
                </span>
                <time className="text-xs text-slate-500" dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {entry.actorName
                  ? `By ${entry.actorName}${entry.actorEmail ? ` (${entry.actorEmail})` : ""}`
                  : entry.actorType === "System"
                    ? "Recorded automatically"
                    : "By an account that no longer has access"}
              </p>
              {entry.oldValue || entry.newValue ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {entry.oldValue ? (
                    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
                      <dt className="text-[0.65rem] font-extrabold uppercase text-slate-400">
                        Before
                      </dt>
                      <dd className="mt-1 break-words text-xs text-slate-700">
                        {summarise(entry.oldValue)}
                      </dd>
                    </div>
                  ) : null}
                  {entry.newValue ? (
                    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
                      <dt className="text-[0.65rem] font-extrabold uppercase text-slate-400">
                        After
                      </dt>
                      <dd className="mt-1 break-words text-xs text-slate-700">
                        {summarise(entry.newValue)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}

/**
 * Turns a recorded snapshot into a readable line. Falls back to the raw text
 * rather than hiding it, so nothing recorded is lost to a display decision.
 */
function summarise(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([key, entryValue]) => {
          const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
          const text = Array.isArray(entryValue)
            ? entryValue.length === 0
              ? "none"
              : entryValue.join(", ")
            : String(entryValue);
          return `${label}: ${text}`;
        })
        .join(" · ");
    }
    return String(parsed);
  } catch {
    return value;
  }
}
