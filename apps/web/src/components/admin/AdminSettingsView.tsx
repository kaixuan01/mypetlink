"use client";

import { useEffect, useState } from "react";
import { AdminDetailItem, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { apiRequest } from "@/services/apiClient";
import { isApiConfigured } from "@/services/apiConfig";

type AdminSettingsResponse = {
  settings: { key: string; valueJson: string; category: string; description?: string | null }[];
  features: {
    premiumStatus: string;
    gpsStatus: string;
    paymentGatewayEnabled: boolean;
    fileStorageEnabled: boolean;
    smartTagOrderingEnabled: boolean;
  };
};

function displayValue(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return value;
  }
}

export function AdminSettingsView() {
  const apiMode = isApiConfigured();
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    apiMode ? "loading" : "ready"
  );

  useEffect(() => {
    let active = true;
    if (!apiMode) {
      return () => { active = false; };
    }
    apiRequest<AdminSettingsResponse>("/api/v1/admin/settings")
      .then((response) => {
        if (active) {
          setData(response.data ?? null);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => { active = false; };
  }, [apiMode]);

  if (status === "loading") {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">Loading settings...</p>;
  }
  if (status === "error") {
    return <p className="rounded-2xl border border-red-200 bg-white p-6 text-sm font-bold text-[#a63c2e]">We couldn&apos;t load settings. Please try again. Your data has not been changed.</p>;
  }

  return (
    <div className="grid gap-4">
      <AdminNotice>These settings are read-only. Editable operations settings are coming later.</AdminNotice>
      <AdminSection title="Feature availability" description="Current product availability.">
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminDetailItem label="Premium" value={data?.features.premiumStatus ?? "Coming later"} />
          <AdminDetailItem label="GPS Safety" value={data?.features.gpsStatus ?? "Coming later"} />
          <AdminDetailItem label="Smart Tag ordering" value={data?.features.smartTagOrderingEnabled ? "Available" : "Unavailable"} />
        </div>
      </AdminSection>
      <AdminSection title="Operations settings" description="Configuration currently used by MyPetLink.">
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.settings ?? []).map((setting) => (
            <AdminDetailItem key={setting.key} label={setting.description || setting.key} value={displayValue(setting.valueJson)} />
          ))}
          {data && data.settings.length === 0 ? <p className="text-sm font-semibold text-slate-500">No operations settings have been configured yet.</p> : null}
          {!data ? <p className="text-sm font-semibold text-slate-500">Settings are available when connected to MyPetLink.</p> : null}
        </div>
      </AdminSection>
    </div>
  );
}
