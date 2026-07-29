"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import {
  AdminStat,
  AdminStatStrip,
  AdminStatusBadge,
  AdminStatusRow,
} from "@/components/admin/AdminStatus";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  getOperationalStatus,
  type AdminOperationalStatus,
} from "@/services/adminOperationalStatusService";

/**
 * Read-only system overview. Every value is derived from configuration or
 * database state actually in effect, so a status here can be acted on.
 *
 * "Configured", "Enabled" and "Available" mean different things and are shown
 * as different states on purpose.
 */
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
        Loading operational status...
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-6 shadow-sm" role="alert">
        <p className="text-sm font-black text-[#a63c2e]">
          We could not load operational status.
        </p>
        <p className="mt-1 text-sm leading-6 text-[#a63c2e]">
          Please try again in a moment.
        </p>
      </div>
    );
  }

  const { email, storage, publicRouting, ordering } = data;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <AdminStatusBadge tone="neutral">Read-only</AdminStatusBadge>
        <p className="min-w-0 text-sm leading-6 text-slate-500">
          These settings are controlled by the application environment and cannot
          be changed from the Admin Portal.
        </p>
      </div>

      <AdminStatStrip>
        <AdminStat
          label="Email delivery"
          tone={email.globalDeliveryEnabled ? "positive" : "warning"}
          value={email.globalDeliveryEnabled ? "On" : "Paused"}
        />
        <AdminStat
          label="Mail service"
          tone={email.smtpConfigured ? "positive" : "critical"}
          value={email.smtpConfigured ? "Ready" : "Incomplete"}
        />
        <AdminStat
          label="File storage"
          tone={storage.configurationComplete ? "positive" : "critical"}
          value={storage.configurationComplete ? "Ready" : "Incomplete"}
        />
        <AdminStat
          label="Public links"
          tone={publicRouting.publicSiteBaseUrlConfigured ? "positive" : "critical"}
          value={publicRouting.publicSiteBaseUrlConfigured ? "Ready" : "Missing"}
        />
        <AdminStat
          hint="Delivery zones"
          label="Active zones"
          tone={ordering.activeDeliveryZoneCount > 0 ? "positive" : "warning"}
          value={ordering.activeDeliveryZoneCount}
        />
        <AdminStat
          label="Checkout"
          tone={ordering.checkoutAvailable ? "positive" : "warning"}
          value={ordering.checkoutAvailable ? "Open" : "Closed"}
        />
      </AdminStatStrip>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatusPanel
          description="Delivery of customer emails."
          icon="shield"
          title="Email"
        >
          <AdminStatusRow
            label="Global email delivery"
            tone={email.globalDeliveryEnabled ? "positive" : "warning"}
            value={email.globalDeliveryEnabled ? "Enabled" : "Paused"}
          />
          <AdminStatusRow
            label="Mail service configuration"
            tone={email.smtpConfigured ? "positive" : "critical"}
            value={email.smtpConfigured ? "Configured" : "Incomplete"}
          />
          <AdminStatusRow
            label="Email template configuration"
            tone={email.templateConfigurationAvailable ? "positive" : "critical"}
            value={email.templateConfigurationAvailable ? "Available" : "Unavailable"}
          />
          <AdminStatusRow
            label="Emails switched on"
            value={email.enabledTemplateCount}
          />
          <AdminStatusRow
            hint="Queued and not yet sent"
            label="Waiting to send"
            value={email.outboxPendingCount}
          />
          <AdminStatusRow
            hint="Resumes when delivery is switched on"
            label="Paused by global switch"
            tone={email.outboxPausedByGlobalSwitchCount > 0 ? "warning" : undefined}
            value={email.outboxPausedByGlobalSwitchCount}
          />
          <AdminStatusRow
            hint="Never sent automatically"
            label="Held back"
            value={email.outboxSuppressedCount}
          />
          <AdminStatusRow
            label="Not delivered"
            tone={email.outboxFailedCount > 0 ? "critical" : undefined}
            value={email.outboxFailedCount}
          />
          <AdminStatusRow
            label="Last successful delivery"
            value={
              email.lastSuccessfulDeliveryAt
                ? formatAdminDateTime(email.lastSuccessfulDeliveryAt)
                : "None yet"
            }
          />
        </StatusPanel>

        <div className="grid gap-4">
          <StatusPanel
            description="Where uploaded photos and files are kept."
            icon="copy"
            title="Photo and file storage"
          >
            <AdminStatusRow label="Storage location" value={storage.provider} />
            <AdminStatusRow
              label="Configuration"
              tone={storage.configurationComplete ? "positive" : "critical"}
              value={storage.configurationComplete ? "Complete" : "Incomplete"}
            />
          </StatusPanel>

          <StatusPanel
            description="Needed for shareable profiles and printed tag links."
            icon="qr"
            title="Public links"
          >
            <AdminStatusRow
              label="Public website address"
              tone={publicRouting.publicSiteBaseUrlConfigured ? "positive" : "critical"}
              value={
                publicRouting.publicSiteBaseUrlConfigured ? "Configured" : "Not configured"
              }
            />
            <AdminStatusRow
              hint="Links printed on physical tags"
              label="Tag link generation"
              tone={publicRouting.smartTagLinkGenerationAvailable ? "positive" : "critical"}
              value={
                publicRouting.smartTagLinkGenerationAvailable ? "Available" : "Unavailable"
              }
            />
          </StatusPanel>

          <StatusPanel
            description="Whether customers can place tag orders."
            icon="tag"
            title="Ordering"
          >
            <AdminStatusRow
              label="Ordering"
              tone={ordering.orderingEnabled ? "positive" : "neutral"}
              value={ordering.orderingEnabled ? "Enabled" : "Disabled"}
            />
            <AdminStatusRow
              hint="At least one zone is required for checkout"
              label="Active delivery zones"
              tone={ordering.activeDeliveryZoneCount > 0 ? "positive" : "warning"}
              value={ordering.activeDeliveryZoneCount}
            />
            <AdminStatusRow
              label="Checkout"
              tone={ordering.checkoutAvailable ? "positive" : "warning"}
              value={ordering.checkoutAvailable ? "Available" : "Unavailable"}
            />
          </StatusPanel>
        </div>
      </div>
    </div>
  );
}

function StatusPanel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <AdminSection
      action={
        <span className="hidden rounded-xl bg-slate-100 p-2.5 text-slate-400 sm:inline-flex">
          <Icon className="h-4 w-4" name={icon} />
        </span>
      }
      description={description}
      title={title}
    >
      <div className="px-4 py-1 sm:px-5">{children}</div>
    </AdminSection>
  );
}
