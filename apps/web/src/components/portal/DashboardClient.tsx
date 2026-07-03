"use client";

import { useEffect, useMemo, useState } from "react";
import { PlanAwareAddPetButton } from "@/components/portal/PlanAwareAddPetButton";
import { PlanSummaryCard } from "@/components/portal/PlanSummaryCard";
import {
  getQrStatusBadge,
  getSmartTagStatusBadge,
} from "@/components/portal/ProfileAccessStatus";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { isActiveOrder } from "@/lib/orders";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getActivePets, getMemorialPets } from "@/lib/petLifecycle";
import { ownerRoutes } from "@/lib/routes";
import { isActivePhysicalTagForPet } from "@/lib/tagStatus";
import { isApiConfigured } from "@/services/apiConfig";
import { getPetMoments } from "@/services/momentService";
import { getFriendlyApiErrorMessage, getPets } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getAllTags, getOrders } from "@/services/tagService";
import type { CareRecord, Pet, PetMoment, PetTag, TagOrder } from "@/types";

type DashboardClientProps = {
  initialPets: Pet[];
  initialRecords: CareRecord[];
  initialMoments: PetMoment[];
  initialTags: PetTag[];
  initialOrders: TagOrder[];
};

export function DashboardClient({
  initialPets,
  initialRecords,
  initialMoments,
  initialTags,
  initialOrders,
}: DashboardClientProps) {
  const apiMode = isApiConfigured();
  const [allPets, setAllPets] = useState<Pet[]>(apiMode ? [] : initialPets);
  const [allRecords, setAllRecords] = useState<CareRecord[]>(
    apiMode ? [] : initialRecords
  );
  const [allMoments, setAllMoments] = useState<PetMoment[]>(
    apiMode ? [] : initialMoments
  );
  const [tags, setTags] = useState<PetTag[]>(apiMode ? [] : initialTags);
  const [orders, setOrders] = useState<TagOrder[]>(apiMode ? [] : initialOrders);
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const petsResponse = await getPets();

        if (!active) {
          return;
        }

        setAllPets(petsResponse.data);

        if (apiMode) {
          setAllRecords([]);
          setAllMoments([]);
          setTags([]);
          setOrders([]);
          return;
        }

        const activePets = getActivePets(petsResponse.data);
        const [recordResponses, momentResponses, tagsResponse, ordersResponse] =
          await Promise.all([
            Promise.all(activePets.map((pet) => getPetRecords(pet.id))),
            Promise.all(activePets.map((pet) => getPetMoments(pet.id))),
            getAllTags(),
            getOrders(),
          ]);

        if (!active) {
          return;
        }

        setAllRecords(recordResponses.flatMap((response) => response.data));
        setAllMoments(momentResponses.flatMap((response) => response.data));
        setTags(tagsResponse.data);
        setOrders(ordersResponse.data);
      } catch (caught) {
        if (active) {
          setError(getFriendlyApiErrorMessage(caught));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [apiMode]);

  const pets = getActivePets(allPets);
  const memorialPets = getMemorialPets(allPets);
  const firstPet = pets[0];
  const recordsByPet = useMemo(() => {
    const map = new Map<string, CareRecord[]>();

    for (const record of allRecords) {
      map.set(record.petId, [...(map.get(record.petId) ?? []), record]);
    }

    return map;
  }, [allRecords]);
  const petById = new Map(allPets.map((pet) => [pet.id, pet]));
  const pendingOrders = orders.filter((order) => isActiveOrder(order.status));
  const activeQrProfiles = pets.filter((pet) => pet.qrStatus === "active").length;
  const activeSmartTags = tags.filter((tag) =>
    Boolean(tag.petId && isActivePhysicalTagForPet(tag, petById.get(tag.petId)))
  ).length;
  const upcomingRecords = allRecords
    .filter((record) => record.dueDate)
    .sort((a, b) => dateScore(a.dueDate) - dateScore(b.dueDate));
  const recentRecords = [...allRecords]
    .sort((a, b) => dateScore(b.date) - dateScore(a.date))
    .slice(0, 3);
  const recentMoments = [...allMoments]
    .sort((a, b) => dateScore(b.date) - dateScore(a.date))
    .slice(0, 3);

  const addRecordHref = firstPet
    ? ownerRoutes.petRecords(firstPet.id)
    : ownerRoutes.petNew;
  const addMomentHref = firstPet
    ? ownerRoutes.petMomentNew(firstPet.id)
    : ownerRoutes.petNew;
  const orderTagHref = firstPet
    ? ownerRoutes.petTagOrder(firstPet.id)
    : ownerRoutes.petNew;
  const qrProfileHref = firstPet ? firstPet.qrSafetyPath : ownerRoutes.pets;

  if (loading) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6 text-center">
        <p className="text-sm font-extrabold uppercase text-pet-teal">
          Loading owner portal
        </p>
        <h1 className="mt-2 text-2xl font-black text-pet-ink">
          Fetching your latest pet profiles
        </h1>
      </section>
    );
  }

  if (error) {
    return (
      <section className="brand-card rounded-[1.75rem] p-6 text-center">
        <p className="text-sm font-extrabold uppercase text-[#a63c2e]">
          Connection needed
        </p>
        <h1 className="mt-2 text-2xl font-black text-pet-ink">
          Could not load your dashboard
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-pet-muted">
          {error}
        </p>
        <CTAButton
          className="mt-5"
          onClick={() => window.location.reload()}
          variant="secondary"
        >
          Try Again
        </CTAButton>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="brand-soft-card overflow-hidden rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase text-pet-teal">
              Owner portal
            </p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-pet-ink sm:text-4xl">
              Welcome back
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-pet-muted sm:text-base sm:leading-7">
              Manage your pets, safety pages, care records, and memories in one
              place.
            </p>
          </div>
          <PlanAwareAddPetButton className="lg:w-auto" fullWidth />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryPill label="Active pets" value={pets.length} />
          <SummaryPill label="Memorial profiles" value={memorialPets.length} />
          <SummaryPill label="QR active" value={activeQrProfiles} />
          <SummaryPill label="Orders pending" value={pendingOrders.length} />
        </div>
      </section>

      <PlanSummaryCard compact initialPets={allPets} />

      <DashboardSection
        title="Your pets"
        description="Open a pet profile, check safety status, or share a public page."
        action={
          <CTAButton href={ownerRoutes.pets} variant="secondary">
            View All
          </CTAButton>
        }
      >
        {pets.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {pets.map((pet) => (
              <DashboardPetCard
                key={pet.id}
                nextDue={getNextDue(recordsByPet.get(pet.id) ?? [])}
                orders={orders.filter((order) => order.petId === pet.id)}
                pet={pet}
                tags={tags.filter((tag) => tag.petId === pet.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No active pets yet"
            description="Add a pet profile or restore one from Archived when you want it back in your active list."
            actionHref={ownerRoutes.petNew}
            actionLabel="Add Pet"
          />
        )}
      </DashboardSection>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardSection
          title="Coming up"
          description="Care items that need attention soon."
          action={
            <CTAButton href={addRecordHref} variant="secondary">
              Manage Records
            </CTAButton>
          }
        >
          <div className="brand-card rounded-[1.5rem] p-4 sm:p-5">
            {upcomingRecords.length ? (
              <div className="grid gap-3">
                {upcomingRecords.slice(0, 4).map((record) => (
                  <ReminderItem
                    key={record.id}
                    pet={pets.find((pet) => pet.id === record.petId)}
                    record={record}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-[1.25rem] bg-pet-cream px-4 py-4 text-sm font-semibold text-pet-muted">
                No upcoming care reminders yet.
              </p>
            )}
          </div>
        </DashboardSection>

        <DashboardSection
          title="Quick actions"
          description="Common owner tasks, kept close at hand."
        >
          <div className="grid grid-cols-2 gap-3">
            <PlanAwareAddPetButton
              className="min-h-14 px-3 text-center"
              fullWidth
            />
            <ActionTile
              href={addRecordHref}
              icon="record"
              label="Add Care Record"
            />
            <ActionTile
              href={addMomentHref}
              icon="heart"
              label="Add Pet Moment"
            />
            <ActionTile
              href={orderTagHref}
              icon="tag"
              label="Order Physical Tag"
            />
            <ActionTile
              href={ownerRoutes.orders}
              icon="record"
              label="View Orders"
            />
            <ActionTile
              href={qrProfileHref}
              icon="qr"
              label="Open QR Safety Page"
              rel={firstPet ? "noopener noreferrer" : undefined}
              target={firstPet ? "_blank" : undefined}
            />
          </div>
        </DashboardSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <DashboardSection
          title="Safety overview"
          description="A quick check of QR safety pages, tags, and orders."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SafetyStatusCard
              icon="qr"
              label="Active QR safety pages"
              note="Ready for public sharing and finder scans."
              value={activeQrProfiles}
            />
            <SafetyStatusCard
              icon="tag"
              label="Active smart tags"
              note="Linked physical tags currently active."
              value={activeSmartTags}
            />
            <SafetyStatusCard
              icon="record"
              label="Pending orders"
              note="Awaiting payment, verification, or delivery."
              value={pendingOrders.length}
            />
            <SafetyStatusCard
              icon="shield"
              label="GPS Safety"
              note="Coming later"
              value="Soon"
            />
          </div>
        </DashboardSection>

        <DashboardSection
          title="Recent activity"
          description="Latest care records and pet memories."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <ActivityPanel
              emptyText="Care records will appear here once added."
              items={recentRecords.map((record) => ({
                id: record.id,
                title: record.title,
                meta: `${record.type} - ${petName(pets, record.petId)}`,
                date: record.date,
              }))}
              title="Recent Records"
            />
            <ActivityPanel
              emptyText="Pet memories will appear here once added."
              items={recentMoments.map((moment) => ({
                id: moment.id,
                title: moment.title,
                meta: `${moment.type} - ${petName(pets, moment.petId)}`,
                date: moment.date,
              }))}
              title="Recent Moments"
            />
          </div>
        </DashboardSection>
      </div>
    </div>
  );
}

function DashboardSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-pet-ink sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-pet-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function DashboardPetCard({
  pet,
  tags,
  nextDue,
  orders,
}: {
  pet: Pet;
  tags: PetTag[];
  orders: TagOrder[];
  nextDue?: CareRecord;
}) {
  const qrBadge = getQrStatusBadge(pet.qrStatus, pet.qrSafetyPath, pet);
  const tagBadge = getSmartTagStatusBadge(tags, orders, pet);

  return (
    <article className="brand-card flex min-w-0 flex-col gap-4 rounded-[1.75rem] p-5">
      <div className="flex min-w-0 gap-4">
        <PetAvatar pet={pet} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-xl font-black text-pet-ink">
              {pet.name}
            </h3>
            <Badge tone={qrBadge.tone}>{qrBadge.label}</Badge>
          </div>
          <p className="mt-1 text-sm leading-5 text-pet-muted">
            {getPetSummaryLabel(pet)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={tagBadge.tone}>{tagBadge.label}</Badge>
            {nextDue ? <Badge tone="warm">Due soon</Badge> : null}
          </div>
        </div>
      </div>

      <div className="rounded-[1.25rem] bg-pet-cream px-4 py-3">
        <p className="text-xs font-extrabold uppercase text-pet-muted">
          Next care item
        </p>
        {nextDue ? (
          <p className="mt-1 text-sm font-bold text-pet-ink">
            {nextDue.type}: {nextDue.dueDate}
          </p>
        ) : (
          <p className="mt-1 text-sm font-semibold text-pet-muted">
            No due item recorded.
          </p>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3">
        <CTAButton href={ownerRoutes.petProfile(pet.id)} fullWidth>
          Manage
        </CTAButton>
        <CTAButton
          href={pet.publicProfilePath}
          rel="noopener noreferrer"
          target="_blank"
          variant="secondary"
          fullWidth
        >
          View Public Profile
        </CTAButton>
      </div>
    </article>
  );
}

function ReminderItem({
  record,
  pet,
}: {
  record: CareRecord;
  pet?: Pet;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[1.25rem] bg-pet-cream px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-pet-teal">
        <Icon name={recordIcon(record.type)} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-pet-ink">
          {record.type}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-pet-muted">
          {pet?.name ?? "Pet"} - due {record.dueDate}
        </p>
      </div>
      <Badge
        tone={record.status === "due-soon" ? "warm" : "soft"}
        className="shrink-0"
      >
        {getRecordStatusLabel(record)}
      </Badge>
    </div>
  );
}

function ActionTile({
  href,
  icon,
  label,
  target,
  rel,
}: {
  href: string;
  icon: IconName;
  label: string;
  target?: string;
  rel?: string;
}) {
  return (
    <CTAButton
      href={href}
      icon={icon}
      rel={rel}
      target={target}
      variant="secondary"
      className="min-h-14 px-3 text-center"
      fullWidth
    >
      {label}
    </CTAButton>
  );
}

function SafetyStatusCard({
  icon,
  label,
  value,
  note,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="brand-card min-w-0 rounded-[1.5rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-pet-teal">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className="text-xl font-black text-pet-ink">{value}</span>
      </div>
      <p className="mt-3 text-sm font-black text-pet-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-pet-muted">{note}</p>
    </div>
  );
}

function ActivityPanel({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: { id: string; title: string; meta: string; date: string }[];
  emptyText: string;
}) {
  return (
    <div className="brand-card rounded-[1.5rem] p-4 sm:p-5">
      <h3 className="text-base font-black text-pet-ink">{title}</h3>
      <div className="mt-4 grid gap-3">
        {items.length ? (
          items.map((item) => (
            <div
              className="rounded-[1.1rem] bg-pet-cream px-4 py-3"
              key={item.id}
            >
              <p className="truncate text-sm font-bold text-pet-ink">
                {item.title}
              </p>
              <p className="mt-1 text-xs font-semibold text-pet-muted">
                {item.meta}
              </p>
              <p className="mt-1 text-xs text-pet-muted">{item.date}</p>
            </div>
          ))
        ) : (
          <p className="rounded-[1.1rem] bg-pet-cream px-4 py-3 text-sm font-semibold text-pet-muted">
            {emptyText}
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-pet-muted shadow-sm">
      <span className="text-pet-ink">{value}</span> {label}
    </div>
  );
}

function getNextDue(records: CareRecord[]) {
  return records
    .filter((record) => record.dueDate)
    .sort((a, b) => dateScore(a.dueDate) - dateScore(b.dueDate))[0];
}

function getRecordStatusLabel(record: CareRecord) {
  if (record.status === "due-soon") {
    return "Due soon";
  }

  if (record.status === "upcoming") {
    return "Upcoming";
  }

  return "Next due";
}

function recordIcon(type: CareRecord["type"]): IconName {
  if (type === "Grooming") {
    return "heart";
  }

  if (type === "Vet Visit" || type === "Vaccine") {
    return "shield";
  }

  return "record";
}

function petName(pets: Pet[], petId: string) {
  return pets.find((pet) => pet.id === petId)?.name ?? "Pet";
}

function dateScore(value?: string) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [, day, month, year] = match;
  const monthIndex = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(month);

  if (monthIndex < 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return new Date(Number(year), monthIndex, Number(day)).getTime();
}
