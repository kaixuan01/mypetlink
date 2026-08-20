"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { OwnerContactSetupCard } from "@/components/portal/OwnerContactSetupCard";
import { ProfileCompletionCard } from "@/components/portal/ProfileCompletionCard";
import { PlanSummaryCard } from "@/components/portal/PlanSummaryCard";
import { ShareCenter } from "@/components/share/ShareCenter";
import {
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
} from "@/lib/features";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { PetShareCard } from "@/components/share/PetShareCard";
import { getCareRecordDateTerminology } from "@/lib/careRecordTerminology";
import {
  getCareRecordStatusLabel,
  selectDashboardCareRecords,
} from "@/lib/careRecordStatus";
import {
  hasUsableOwnerContact,
  readOwnerSettings,
  subscribeOwnerSettings,
} from "@/lib/ownerSettings";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getEffectivePlanLimits } from "@/lib/planLimits";
import { deriveProfileCompletion } from "@/lib/profileCompletion";
import { getActivePets, getMemorialPets } from "@/lib/petLifecycle";
import {
  getAvailablePetShareCardOptions,
  getPublicProfileShareCardImagePath,
  getPublicProfileShareVersion,
} from "@/lib/publicProfileSocial";
import { derivePetOccasions, type PetOccasion } from "@/lib/petOccasions";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import { getPetMoments } from "@/services/momentService";
import { getFriendlyApiErrorMessage, getPets } from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import type { CareRecord, Pet, PetMoment } from "@/types";

type DashboardClientProps = {
  initialPets: Pet[];
  initialRecords: CareRecord[];
  initialMoments: PetMoment[];
};

// Stable boolean snapshots for useSyncExternalStore (owner settings live in
// localStorage and are refreshed by the session check / settings saves).
function getHasOwnerContactSnapshot() {
  return hasUsableOwnerContact(readOwnerSettings());
}

function getServerHasOwnerContactSnapshot() {
  // Never flash the reminder during SSR/hydration; the client snapshot takes
  // over immediately after mount.
  return true;
}

