"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
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

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

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
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
        Loading email settings...
      </p>
    );
  }

  if (status === "error" || !data) {
    return (
      <p className="rounded-2xl border border-red-200 bg-white p-6 text-sm font-bold text-[#a63c2e]">
        {loadError ?? "We could not load email settings. Please try again. Nothing has been changed."}
      </p>
    );
  }

  const globalOff = !data.global.globalDeliveryEnabled;

  return (
    <div className="space-y-6">
      <AdminSection
        title="Email delivery"
        description="Set by the application environment. These cannot be changed here."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Global email delivery
            </dt>
            <dd className="mt-1 text-sm font-bold text-slate-800">
              {data.global.globalDeliveryEnabled ? "Enabled" : "Disabled"}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Mail service configuration
            </dt>
            <dd className="mt-1 text-sm font-bold text-slate-800">
              {data.global.smtpConfigured ? "Configured" : "Incomplete"}
            </dd>
          </div>
        </dl>
      </AdminSection>

      {message ? <AdminNotice>{message}</AdminNotice> : null}

      <AdminSection
        title="Customer emails"
        description="Turn each email on or off. Turning one on never sends past events."
      >
        <p className="mb-3 text-xs text-slate-500">
          <strong>Ready to send</strong> will go out on the next run.{" "}
          <strong>Paused</strong> is waiting only because global delivery is off.{" "}
          <strong>Blocked</strong> and <strong>held back</strong> will never be sent
          automatically.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">On since</th>
                <th className="py-2 pr-3">Last updated</th>
                <th className="py-2 pr-3">Ready to send</th>
                <th className="py-2 pr-3">Paused</th>
                <th className="py-2 pr-3">Blocked</th>
                <th className="py-2 pr-3">Held back</th>
                <th className="py-2 pr-3">Not delivered</th>
                <th className="py-2 pr-3">Sent</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.templates.map((template) => (
                <tr key={template.messageType} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3">
                    <div className="font-bold text-slate-800">{template.displayName}</div>
                    <div className="text-xs text-slate-500">{template.description}</div>
                    {template.isEnabled && globalOff ? (
                      <div className="mt-1 text-xs font-semibold text-[#a63c2e]">
                        This template is enabled, but global email delivery is disabled by the
                        application environment.
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 font-bold">{template.isEnabled ? "On" : "Off"}</td>
                  <td className="py-3 pr-3">{formatDate(template.enabledFromUtc)}</td>
                  <td className="py-3 pr-3">
                    <div>{formatDate(template.updatedAt)}</div>
                    <div className="text-xs text-slate-500">{template.updatedBy ?? "—"}</div>
                  </td>
                  <td className="py-3 pr-3">{template.eligibleCount}</td>
                  <td className="py-3 pr-3">{template.pausedCount}</td>
                  <td className="py-3 pr-3">{template.blockedCount}</td>
                  <td className="py-3 pr-3">{template.suppressedCount}</td>
                  <td className="py-3 pr-3">{template.failedCount}</td>
                  <td className="py-3 pr-3">{template.sentCount}</td>
                  <td className="py-3">
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() =>
                        template.isEnabled ? apply(template, false) : setConfirming(template)
                      }
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 disabled:opacity-50"
                    >
                      {pending === template.messageType
                        ? template.isEnabled
                          ? "Turning off..."
                          : "Turning on..."
                        : template.isEnabled
                          ? "Turn off"
                          : "Turn on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      {confirming ? (
        <div className="rounded-2xl border border-slate-300 bg-white p-5">
          <h3 className="text-base font-extrabold text-slate-900">
            Turn on {confirming.displayName}?
          </h3>
          <p className="mt-2 text-sm text-slate-600">{ENABLE_CONFIRMATION}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => apply(confirming, true)}
              disabled={pending !== null}
              className="rounded-full bg-[#1570ef] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending === confirming.messageType ? "Turning on..." : "Turn on"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={pending !== null}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
