"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DashboardCareSection,
  type DashboardCareState,
} from "@/components/portal/dashboard/DashboardCareSection";
import {
  ALL_PETS,
  DashboardPetFilter,
} from "@/components/portal/dashboard/DashboardPetFilter";
import {
  DashboardRecentMoments,
  type DashboardMomentsState,
} from "@/components/portal/dashboard/DashboardRecentMoments";
import { OwnerContactSetupCard } from "@/components/portal/OwnerContactSetupCard";
import { ProfileCompletionCard } from "@/components/portal/ProfileCompletionCard";
import { ShareCenter } from "@/components/share/ShareCenter";
import { PetShareCard } from "@/components/share/PetShareCard";
import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { getPrivateMomentNotes, type PetMomentsLoad } from "@/lib/dashboardHome";
import {
  publicProfilesEnabled,
  safetyProfilesOwnerUiEnabled,
} from "@/lib/features";
import {
  hasUsableOwnerContact,
  readOwnerSettings,
  subscribeOwnerSettings,
} from "@/lib/ownerSettings";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getActivePets, getMemorialPets } from "@/lib/petLifecycle";
import { derivePetOccasions, type PetOccasion } from "@/lib/petOccasions";
import { toOwnerPetShareTarget } from "@/lib/petShareTarget";
import { getEffectivePlanLimits } from "@/lib/planLimits";
import { deriveProfileCompletion } from "@/lib/profileCompletion";
import {
  getAvailablePetShareCardOptions,
  getPublicProfileShareCardImagePath,
  getPublicProfileShareVersion,
} from "@/lib/publicProfileSocial";
import { ownerRoutes } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import { getPetMoments } from "@/services/momentService";
import { getFriendlyApiErrorMessage, getPets } from "@/services/petService";
import { getUpcomingCareSummary } from "@/services/recordService";
import type { PetListItem } from "@/types";

