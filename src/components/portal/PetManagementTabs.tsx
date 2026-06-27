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
import { SegmentedTabs, type SegmentedTab } from "@/components/ui/SegmentedTabs";
import { getPetProfileTheme } from "@/lib/petProfileThemes";
import { ownerRoutes } from "@/lib/routes";
import type { CareRecord, Pet, PetMoment, PetTag } from "@/types";

type TabId = "overview" | "records" | "moments" | "tag" | "privacy";

type PetManagementTabsProps = {
  pet: Pet;
  records: CareRecord[];
  moments: PetMoment[];
  tags: PetTag[];
};

const tabs: (SegmentedTab & { id: TabId })[] = [
  { id: "overview", label: "Overview" },
  { id: "records", label: "Care Records", mobileLabel: "Records" },
  { id: "moments", label: "Moments" },
  { id: "tag", label: "Smart Tag", mobileLabel: "Tag" },
  { id: "privacy", label: "Privacy" },
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
      <SegmentedTabs
        ariaLabel="Manage pet sections"
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        tabs={tabs}
      />

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

      {activeTab === "privacy" ? <PrivacyTab pet={pet} /> : null}
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
  const recentMoments = moments.slice(0, 3);
  const activeTag = tags.find((tag) => tag.status === "Active") ?? tags[0];
  const theme = getPetProfileTheme(pet.profileTheme);

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      {/* Public Share Profile */}
      <SectionCard
        icon="heart"
        title="Public Share Profile"
        badge={<Badge tone="mint">{theme.name} theme</Badge>}
        description="The friendly page you share with family, friends, and pet communities."
      >
        <ShareProfileLink
          label="Public Profile URL"
          path={pet.publicProfilePath}
          petName={pet.name}
        />
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={pet.publicProfilePath}
            variant="secondary"
            icon="heart"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            View Public Profile
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit Public Profile Settings
          </CTAButton>
        </div>
      </SectionCard>

      {/* QR Safety Page */}
      <SectionCard
        icon="qr"
        title="QR Safety Page"
        badge={
          <Badge tone={pet.qrStatus === "active" ? "mint" : "warm"}>
            {getQrStatusLabel(pet.qrStatus)}
          </Badge>
        }
        description="The finder-first page a stranger sees after scanning the physical tag."
      >
        <ShareProfileLink
          label="QR Safety Page URL"
          path={pet.finderProfileUrl}
          petName={pet.name}
        />
        <div className="rounded-[1.25rem] bg-pet-cream p-4">
          <p className="text-xs font-bold uppercase text-pet-muted">
            General area
          </p>
          <p className="mt-1 font-black text-pet-ink">{pet.generalArea}</p>
        </div>
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={pet.finderProfileUrl}
            variant="secondary"
            icon="qr"
            target="_blank"
            rel="noopener noreferrer"
            fullWidth
          >
            View QR Safety Page
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit QR Safety Settings
          </CTAButton>
        </div>
      </SectionCard>

      {/* Care Records */}
      <SectionCard
        icon="record"
        title="Care Records"
        description="Vaccines, deworming, grooming, and vet visit history."
      >
        {recentRecords.length ? (
          <div className="grid gap-2">
            {recentRecords.map((record) => (
              <div
                className="flex items-center justify-between gap-2 rounded-[1rem] bg-pet-cream px-4 py-3"
                key={record.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-pet-ink">
                    {record.title}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-pet-muted">
                    {record.date}
                  </p>
                </div>
                <Badge tone="soft">{record.type}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-pet-muted">No care records yet.</p>
        )}
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={ownerRoutes.petRecords(pet.id)}
            variant="secondary"
            icon="record"
            fullWidth
          >
            Manage Care Records
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petRecords(pet.id)}
            variant="outline"
            icon="plus"
            fullWidth
          >
            Add Care Record
          </CTAButton>
        </div>
      </SectionCard>

      {/* Moments / Memories */}
      <SectionCard
        icon="heart"
        title="Pet Memories"
        description="Photo and video moments, with public, private, and family-only control."
      >
        {recentMoments.length ? (
          <div className="grid gap-2">
            {recentMoments.map((moment) => (
              <div
                className="flex items-center justify-between gap-2 rounded-[1rem] bg-pet-cream px-4 py-3"
                key={moment.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-pet-ink">
                    {moment.title}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-pet-muted">
                    {moment.date}
                  </p>
                </div>
                <Badge tone={moment.visibility === "Public" ? "mint" : "soft"}>
                  {moment.visibility}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-pet-muted">No pet memories yet.</p>
        )}
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={ownerRoutes.petMoments(pet.id)}
            variant="secondary"
            icon="heart"
            fullWidth
          >
            Manage Pet Memories
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petMomentNew(pet.id)}
            variant="outline"
            icon="plus"
            fullWidth
          >
            Add Pet Moment
          </CTAButton>
        </div>
      </SectionCard>

      {/* Smart Tags */}
      <SectionCard
        icon="tag"
        title="Smart Tags"
        badge={
          <Badge tone={activeTag?.status === "Active" ? "mint" : "warm"}>
            {activeTag ? activeTag.status : "None yet"}
          </Badge>
        }
        description="Physical QR or QR + NFC tags that open this pet's QR safety page."
      >
        {activeTag ? (
          <div className="rounded-[1.25rem] bg-pet-cream p-4">
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
          <p className="text-sm leading-6 text-pet-muted">
            No smart tag linked yet. Order a QR or QR + NFC tag for {pet.name}.
          </p>
        )}
        <div className="mt-auto flex flex-col gap-3 sm:flex-row pt-1">
          <CTAButton
            href={ownerRoutes.petTags(pet.id)}
            variant="secondary"
            icon="tag"
            fullWidth
          >
            Manage Smart Tags
          </CTAButton>
          <CTAButton
            href={ownerRoutes.petTagOrder(pet.id)}
            variant="outline"
            icon="plus"
            fullWidth
          >
            Order Physical Tag
          </CTAButton>
        </div>
      </SectionCard>
    </div>
  );
}

function PrivacyTab({ pet }: { pet: Pet }) {
  const publicStatuses = [
    { label: "Owner name", enabled: pet.visibility.showOwnerName },
    { label: "Care badges", enabled: pet.visibility.showCareBadges },
    { label: "Public memories", enabled: pet.visibility.showMoments },
    { label: "Life Timeline", enabled: pet.visibility.showTimeline },
  ];
  const safetyStatuses = [
    { label: "WhatsApp owner", enabled: pet.visibility.showWhatsapp },
    { label: "Call owner", enabled: pet.visibility.showPhone },
    { label: "Emergency note", enabled: pet.visibility.showEmergencyNote },
    { label: "General area", enabled: pet.visibility.showGeneralArea },
  ];

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <SectionCard
        icon="heart"
        title="Public profile visibility"
        description="What friends and family see on the shareable public profile."
      >
        <StatusGrid items={publicStatuses} />
        <div className="mt-auto pt-1">
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit public profile settings
          </CTAButton>
        </div>
      </SectionCard>

      <SectionCard
        icon="qr"
        title="QR safety page visibility"
        description="What a finder sees after scanning the physical tag."
      >
        <StatusGrid items={safetyStatuses} />
        <div className="mt-auto pt-1">
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            variant="outline"
            icon="settings"
            fullWidth
          >
            Edit QR safety settings
          </CTAButton>
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  badge,
  description,
  children,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  badge?: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="brand-card flex min-w-0 flex-col gap-4 rounded-[1.75rem] p-6">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
            <Icon name={icon} className="h-5 w-5" />
          </span>
          <h2 className="min-w-0 text-lg font-black text-pet-ink">{title}</h2>
        </div>
        {badge}
      </div>
      <p className="-mt-1 text-sm leading-6 text-pet-muted">{description}</p>
      {children}
    </section>
  );
}

function StatusGrid({
  items,
}: {
  items: { label: string; enabled: boolean }[];
}) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          className="flex min-w-0 items-center justify-between gap-3 rounded-[1rem] bg-pet-cream px-3 py-2 text-sm font-bold text-pet-ink"
          key={item.label}
        >
          <span className="min-w-0">{item.label}</span>
          <span
            className={`shrink-0 ${item.enabled ? "text-pet-sage" : "text-pet-muted"}`}
          >
            {item.enabled ? "Shown" : "Hidden"}
          </span>
        </div>
      ))}
    </div>
  );
}