export function DashboardClient({
  initialPets,
  initialRecords,
  initialMoments,
}: DashboardClientProps) {
  const apiMode = isApiConfigured();
  const [allPets, setAllPets] = useState<Pet[]>(apiMode ? [] : initialPets);
  const [allRecords, setAllRecords] = useState<CareRecord[]>(
    apiMode ? [] : initialRecords
  );
  const [allMoments, setAllMoments] = useState<PetMoment[]>(
    apiMode ? [] : initialMoments
  );
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [recordAvailability, setRecordAvailability] = useState<Set<string>>(
    () => new Set(apiMode ? [] : getActivePets(initialPets).map((pet) => pet.id))
  );
  const [momentAvailability, setMomentAvailability] = useState<Set<string>>(
    () => new Set(apiMode ? [] : getActivePets(initialPets).map((pet) => pet.id))
  );
  const hasOwnerContact = useSyncExternalStore(
    subscribeOwnerSettings,
    getHasOwnerContactSnapshot,
    getServerHasOwnerContactSnapshot
  );

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
      const [recordResults, momentResults] = await Promise.all([
        Promise.allSettled(activePets.map((pet) => getPetRecords(pet.id))),
        Promise.allSettled(activePets.map((pet) => getPetMoments(pet.id))),
      ]);

      if (!active) {
        return;
      }

      setAllRecords(collectFulfilled(recordResults));
      setAllMoments(collectFulfilled(momentResults));
      setRecordAvailability(fulfilledPetIds(activePets, recordResults));
      setMomentAvailability(fulfilledPetIds(activePets, momentResults));
      setLoading(false);
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [apiMode]);

  const pets = getActivePets(allPets);
  const memorialPets = getMemorialPets(allPets);
  const publicProfileCount = pets.filter(
    (pet) => pet.publicProfileEnabled
  ).length;
  const lostModePets = pets.filter((pet) => pet.lostModeEnabled);
  const upcomingRecords = useMemo(
    () => selectDashboardCareRecords(allRecords),
    [allRecords]
  );
  const momentCounts = useMemo(
    () => countByPet(allMoments),
    [allMoments]
  );
  const recordCounts = useMemo(
    () => countByPet(allRecords),
    [allRecords]
  );
  const completionCandidate = useMemo(() => {
    const candidates = pets
      .map((pet) => ({
        pet,
        completion: deriveProfileCompletion({
          pet,
          momentCount: momentAvailability.has(pet.id)
            ? (momentCounts.get(pet.id) ?? 0)
            : undefined,
          careRecordCount: recordAvailability.has(pet.id)
            ? (recordCounts.get(pet.id) ?? 0)
            : undefined,
          safetyProfilesEnabled: safetyProfilesOwnerUiEnabled,
          publicProfilesEnabled,
          memoryLimit: getEffectivePlanLimits().maxMemoriesPerPet,
        }),
      }))
      .filter(({ completion }) => !completion.isComplete);

    return candidates.sort((left, right) => {
      const percentageDifference =
        left.completion.percentage - right.completion.percentage;
      if (percentageDifference) return percentageDifference;
      return Date.parse(right.pet.createdAt) - Date.parse(left.pet.createdAt);
    })[0];
  }, [momentAvailability, momentCounts, pets, recordAvailability, recordCounts]);

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
    return (
      <div className="grid gap-6">
        {!hasOwnerContact ? <OwnerContactSetupCard /> : null}
        <ZeroPetWelcome />
      </div>
    );
  }

  // Launched-product summary only: counts reuse the data this dashboard
  // already loads (no extra per-pet requests). Hidden features contribute no
  // zero-value cards; upcoming care has its own section below.
  const stats: DashboardStatData[] = [
    { label: "Pets", value: pets.length, href: ownerRoutes.pets },
    ...(publicProfilesEnabled
      ? [{ label: "Public profiles", value: publicProfileCount }]
      : []),
    { label: "Memories", value: allMoments.length, href: ownerRoutes.moments },
  ];

  return (
    <div className="grid gap-6">
      {!hasOwnerContact ? <OwnerContactSetupCard /> : null}

      <section className="brand-soft-card overflow-hidden rounded-[1.75rem] p-5 sm:p-6">
        <p className="text-xs font-extrabold uppercase text-pet-teal">
          Owner portal
        </p>
        <h1 className="mt-1.5 text-2xl font-black leading-tight text-pet-ink sm:text-3xl">
          Welcome back
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-pet-muted">
          Manage your pet profiles, care records, and moments in one place.
        </p>
        {lostModePets.length ? <LostModeAlert pets={lostModePets} /> : null}
        <div
          className={`mt-4 grid grid-cols-2 gap-2.5 ${
            stats.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"
          }`}
        >
          {stats.map((stat) => (
            <DashboardStat key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      <DashboardPetsSection pets={pets} />

      <DashboardOccasionSection pets={pets} />

      {completionCandidate ? (
        <ProfileCompletionCard
          compact
          completion={completionCandidate.completion}
          pet={completionCandidate.pet}
          suppressedItems={!hasOwnerContact ? ["contact"] : []}
        />
      ) : null}

      <UpcomingCareSection pets={pets} records={upcomingRecords} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <QuickActions />
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
  );
}

function DashboardOccasionSection({ pets }: { pets: Pet[] }) {
  const now = new Date();
  const celebrations = pets.flatMap((pet) =>
    pet.publicProfileEnabled
      ? derivePetOccasions(pet, now).map((occasion) => ({ pet, occasion }))
      : []
  );
  if (!celebrations.length) return null;

  return (
    <DashboardSection
      title="Celebrate today"
      description="Create a card for today's special moments."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {celebrations.map(({ pet, occasion }) => (
          <article
            className="brand-card flex min-w-0 items-center gap-3 rounded-[1.35rem] p-4"
            key={`${pet.id}-${occasion.variant}`}
          >
            <PetAvatar pet={pet} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase text-pet-coral">
                {occasion.label}
              </p>
              <p className="mt-0.5 text-sm font-black leading-5 text-pet-ink">
                {occasionMessage(pet.name, occasion)}
              </p>
            </div>
            <PetShareCard
              className="shrink-0 px-3 text-xs"
              imagePath={getPublicProfileShareCardImagePath(pet, occasion.variant)}
              initialVariant={occasion.variant}
              petName={pet.name}
              profilePath={pet.publicProfilePath}
              shareVersion={getPublicProfileShareVersion(pet)}
              variants={getAvailablePetShareCardOptions(pet)}
            />
          </article>
        ))}
      </div>
    </DashboardSection>
  );
}

function occasionMessage(name: string, occasion: PetOccasion) {
  if (occasion.variant === "birthday") {
    return occasion.count === 0
      ? `${name} is celebrating today.`
      : `${name} turns ${occasion.count} today.`;
  }
  if (occasion.count === 0) return `${name} joined your family today.`;
  return occasion.count === 1
    ? `One year since ${name} joined your family.`
    : `${occasion.count} years since ${name} joined your family.`;
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

function LostModeAlert({ pets }: { pets: Pet[] }) {
  const onePet = pets.length === 1 ? pets[0] : undefined;
  const href = onePet ? ownerRoutes.petProfile(onePet.id) : ownerRoutes.pets;

  return (
    <Link
      className="mt-4 flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-[#ffc7bc] bg-[#ffe8e3] p-3.5 transition hover:border-pet-coral"
      href={href}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#a63c2e] shadow-sm">
        <Icon name="pin" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-[#8f3025]">
          {pets.length} {pets.length === 1 ? "pet is" : "pets are"} in Lost Mode
        </span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-[#8f3025]">
          {pets.length === 1
            ? "Your missing pet notice is live."
            : "Your missing pet notices are live."}
        </span>
      </span>
      <span className="shrink-0 text-xs font-black text-[#8f3025]">
        {onePet ? "Review pet" : "Review pets"}
      </span>
    </Link>
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
        Create your first pet profile to start adding photos, memories, and
        care records you can share.
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
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-pet-ink sm:text-xl">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-pet-muted">
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

function DashboardPetsSection({ pets }: { pets: Pet[] }) {
  const visiblePets = pets.slice(0, 4);
  const remaining = pets.length - visiblePets.length;

  return (
    <DashboardSection
      title="Your pets"
      description="Manage and share your pet profiles."
      action={
        <Link
          className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
          href={ownerRoutes.pets}
        >
          Manage pets
        </Link>
      }
    >
      {visiblePets.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visiblePets.map((pet) => (
            <DashboardPetCard key={pet.id} pet={pet} />
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

function DashboardPetCard({ pet }: { pet: Pet }) {
  const isPublic = pet.publicProfileEnabled;
  const sharePath = pet.publicProfilePath;

  return (
    <article
      className="brand-card min-w-0 rounded-[1.35rem] p-3.5 sm:p-4"
      data-dashboard-pet-card
    >
      <Link
        aria-label={`Manage ${pet.name}`}
        className="group flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        href={ownerRoutes.petProfile(pet.id)}
      >
        <PetAvatar pet={pet} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-base font-black text-pet-ink">
              {pet.name}
            </span>
            {publicProfilesEnabled ? (
              <Badge className="shrink-0" tone={isPublic ? "mint" : "soft"}>
                {isPublic ? "Public" : "Private"}
              </Badge>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-pet-muted">
            {getPetSummaryLabel(pet)}
          </span>
        </span>
        <Icon
          aria-hidden="true"
          name="record"
          className="h-4 w-4 shrink-0 text-pet-muted transition-transform group-hover:translate-x-0.5"
        />
      </Link>

      {publicProfilesEnabled ? (
        <div className="mt-3 border-t border-pet-border/70 pt-3">
          {isPublic ? (
            <ShareProfileActions pet={pet} sharePath={sharePath} />
          ) : (
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold leading-5 text-pet-muted">
                This profile is private and cannot be shared yet.
              </p>
              <Link
                aria-label={`Enable ${pet.name}'s public profile`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center self-start whitespace-nowrap rounded-full border border-pet-border bg-white px-4 text-xs font-extrabold text-pet-ink transition hover:bg-pet-cream"
                href={ownerRoutes.petEdit(pet.id, { tab: "public" })}
              >
                Enable profile
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Public Profile share actions: one primary Share action (native share sheet
 * on supporting browsers, copy-link fallback elsewhere) plus compact QR and
 * preview actions. At 320px the primary action spans the card width; from
 * 360px all three actions share one row. Visible labels stay short on compact
 * cards while their accessible names remain complete.
 */
function ShareProfileActions({
  pet,
  sharePath,
}: {
  pet: Pet;
  sharePath: string;
}) {
  // One Share entry point; the QR now lives inside the Share Center rather than
  // competing with it as a third equally weighted button.
  return (
    // Full width on a phone for tap comfort; compact from sm upwards so a
    // desktop card does not read as one giant button.
    <div
      className="grid min-w-0 grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap sm:items-center"
      data-dashboard-pet-actions
    >
      <ShareCenter
        pet={pet}
        triggerClassName="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-pet-teal bg-pet-teal px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0f5fd0] sm:px-4"
      />
      <Link
        aria-label={`View ${pet.name}'s public profile`}
        className="inline-flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-pet-border bg-white px-4 text-sm font-extrabold text-pet-ink transition hover:bg-white/70"
        href={sharePath}
        rel="noopener noreferrer"
        target="_blank"
      >
        View
      </Link>
    </div>
  );
}

function UpcomingCareSection({
  pets,
  records,
}: {
  pets: Pet[];
  records: CareRecord[];
}) {
  return (
    <DashboardSection
      title="Care due dates"
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
      {records.length ? (
        <div className="grid gap-2.5">
          {records.map((record) => (
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
            No care due dates added.
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
  const dateTerminology = getCareRecordDateTerminology(record.type);

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
          {pet?.name ?? "Pet"} - {dateTerminology.nextDateLabel}:{" "}
          {record.dueDate}
        </p>
      </div>
      <Badge
        tone={
          record.status === "overdue"
            ? "danger"
            : record.status === "due-soon"
              ? "warm"
              : "soft"
        }
        className="shrink-0"
      >
        {getCareRecordStatusLabel(record)}
      </Badge>
    </div>
  );
}

function QuickActions() {
  // Every tile opens an all-pets list or a general management page. Actions
  // that need one specific pet start from that pet's own card instead — the
  // dashboard never silently picks a pet on the owner's behalf.
  return (
    <DashboardSection title="Quick actions">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <ActionTile
          ariaLabel="Manage care records"
          href={ownerRoutes.records}
          icon="record"
          label="Care Records"
        />
        <ActionTile
          ariaLabel="View pet moments"
          href={ownerRoutes.moments}
          icon="heart"
          label="Moments"
        />
        <ActionTile
          ariaLabel="Update owner contact details"
          href={ownerRoutes.settingsOwnerContact}
          icon="phone"
          label="Owner Settings"
        />
      </div>
    </DashboardSection>
  );
}

function ActionTile({
  href,
  icon,
  label,
  ariaLabel,
  target,
  rel,
}: {
  href: string;
  icon: IconName;
  label: string;
  ariaLabel: string;
  target?: string;
  rel?: string;
}) {
  return (
    <Link
      aria-label={ariaLabel}
      className="brand-card flex min-h-[5.5rem] min-w-0 flex-col items-center justify-center gap-2 rounded-[1.25rem] px-2 py-3 text-center font-extrabold text-pet-ink transition hover:border-pet-teal hover:bg-pet-cream sm:px-3"
      href={href}
      rel={rel}
      target={target}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f3ff] text-pet-teal">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 max-w-full text-xs leading-tight sm:text-sm">
        {label}
      </span>
    </Link>
  );
}

function collectFulfilled<T>(
  results: PromiseSettledResult<{ data: T[] }>[]
): T[] {
  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.data : []
  );
}

function fulfilledPetIds<T>(
  pets: Pet[],
  results: PromiseSettledResult<{ data: T[] }>[]
) {
  return new Set(
    pets.flatMap((pet, index) =>
      results[index]?.status === "fulfilled" ? [pet.id] : []
    )
  );
}

function countByPet(items: Array<{ petId: string }>) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.petId, (counts.get(item.petId) ?? 0) + 1);
  }
  return counts;
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