type DashboardClientProps = {
  initialPets: PetListItem[];
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

/**
 * Home for a signed-in owner, pets first.
 *
 * The pets are the only critical read: they render as soon as they arrive.
 * Care and Moments then load independently, each with its own loading,
 * failure and retry, so one slow or failed section never hides the pets or
 * the other section — and a failed care read never looks like "nothing due".
 */
export function DashboardClient({ initialPets }: DashboardClientProps) {
  const apiMode = isApiConfigured();
  const [allPets, setAllPets] = useState<PetListItem[]>(apiMode ? [] : initialPets);
  const [loading, setLoading] = useState(apiMode);
  const [error, setError] = useState("");
  const [careState, setCareState] = useState<DashboardCareState>({
    status: "loading",
  });
  const [momentsState, setMomentsState] = useState<DashboardMomentsState>({
    status: "loading",
  });
  const [petFilter, setPetFilter] = useState(ALL_PETS);
  const careRequestRef = useRef(0);
  const momentsRequestRef = useRef(0);
  const hasOwnerContact = useSyncExternalStore(
    subscribeOwnerSettings,
    getHasOwnerContactSnapshot,
    getServerHasOwnerContactSnapshot
  );

  const loadCare = useCallback(async () => {
    const request = ++careRequestRef.current;
    setCareState({ status: "loading" });
    try {
      // One summary read: every count and item on the Dashboard comes from
      // the same consistent view, never from pages stitched together.
      const summary = await getUpcomingCareSummary();
      if (request === careRequestRef.current) {
        setCareState({ status: "ready", summary });
      }
    } catch {
      if (request === careRequestRef.current) {
        setCareState({ status: "error" });
      }
    }
  }, []);

  const loadMoments = useCallback(async (activePets: PetListItem[]) => {
    const request = ++momentsRequestRef.current;
    setMomentsState({ status: "loading" });
    const results = await Promise.allSettled(
      activePets.map((pet) => getPetMoments(pet.id))
    );
    if (request !== momentsRequestRef.current) return;

    setMomentsState({
      status: "ready",
      loads: activePets.map((pet, index): PetMomentsLoad => {
        const result = results[index];
        return result?.status === "fulfilled"
          ? {
              petId: pet.id,
              status: "ok",
              moments: result.value.data,
              total: result.value.meta?.total,
            }
          : { petId: pet.id, status: "failed" };
      }),
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      let petsData: PetListItem[];

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
      setLoading(false);

      const activePets = getActivePets(petsData);
      if (activePets.length) {
        void loadCare();
        void loadMoments(activePets);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [apiMode, loadCare, loadMoments]);

  const pets = getActivePets(allPets);
  const memorialPets = getMemorialPets(allPets);
  const lostModePets = pets.filter((pet) => pet.lostModeEnabled);
  const filterValue = pets.some((pet) => pet.id === petFilter)
    ? petFilter
    : ALL_PETS;
  const scopePets =
    filterValue === ALL_PETS ? pets : pets.filter((pet) => pet.id === filterValue);
  const scopePetIds = scopePets.map((pet) => pet.id);
  const singlePetId = scopePets.length === 1 ? scopePets[0].id : undefined;
  const secondaryReady =
    careState.status !== "loading" && momentsState.status !== "loading";

  const completionCandidate = useMemo(() => {
    if (!secondaryReady) return undefined;

    const momentCounts = new Map(
      momentsState.status === "ready"
        ? momentsState.loads.flatMap((load) =>
            load.status === "ok" ? [[load.petId, load.moments.length] as const] : []
          )
        : []
    );
    const petsWithCare =
      careState.status === "ready"
        ? new Set(
            careState.summary.scopes.flatMap((scope) =>
              scope.petId !== null && scope.hasCareRecords ? [scope.petId] : []
            )
          )
        : null;

    const candidates = pets
      .map((pet) => ({
        pet,
        completion: deriveProfileCompletion({
          pet,
          momentCount: momentCounts.get(pet.id),
          careRecordCount: petsWithCare
            ? petsWithCare.has(pet.id)
              ? 1
              : 0
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
  }, [careState, momentsState, pets, secondaryReady]);

  if (loading) {
    return <DashboardLoading />;
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
  // an empty dashboard of zero-value sections.
  if (!pets.length && !memorialPets.length) {
    return (
      <div className="grid gap-6">
        {!hasOwnerContact ? <OwnerContactSetupCard /> : null}
        <ZeroPetWelcome />
      </div>
    );
  }

  if (!pets.length) {
    return (
      <div className="grid gap-6">
        <DashboardGreeting subtitle="Your pets' profiles and Moments are kept safe here." />
        <MemorialPetsSection pets={memorialPets} />
      </div>
    );
  }

  const celebrations = pets.flatMap((pet) =>
    pet.publicProfileEnabled && !pet.lostModeEnabled
      ? derivePetOccasions(pet, new Date()).map((occasion) => ({ pet, occasion }))
      : []
  );
  const privateNotes =
    momentsState.status === "ready"
      ? getPrivateMomentNotes(
          momentsState.loads,
          pets.map((pet) => pet.id),
          getEffectivePlanLimits().maxMemoriesPerPet
        )
      : [];

  return (
    <div className="grid min-w-0 gap-6 sm:gap-7" data-dashboard>
      {lostModePets.length ? <LostModeAlert pets={lostModePets} /> : null}

      <DashboardGreeting
        subtitle={
          pets.length === 1
            ? `Here's what's coming up for ${pets[0].name}.`
            : "Here's what's coming up for your pets."
        }
      />

      <DashboardPetsSection pets={pets} />

      {pets.length > 1 ? (
        <DashboardPetFilter
          onChange={setPetFilter}
          pets={pets}
          value={filterValue}
        />
      ) : null}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] 2xl:items-start">
        <DashboardCareSection
          onRetry={() => void loadCare()}
          scopePetId={filterValue === ALL_PETS ? null : filterValue}
          singlePetId={singlePetId}
          state={careState}
        />
        <DashboardRecentMoments
          onRetry={() => void loadMoments(pets)}
          pets={pets}
          scopePetIds={scopePetIds}
          singlePetId={singlePetId}
          state={momentsState}
        />
      </div>

      {/* One next step at most. Finder contact comes first because it is
          what lets a lost pet get home; a celebration next; then profile
          completion. */}
      {!hasOwnerContact ? (
        <OwnerContactSetupCard />
      ) : celebrations.length ? (
        <DashboardOccasionSection celebrations={celebrations} />
      ) : completionCandidate ? (
        <ProfileCompletionCard
          compact
          completion={completionCandidate.completion}
          pet={completionCandidate.pet}
        />
      ) : null}

      {privateNotes.length ? (
        <ul className="grid gap-1.5" data-dashboard-private-notes>
          {privateNotes.map((note) => {
            const pet = pets.find((item) => item.id === note.petId);
            return (
              <li
                className="flex min-w-0 items-start gap-2 text-xs font-medium leading-5 text-pet-muted"
                key={note.petId}
              >
                <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" name="heart" />
                <span className="min-w-0">
                  {pet?.name ?? "Your pet"} has {note.privateCount} of {note.limit} private
                  Moments.{" "}
                  <Link
                    className="font-bold text-pet-teal hover:text-[#0f5fd0]"
                    href={ownerRoutes.petMoments(note.petId)}
                  >
                    View Moments
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function DashboardGreeting({ subtitle }: { subtitle: string }) {
  return (
    <header className="min-w-0">
      <h1 className="brand-heading text-xl font-bold leading-tight text-pet-ink sm:text-2xl">
        Welcome back
      </h1>
      <p className="mt-1 break-words text-sm leading-6 text-pet-muted [overflow-wrap:anywhere]">
        {subtitle}
      </p>
    </header>
  );
}

function DashboardLoading() {
  return (
    <div aria-busy="true" className="grid gap-6 sm:gap-7" data-dashboard-loading>
      <p className="sr-only" role="status">
        Loading your dashboard
      </p>
      <div aria-hidden="true" className="grid gap-2">
        <span className="h-7 w-40 animate-pulse rounded-full bg-white/80 motion-reduce:animate-none" />
        <span className="h-4 w-64 max-w-full animate-pulse rounded-full bg-white/70 motion-reduce:animate-none" />
      </div>
      <div aria-hidden="true" className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((key) => (
          <span
            className="h-[7.75rem] animate-pulse rounded-[1.375rem] bg-white/80 motion-reduce:animate-none"
            key={key}
          />
        ))}
      </div>
      <span
        aria-hidden="true"
        className="h-44 animate-pulse rounded-[1.375rem] bg-white/80 motion-reduce:animate-none"
      />
    </div>
  );
}

function DashboardOccasionSection({
  celebrations,
}: {
  celebrations: Array<{ pet: PetListItem; occasion: PetOccasion }>;
}) {
  return (
    <section className="min-w-0" aria-labelledby="dashboard-celebrate-title">
      <div className="mb-3">
        <h2
          className="brand-heading text-lg font-bold text-pet-ink sm:text-xl"
          id="dashboard-celebrate-title"
        >
          Celebrate today
        </h2>
        <p className="mt-1 text-sm leading-5 text-pet-muted">
          Create a card for today&apos;s special moments.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {celebrations.map(({ pet, occasion }) => (
          <article
            className="flex min-w-0 items-center gap-3 rounded-[1.375rem] border border-pet-border bg-white p-4 shadow-[0_8px_24px_rgba(13,27,61,0.05)]"
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
    </section>
  );
}

function occasionMessage(name: string, occasion: PetOccasion) {
  return occasion.count === 0
    ? `${name} is celebrating today.`
    : `${name} turns ${occasion.count} today.`;
}

function LostModeAlert({ pets }: { pets: PetListItem[] }) {
  const onePet = pets.length === 1 ? pets[0] : undefined;
  const href = onePet ? ownerRoutes.petProfile(onePet.id) : ownerRoutes.pets;

  return (
    <Link
      className="flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-[#ffc7bc] bg-[#ffe8e3] p-3.5 transition hover:border-pet-coral"
      data-dashboard-lost-mode
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
        Create your first pet profile to start adding photos, Moments, and
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

/**
 * A household whose pets are all in Memorial Mode. Quiet on purpose: no due
 * care, no celebration and no suggestion to add another pet — just a way back
 * to each pet's profile and Moments.
 */
function MemorialPetsSection({ pets }: { pets: PetListItem[] }) {
  return (
    <section
      aria-labelledby="dashboard-memorial-title"
      className="min-w-0 rounded-[1.375rem] border border-pet-border bg-white p-4 shadow-[0_8px_24px_rgba(13,27,61,0.05)] sm:p-5"
      data-dashboard-memorial
    >
      <h2
        className="brand-heading text-lg font-bold text-pet-ink sm:text-xl"
        id="dashboard-memorial-title"
      >
        Your pets
      </h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {pets.map((pet) => (
          <li key={pet.id}>
            <Link
              className="flex min-w-0 items-center gap-3 rounded-2xl bg-pet-cream/70 p-3 transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
              href={ownerRoutes.petProfile(pet.id)}
            >
              <PetAvatar pet={pet} size="md" />
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-pet-ink" title={pet.name}>
                  {pet.name}
                </span>
                <span className="block text-xs font-medium text-pet-muted">
                  In loving memory
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DashboardPetsSection({ pets }: { pets: PetListItem[] }) {
  const visiblePets = pets.slice(0, 4);
  const remaining = pets.length - visiblePets.length;

  return (
    <section aria-labelledby="dashboard-pets-title" className="min-w-0">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <h2
          className="brand-heading min-w-0 text-lg font-bold leading-tight text-pet-ink sm:text-xl"
          id="dashboard-pets-title"
        >
          Your pets
        </h2>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
          href={ownerRoutes.pets}
        >
          Manage pets
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {visiblePets.map((pet) => (
          <DashboardPetCard key={pet.id} pet={pet} />
        ))}
      </div>
      {remaining > 0 ? (
        <Link
          className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-pet-teal transition hover:text-[#0f5fd0]"
          href={ownerRoutes.pets}
        >
          View all {pets.length} pets
        </Link>
      ) : null}
    </section>
  );
}

function DashboardPetCard({ pet }: { pet: PetListItem }) {
  const isPublic = pet.publicProfileEnabled;
  const sharePath = pet.publicProfilePath;

  return (
    <article
      className="min-w-0 rounded-[1.375rem] border border-pet-border bg-white p-3.5 shadow-[0_8px_24px_rgba(13,27,61,0.05)] sm:p-4"
      data-dashboard-pet-card
    >
      <Link
        aria-label={`Manage ${pet.name}`}
        className="group flex min-w-0 items-center gap-3.5 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
        href={ownerRoutes.petProfile(pet.id)}
      >
        <PetAvatar pet={pet} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="brand-heading min-w-0 flex-1 truncate text-base font-bold text-pet-ink sm:text-lg"
              title={pet.name}
            >
              {pet.name}
            </span>
            {publicProfilesEnabled ? (
              <Badge className="shrink-0" tone={isPublic ? "mint" : "soft"}>
                {isPublic ? "Public" : "Private"}
              </Badge>
            ) : null}
          </span>
          <span
            className="mt-0.5 line-clamp-2 text-xs font-medium leading-4 text-pet-muted"
            data-dashboard-pet-metadata
          >
            {getPetSummaryLabel(pet)}
          </span>
        </span>
        <Icon
          aria-hidden="true"
          name="chevron"
          className="h-4 w-4 shrink-0 -rotate-90 text-pet-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>

      {publicProfilesEnabled ? (
        <div className="mt-3 border-t border-pet-border/70 pt-3">
          {isPublic ? (
            <ShareProfileActions pet={pet} sharePath={sharePath} />
          ) : (
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium leading-5 text-pet-muted">
                This profile is private and cannot be shared yet.
              </p>
              <Link
                aria-label={`Enable ${pet.name}'s Share Profile`}
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
 * Share Profile actions: the one Share entry point (the Share Center, which
 * also holds the QR) plus a View link that opens the public page in a new
 * tab. Full width on a phone for tap comfort; compact from sm upwards.
 */
function ShareProfileActions({
  pet,
  sharePath,
}: {
  pet: PetListItem;
  sharePath: string;
}) {
  return (
    <div
      className="grid min-w-0 grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap sm:items-center"
      data-dashboard-pet-actions
    >
      <ShareCenter
        target={toOwnerPetShareTarget(pet)}
        triggerClassName="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-pet-teal bg-pet-teal px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#0f5fd0] sm:px-4"
      />
      <Link
        aria-label={`View ${pet.name}'s Share Profile`}
        className="inline-flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-pet-border bg-white px-4 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
        href={sharePath}
        rel="noopener noreferrer"
        target="_blank"
      >
        View
      </Link>
    </div>
  );
}
