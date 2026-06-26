"use client";

import { useState } from "react";
import { getQrStatusLabel } from "@/components/portal/ProfileAccessStatus";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { ShareProfileLink } from "@/components/share/ShareProfileLink";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { ownerRoutes } from "@/lib/routes";
import type { CareRecord, Pet, PetMoment, PetTag } from "@/types";

type TabId = "overview" | "records" | "moments" | "tag" | "settings";

type PetManagementTabsProps = {
  pet: Pet;
  records: CareRecord[];
  moments: PetMoment[];
  tags: PetTag[];
};

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "records", label: "Records" },
  { id: "moments", label: "Moments" },
  { id: "tag", label: "Smart Tag" },
  { id: "settings", label: "Settings" },
];

export function PetManagementTabs({
  pet,
  records,
  moments,
  tags,
}: PetManagementTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-full border border-pet-border bg-white p-1">
        {tabs.map((tab) => (
          <button
            className={`min-h-10 shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              activeTab === tab.id
                ? "bg-pet-teal text-white"
                : "text-pet-muted hover:text-pet-ink"
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <OverviewTab pet={pet} records={records} moments={moments} tags={tags} />
      ) : null}

      {activeTab === "records" ? (
        <RecordsManager petId={pet.id} initialRecords={records} />
      ) : null}

      {activeTab === "moments" ? (
        <PetMomentsManager pet={pet} initialMoments={moments} />
      ) : null}

      {activeTab === "tag" ? (
        <TagManagementPanel pets={[pet]} initialTags={tags} petId={pet.id} />
      ) : null}

      {activeTab === "settings" ? <SettingsTab pet={pet} /> : null}
    </div>
  );
}

function OverviewTab({
  pet,
  records,
  moments,
  tags,
}: {
  pet: Pet;
  records: CareRecord[];
  moments: PetMoment[];
  tags: PetTag[];
}) {
  const recentRecords = records.slice(0, 3);
  const recentMoments = moments
    .filter((moment) => moment.visibility === "Public")
    .slice(0, 3);
  const activeTag = tags.find((tag) => tag.status === "Active") ?? tags[0];
  const contactItems = [
    { label: "Owner name", enabled: pet.visibility.showOwnerName },
    { label: "Phone", enabled: pet.visibility.showPhone },
    { label: "WhatsApp", enabled: pet.visibility.showWhatsapp },
    { label: "General area", enabled: pet.visibility.showGeneralArea },
    { label: "Emergency note", enabled: pet.visibility.showEmergencyNote },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="brand-card rounded-[1.75rem] p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-pet-ink">Public profile</h2>
          <Badge tone={pet.qrStatus === "active" ? "mint" : "warm"}>
            {getQrStatusLabel(pet.qrStatus)}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-6 text-pet-muted">
          Share this link with family and friends. Finders who scan the tag see
          the same safe profile.
        </p>
        <div className="mt-4">
          <ShareProfileLink path={pet.publicProfilePath} petName={pet.name} />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <CTAButton href={pet.publicProfilePath} variant="secondary" fullWidth>
            Preview Public Profile
          </CTAButton>
          <CTAButton href={ownerRoutes.petQr(pet.id)} variant="outline" fullWidth>
            QR Safety Page
          </CTAButton>
        </div>
      </section>

      <section className="brand-card rounded-[1.75rem] p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-pet-ink">Smart tag</h2>
          <Badge tone={activeTag?.status === "Active" ? "mint" : "warm"}>
            {activeTag ? activeTag.status : "None yet"}
          </Badge>
        </div>
        {activeTag ? (
          <div className="mt-3 rounded-[1.25rem] bg-pet-cream p-4">
            <p className="text-xs font-bold uppercase text-pet-muted">
              Tag code
            </p>
            <p className="mt-1 text-lg font-black tracking-wide text-pet-ink">
              {activeTag.tagCode}
            </p>
            {activeTag.lastScannedAt ? (
              <p className="mt-2 text-sm text-pet-muted">
                Last scanned {activeTag.lastScannedAt}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-pet-muted">
            No smart tag linked yet. Order a QR or QR + NFC tag for {pet.name}.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <CTAButton
            href={ownerRoutes.petTags(pet.id)}
            variant="secondary"
            fullWidth
          >
            Manage Tags
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petTagOrder(pet.id)}
            variant="outline"
            fullWidth
          >
            Order Tag
          </CTAButton>
        </div>
      </section>

      <section className="brand-card rounded-[1.75rem] p-6">
        <h2 className="flex items-center gap-2 text-lg font-black text-pet-ink">
          <Icon name="shield" className="h-4 w-4 text-pet-coral" />
          Emergency note
        </h2>
        <p className="mt-2 text-sm leading-6 text-pet-muted">
          {pet.emergencyNote}
        </p>
        <h3 className="mt-5 text-sm font-black text-pet-ink">
          Contact privacy
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {contactItems.map((item) => (
            <div
              className="flex items-center justify-between rounded-[1rem] bg-pet-cream px-3 py-2 text-sm font-bold text-pet-ink"
              key={item.label}
            >
              {item.label}
              <span
                className={
                  item.enabled ? "text-pet-sage" : "text-pet-muted"
                }
              >
                {item.enabled ? "Shown" : "Hidden"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="brand-card rounded-[1.75rem] p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-pet-ink">Recent records</h2>
          <CTAButton href={ownerRoutes.petRecords(pet.id)} variant="outline">
            View all
          </CTAButton>
        </div>
        {recentRecords.length ? (
          <div className="mt-3 grid gap-2">
            {recentRecords.map((record) => (
              <div
                className="rounded-[1rem] bg-pet-cream px-4 py-3"
                key={record.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-pet-ink">{record.title}</p>
                  <Badge tone="soft">{record.type}</Badge>
                </div>
                <p className="mt-1 text-xs font-bold text-pet-muted">
                  {record.date}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-pet-muted">No records yet.</p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-pet-ink">Recent moments</h2>
          <CTAButton href={ownerRoutes.petMoments(pet.id)} variant="outline">
            View all
          </CTAButton>
        </div>
        {recentMoments.length ? (
          <div className="mt-3 grid gap-2">
            {recentMoments.map((moment) => (
              <div
                className="rounded-[1rem] bg-pet-cream px-4 py-3"
                key={moment.id}
              >
                <p className="font-bold text-pet-ink">{moment.title}</p>
                <p className="mt-1 text-xs font-bold text-pet-muted">
                  {moment.date}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-pet-muted">No public moments yet.</p>
        )}
      </section>
    </div>
  );
}

function SettingsTab({ pet }: { pet: Pet }) {
  const items = [
    {
      title: "Edit pet profile",
      description: "Name, species, breed, photo, and description.",
      icon: "settings" as const,
    },
    {
      title: "Privacy settings",
      description: "Choose what finders can see on the public profile.",
      icon: "shield" as const,
    },
    {
      title: "Public profile theme",
      description: "Pick the colour theme for the shareable profile.",
      icon: "heart" as const,
    },
    {
      title: "Contact preferences",
      description: "Owner phone, WhatsApp, and emergency contact.",
      icon: "phone" as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <article className="brand-card rounded-[1.5rem] p-5" key={item.title}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
            <Icon name={item.icon} className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-lg font-black text-pet-ink">{item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            {item.description}
          </p>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="secondary"
            className="mt-4"
          >
            Open
          </CTAButton>
        </article>
      ))}
    </div>
  );
}
