"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import {
  AdminEmptyPanel,
  AdminStat,
  AdminStatStrip,
  AdminStatusBadge,
  AdminStatusCard,
} from "@/components/admin/AdminStatus";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isApiClientError } from "@/services/apiClient";
import {
  getEmailTemplateErrorMessage,
  listEmailTemplates,
  setEmailTemplateEnabled,
  type AdminEmailTemplate,
  type AdminEmailTemplateList,
} from "@/services/adminEmailTemplateService";

const ENABLE_CONFIRMATION =
  "Only new eligible events will be sent automatically. Historical emails will remain blocked until reviewed.";

export function AdminEmailTemplatesManager() {
  const [data, setData] = useState<AdminEmailTemplateList | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminEmailTemplate | null>(null);
  const pendingRef = useRef<string | null>(null);

  // The promise callback keeps state updates out of the synchronous effect
  // body, which is what the React lint rule requires.
  const load = useCallback(
    () =>
      listEmailTemplates()
        .then((response) => {
          setData(response.data ?? null);
          setLoadError(null);
          setStatus("ready");
        })
        .catch((error) => {
          setLoadError(getEmailTemplateErrorMessage(error));
          setStatus("error");
        }),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const templates = data?.templates ?? [];
    return {
      on: templates.filter((template) => template.isEnabled).length,
      eligible: sum(templates, (item) => item.eligibleCount),
      paused: sum(templates, (item) => item.pausedCount),
      withheld: sum(templates, (item) => item.blockedCount + item.suppressedCount),
      failed: sum(templates, (item) => item.failedCount),
      sent: sum(templates, (item) => item.sentCount),
    };
  }, [data]);

  async function apply(template: AdminEmailTemplate, isEnabled: boolean) {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = template.messageType;
    setPending(template.messageType);
    setMessage(null);
    try {
      const response = await setEmailTemplateEnabled(
        template.messageType,
        isEnabled,
        template.rowVersion
      );
      const updatedTemplate = response.data;
      if (updatedTemplate) {
        setData((current) =>
          current
            ? {
                ...current,
                templates: current.templates.map((item) =>
                  item.messageType === updatedTemplate.messageType
                    ? updatedTemplate
                    : item
                ),
              }
            : current
        );
      }
      setMessage(
        isEnabled
          ? `${template.displayName} is now on. ${ENABLE_CONFIRMATION}`
          : `${template.displayName} is now off. Nothing new will be sent.`
      );
      await load();
    } catch (error) {
      setMessage(getEmailTemplateErrorMessage(error));
      if (
        isApiClientError(error) &&
        (error.code === "concurrency_conflict" || error.status === 409)
      ) {
        await load();
      }
    } finally {
      pendingRef.current = null;
      setPending(null);
      setConfirming(null);
    }
  }

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
        Loading email settings...
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-6 shadow-sm" role="alert">
        <p className="text-sm font-black text-[#a63c2e]">
          We could not load email settings.
        </p>
        <p className="mt-1 text-sm leading-6 text-[#a63c2e]">
          {loadError ?? "Please try again in a moment. Nothing has been changed."}
        </p>
      </div>
    );
  }

  const globalOn = data.global.globalDeliveryEnabled;
  const smtpReady = data.global.smtpConfigured;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <AdminStatusCard
          detail={
            globalOn
              ? "MyPetLink can send customer emails. Each email below still follows its own setting."
              : "All customer email is paused. Messages keep queueing and send once delivery is switched back on."
          }
          footnote={
            <AdminStatusBadge tone="neutral">
              Set by the application environment
            </AdminStatusBadge>
          }
          icon="shield"
          label="Global email delivery"
          status={globalOn ? "Enabled" : "Paused"}
          tone={globalOn ? "positive" : "warning"}
        />
        <AdminStatusCard
          detail={
            smtpReady
              ? "The mail service details needed to send email are in place."
              : "Sending details are missing, so no email can leave MyPetLink until they are added."
          }
          footnote={<AdminStatusBadge tone="neutral">Read-only</AdminStatusBadge>}
          icon="settings"
          label="Mail service configuration"
          status={smtpReady ? "Configured" : "Incomplete"}
          tone={smtpReady ? "positive" : "critical"}
        />
      </div>

      <AdminStatStrip>
        <AdminStat label="Emails switched on" tone="positive" value={totals.on} />
        <AdminStat
          hint="Next run"
          label="Ready to send"
          tone="positive"
          value={totals.eligible}
        />
        <AdminStat
          hint="Waiting on delivery"
          label="Paused"
          tone="warning"
          value={totals.paused}
        />
        <AdminStat hint="Never sends" label="Held back" value={totals.withheld} />
        <AdminStat label="Not delivered" tone="critical" value={totals.failed} />
        <AdminStat label="Sent" value={totals.sent} />
      </AdminStatStrip>

      {message ? <AdminNotice>{message}</AdminNotice> : null}

      <AdminSection
        description="Switching an email on only affects events from that moment onward."
        title="Customer emails"
      >
        {data.templates.length === 0 ? (
          <AdminEmptyPanel
            description="Email types appear here as they are added to MyPetLink."
            title="No customer emails yet"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.templates.map((template) => (
              <li
                className="p-4 transition hover:bg-slate-50/60 sm:p-5"
                key={template.messageType}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 lg:max-w-md">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-slate-950">
                        {template.displayName}
                      </h3>
                      <AdminStatusBadge
                        dot
                        tone={template.isEnabled ? "positive" : "neutral"}
                      >
                        {template.isEnabled ? "On" : "Off"}
                      </AdminStatusBadge>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {template.description}
                    </p>
                    {template.isEnabled && !globalOn ? (
                      <p className="mt-2 rounded-lg bg-[#fdf6e7] px-3 py-2 text-xs font-bold leading-5 text-[#8a5a10]">
                        This email is on, but global email delivery is paused by the
                        application environment, so nothing is sending yet.
                      </p>
                    ) : null}
                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <div>
                        <dt className="inline font-bold text-slate-400">On since </dt>
                        <dd className="inline">
                          {template.enabledFromUtc
                            ? formatAdminDateTime(template.enabledFromUtc)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-slate-400">Updated </dt>
                        <dd className="inline">
                          {template.updatedAt
                            ? formatAdminDateTime(template.updatedAt)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline font-bold text-slate-400">By </dt>
                        <dd className="inline">{template.updatedBy ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex min-w-0 flex-col gap-3 lg:items-end">
                    <div className="flex flex-wrap gap-1.5 lg:justify-end">
                      <CountChip
                        label="Ready"
                        tone="positive"
                        value={template.eligibleCount}
                      />
                      <CountChip
                        label="Paused"
                        tone="warning"
                        value={template.pausedCount}
                      />
                      <CountChip label="Blocked" value={template.blockedCount} />
                      <CountChip label="Held back" value={template.suppressedCount} />
                      <CountChip
                        label="Not delivered"
                        tone="critical"
                        value={template.failedCount}
                      />
                      <CountChip label="Sent" value={template.sentCount} />
                    </div>
                    <button
                      className={`inline-flex min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
                        template.isEnabled
                          ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          : "bg-pet-teal text-white hover:bg-[#1160d4]"
                      }`}
                      disabled={pending !== null}
                      onClick={() =>
                        template.isEnabled ? apply(template, false) : setConfirming(template)
                      }
                      type="button"
                    >
                      {pending === template.messageType
                        ? template.isEnabled
                          ? "Turning off..."
                          : "Turning on..."
                        : template.isEnabled
                          ? "Turn off"
                          : "Turn on"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-5">
          <span className="font-bold text-slate-600">Ready</span> goes out on the next
          run. <span className="font-bold text-slate-600">Paused</span> is waiting only
          because global delivery is off.{" "}
          <span className="font-bold text-slate-600">Blocked</span> and{" "}
          <span className="font-bold text-slate-600">held back</span> are never sent
          automatically.
        </p>
      </AdminSection>

      <ConfirmDialog
        confirmDisabled={pending !== null}
        confirmLabel={
          confirming && pending === confirming.messageType ? "Turning on..." : "Turn on"
        }
        message={ENABLE_CONFIRMATION}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) {
            void apply(confirming, true);
          }
        }}
        open={confirming !== null}
        title={confirming ? `Turn on ${confirming.displayName}?` : ""}
      />
    </div>
  );
}

function CountChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "positive" | "warning" | "critical" | "neutral";
}) {
  // A zero count stays quiet so only real numbers draw the eye.
  const accents =
    value === 0
      ? "border-slate-200 bg-white text-slate-400"
      : {
          positive: "border-[#bfe7d4] bg-[#eefaf4] text-[#166b48]",
          warning: "border-[#f6dfae] bg-[#fdf6e7] text-[#8a5a10]",
          critical: "border-[#ffd2c9] bg-[#fff2ef] text-[#a63c2e]",
          neutral: "border-slate-200 bg-slate-50 text-slate-700",
        }[tone];

  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-lg border px-2 py-1 text-xs ${accents}`}
    >
      <span className="font-black tabular-nums">{value}</span>
      <span className="font-semibold">{label}</span>
    </span>
  );
}

function sum(
  items: AdminEmailTemplate[],
  pick: (item: AdminEmailTemplate) => number
) {
  return items.reduce((total, item) => total + pick(item), 0);
}
