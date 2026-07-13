"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlanSummaryCard } from "@/components/portal/PlanSummaryCard";
import { getQrStatusBadge } from "@/components/portal/ProfileAccessStatus";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
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

      let petsData: Pet[];

      // Pets are the critical request: if it fails the dashboard can't render,
      // so it surfaces a retryable error.
      try {
        const petsResponse = await getPets();
        petsData = petsResponse.data;
      } catch (caught) {
        if (active) {
          setError(getFriendlyApiErrorMessage(caught));
          setLoading(false);
        }
        return;
      }

      if (!active) {
        return;
      }

      setAllPets(petsData);

      // Secondary requests are resilient: a single failure leaves that section
      // empty instead of blocking the whole dashboard.
      const activePets = getActivePets(petsData);
      const [recordResults, momentResults, tagsResult, ordersResult] =
        await Promise.all([
          Promise.allSettled(activePets.map((pet) => getPetRecords(pet.id))),
          Promise.allSettled(activePets.map((pet) => getPetMoments(pet.id))),
          getAllTags().catch(() => ({ data: [] as PetTag[] })),
          getOrders().catch(() => ({ data: [] as TagOrder[] })),
        ]);

      if (!active) {
        return;
      }

      setAllRecords(collectFulfilled(recordResults));
      setAllMoments(collectFulfilled(momentResults));
      setTags(tagsResult.data);
      setOrders(ordersResult.data);
      setLoading(false);
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [apiMode]);

  const pets = getActivePets(allPets);
  const memorialPets = getMemorialPets(allPets);
  const firstPet = pets[0];
  const petById = useMemo(
    () => new Map(allPets.map((pet) => [pet.id, pet])),
    [allPets]
  );
  const pendingOrders = orders.filter((order) => isActiveOrder(order.status));
  const activeQrProfiles = pets.filter((pet) => pet.qrStatus === "active").length;
  const activeSmartTags = tags.filter((tag) =>
    Boolean(tag.petId && isActivePhysicalTagForPet(tag, petById.get(tag.petId)))
  ).length;
  const lostModePets = pets.filter((pet) => pet.lostModeEnabled).length;
  const upcomingRecords = useMemo(
    () =>
      allRecords
        .filter((record) => record.dueDate)
        .sort((a, b) => dateScore(a.dueDate) - dateScore(b.dueDate)),
    [allRecords]
  );

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

  // Zero-pet owners get a single, focused onboarding call to action instead of
  // an empty dashboard of zero-value statistics.
  if (!pets.length && !memorialPets.length) {
    return <ZeroPetWelcome />;
  }

  const stats: DashboardStatData[] = [
    { label: pluralize(pets.length, "active pet", "active pets"), value: pets.length, href: ownerRoutes.pets },
    {
      label: pluralize(activeQrProfiles, "QR safety page", "QR safety pages"),
      value: activeQrProfiles,
    },
    {
      label: pluralize(pendingOrders.length, "pending order", "pending orders"),
      value: pendingOrders.length,
      href: ownerRoutes.orders,
    },
  ];

  if (memorialPets.length) {
    stats.push({
      label: pluralize(
        memorialPets.length,
        "memorial profile",
        "memorial profiles"
      ),
      value: memorialPets.length,
    });
  }

  return (
    <div className="grid gap-6">
      <section className="brand-soft-card overflow-hidden rounded-[1.75rem] p-5 sm:p-6">
        <p className="text-xs font-extrabold uppercase text-pet-teal">
          Owner portal
        </p>
        <h1 className="mt-1.5 text-2xl font-black leading-tight text-pet-ink sm:text-3xl">
          Welcome back
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-pet-muted">
          Manage your pets, safety pages, care records, and moments.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {stats.map((stat) => (
            <DashboardStat key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-6">
          <PetSummarySection pets={pets} />
          <UpcomingCareSection pets={pets} records={upcomingRecords} />
        </div>

        <div className="grid content-start gap-6">
          <QuickActions firstPet={firstPet} />
          <SafetyOverview
            activeQrProfiles={activeQrProfiles}
            activeSmartTags={activeSmartTags}
            lostModePets={lostModePets}
            pendingOrders={pendingOrders.length}
          />
          <DashboardSection title="Plan usage">
            <PlanSummaryCard
              compact
              initialMoments={allMoments}
              initialPets={allPets}
              refreshOnMount={false}
            />
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}

type DashboardStatData = {
  label: string;
  value: number;
  href?: string;
};

function DashboardStat({ label, value, href }: DashboardStatData) {
  const inner = (
    <>
      <span className="text-2xl font-black text-pet-ink">{value}</span>
      <span className="mt-0.5 block text-xs font-bold leading-4 text-pet-muted">
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        className="rounded-[1.25rem] border border-pet-border bg-white p-3 transition hover:border-pet-teal hover:bg-pet-cream"
        href={href}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-pet-border bg-white p-3">
      {inner}
    </div>
  );
}

function ZeroPetWelcome() {
  return (
    <section className="brand-paw-dots brand-soft-card rounded-[1.75rem] border-dashed p-8 text-center sm:p-10">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-pet-apricot text-pet-coral shadow-sm">
        <Icon name="paw" className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-2xl font-black text-pet-ink sm:text-3xl">
        Welcome to MyPetLink
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-pet-muted sm:text-base">
        Create your first pet profile to start adding safety details, memories,
        care records, and QR information.
      </p>
      <CTAButton
        className="mt-6"
        href={ownerRoutes.petNew}
        icon="plus"
        variant="coral"
      >
        Add your first pet
      </CTAButton>
    </section>
  );
}

function DashboardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-pet-ink sm:text-xl">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function PetSummarySection({ pets }: { pets: Pet[] }) {
  const visiblePets = pets.slice(0, 4);
  const remaining = pets.length - visiblePets.length;

  return (
    <DashboardSection
      title="Your pets"
      action={
        <Link
          className="text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
          href={ownerRoutes.pets}
        >
          Manage pets
        </Link>
      }
    >
      {visiblePets.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {visiblePets.map((pet) => (
            <PetSummaryRow key={pet.id} pet={pet} />
          ))}
        </div>
      ) : (
        <p className="rounded-[1.25rem] border border-pet-border bg-white px-4 py-3.5 text-sm font-semibold text-pet-muted">
          No active pets right now. Restore one from Archived or add a new pet.
        </p>
      )}
      {remaining > 0 ? (
        <Link
          className="mt-3 inline-flex text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
          href={ownerRoutes.pets}
        >
          View all {pets.length} pets
        </Link>
      ) : null}
    </DashboardSection>
  );
}

function PetSummaryRow({ pet }: { pet: Pet }) {
  const qrBadge = getQrStatusBadge(pet.qrStatus, pet.qrSafetyPath, pet);

  return (
    <Link
      className="brand-card flex min-w-0 items-center gap-3 rounded-[1.25rem] p-3 transition hover:border-pet-teal"
      href={ownerRoutes.petProfile(pet.id)}
    >
      <PetAvatar pet={pet} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate text-base font-black text-pet-ink">
            {pet.name}
          </h3>
          <Badge className="shrink-0" tone={qrBadge.tone}>
            {qrBadge.label}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-pet-muted">
          {getPetSummaryLabel(pet)}
        </p>
      </div>
      <Icon name="record" className="h-4 w-4 shrink-0 text-pet-muted" />
    </Link>
  );
}

function UpcomingCareSection({
  pets,
  records,
}: {
  pets: Pet[];
  records: CareRecord[];
}) {
  const nearest = records.slice(0, 3);

  return (
    <DashboardSection
      title="Upcoming care"
      action={
        records.length ? (
          <Link
            className="text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
            href={ownerRoutes.records}
          >
            View all
          </Link>
        ) : null
      }
    >
      {nearest.length ? (
        <div className="grid gap-2.5">
          {nearest.map((record) => (
            <ReminderItem
              key={record.id}
              pet={pets.find((pet) => pet.id === record.petId)}
              record={record}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-[1.25rem] border border-pet-border bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-pet-muted">
            No upcoming care reminders.
          </p>
          <Link
            className="text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
            href={ownerRoutes.records}
          >
            View care records
          </Link>
        </div>
      )}
    </DashboardSection>
  );
}

function ReminderItem({ record, pet }: { record: CareRecord; pet?: Pet }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[1.25rem] bg-pet-cream px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-pet-teal">
        <Icon name={recordIcon(record.type)} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-pet-ink">
          {record.type}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-pet-muted">
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

function QuickActions({ firstPet }: { firstPet?: Pet }) {
  const qrProfileHref = firstPet ? firstPet.qrSafetyPath : ownerRoutes.pets;

  return (
    <DashboardSection title="Quick actions">
      <div className="grid grid-cols-2 gap-3">
        <ActionTile href={ownerRoutes.records} icon="record" label="Care Records" />
        <ActionTile href={ownerRoutes.moments} icon="heart" label="Moments" />
        <ActionTile
          href={qrProfileHref}
          icon="qr"
          label="QR Safety Page"
          rel={firstPet ? "noopener noreferrer" : undefined}
          target={firstPet ? "_blank" : undefined}
        />
        <ActionTile href={ownerRoutes.orders} icon="record" label="Orders" />
      </div>
    </DashboardSection>
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
    <Link
      className="brand-card flex min-h-[3.75rem] items-center gap-2.5 rounded-[1.25rem] px-3.5 py-3 text-sm font-extrabold text-pet-ink transition hover:border-pet-teal hover:bg-pet-cream"
      href={href}
      rel={rel}
      target={target}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f3ff] text-pet-teal">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function SafetyOverview({
  activeQrProfiles,
  activeSmartTags,
  pendingOrders,
  lostModePets,
}: {
  activeQrProfiles: number;
  activeSmartTags: number;
  pendingOrders: number;
  lostModePets: number;
}) {
  return (
    <DashboardSection title="Safety overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {lostModePets > 0 ? (
          <SafetyStat
            icon="pin"
            label={pluralize(lostModePets, "pet in Lost Mode", "pets in Lost Mode")}
            urgent
            value={lostModePets}
          />
        ) : null}
        <SafetyStat
          icon="qr"
          label="Active QR safety pages"
          value={activeQrProfiles}
        />
        <SafetyStat icon="tag" label="Active smart tags" value={activeSmartTags} />
        <SafetyStat
          icon="record"
          label="Pending orders"
          value={pendingOrders}
        />
      </div>
    </DashboardSection>
  );
}

function SafetyStat({
  icon,
  label,
  value,
  urgent = false,
}: {
  icon: IconName;
  label: string;
  value: number;
  urgent?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[1.25rem] border p-3.5 ${
        urgent
          ? "border-[#ffd2c9] bg-[#ffe8e3]"
          : "border-pet-border bg-white"
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
          urgent ? "bg-white text-[#a63c2e]" : "bg-[#e8f3ff] text-pet-teal"
        }`}
      >
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-black leading-none text-pet-ink">{value}</p>
        <p
          className={`mt-1 text-xs font-bold leading-4 ${
            urgent ? "text-[#a63c2e]" : "text-pet-muted"
          }`}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function collectFulfilled<T>(
  results: PromiseSettledResult<{ data: T[] }>[]
): T[] {
  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.data : []
  );
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
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
