"use client";

import { useEffect, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import {
  getOperationalStatus,
  type AdminOperationalStatus,
} from "@/services/adminOperationalStatusService";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "None yet";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "None yet" : parsed.toLocaleString();
}

export function AdminOperationalStatusView() {
  const [data, setData] = useState<AdminOperationalStatus | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    getOperationalStatus()
      .then((response) => {
        setData(response.data ?? null);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
        Loading operational status...
      </p>
    );
  }

  if (status === "error" || !data) {
    return (
      <p className="rounded-2xl border border-red-200 bg-white p-6 text-sm font-bold text-[#a63c2e]">
        We could not load operational status. Please try again in a moment.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <AdminNotice>
        This page is read-only. These settings are controlled by the application environment and
        cannot be changed from the Admin Portal.
      </AdminNotice>

      <AdminSection title="Email" description="Delivery of customer emails.">
        <Row
          label="Global email delivery"
          value={data.email.globalDeliveryEnabled ? "Enabled" : "Disabled"}
        />
        <Row
          label="Mail service configuration"
          value={data.email.smtpConfigured ? "Configured" : "Incomplete"}
        />
        <Row
          label="Email template configuration"
          value={data.email.templateConfigurationAvailable ? "Available" : "Unavailable"}
        />
        <Row label="Emails switched on" value={`${data.email.enabledTemplateCount}`} />
        <Row label="Waiting to send" value={`${data.email.outboxPendingCount}`} />
        <Row
          label="Paused by global switch"
          value={`${data.email.outboxPausedByGlobalSwitchCount}`}
        />
        <Row label="Held back" value={`${data.email.outboxSuppressedCount}`} />
        <Row label="Not delivered" value={`${data.email.outboxFailedCount}`} />
        <Row
          label="Last successful delivery"
          value={formatDate(data.email.lastSuccessfulDeliveryAt)}
        />
      </AdminSection>

      <AdminSection title="Photo and file storage" description="Where uploaded media is kept.">
        <Row label="Storage location" value={data.storage.provider} />
        <Row
          label="Configuration"
          value={data.storage.configurationComplete ? "Complete" : "Incomplete"}
        />
      </AdminSection>

      <AdminSection
        title="Public links"
        description="Needed for shareable profiles and printed tag links."
      >
        <Row
          label="Public website address"
          value={data.publicRouting.publicSiteBaseUrlConfigured ? "Configured" : "Not configured"}
        />
        <Row
          label="Tag link generation"
          value={
            data.publicRouting.smartTagLinkGenerationAvailable ? "Available" : "Unavailable"
          }
        />
      </AdminSection>

      <AdminSection title="Ordering" description="Whether customers can place tag orders.">
        <Row label="Ordering" value={data.ordering.orderingEnabled ? "Enabled" : "Disabled"} />
        <Row label="Active delivery zones" value={`${data.ordering.activeDeliveryZoneCount}`} />
        <Row
          label="Checkout"
          value={data.ordering.checkoutAvailable ? "Available" : "Unavailable"}
        />
      </AdminSection>
    </div>
  );
}
