"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PublicSharePetProfile } from "@/components/marketing/PublicSharePetProfile";
import { QrSafetyRouteView } from "@/components/marketing/QrSafetyRouteView";
import { PetManagementTabs } from "@/components/portal/PetManagementTabs";
import { PetMomentForm } from "@/components/portal/PetMomentForm";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { PetProfileForm } from "@/components/portal/PetProfileForm";
import { PetQrSafetyManager } from "@/components/portal/PetQrSafetyManager";
import { PetSwitcher } from "@/components/portal/PetSwitcher";
import { PetTimeline } from "@/components/portal/PetTimeline";
import { ProfileAccessBadges } from "@/components/portal/ProfileAccessStatus";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { TagOrderFlow } from "@/components/portal/TagOrderFlow";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { parsePublicProfileParam, ownerRoutes } from "@/lib/routes";
import { getPublicPetMoments, getPetMoments } from "@/services/momentService";
import {
  getPetById,
  getPets,
  getPublicPetProfileByPublicCode,
  getPublicPetProfileBySafetyCode,
} from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import { getOrders, getPetTags } from "@/services/tagService";
import type {
  CareRecord,
  Pet,
  PetMoment,
  PetTag,
  PublicPetProfile,
  TagOrder,
} from "@/types";

type OwnerSection =
  | "profile"
  | "edit"
  | "records"
  | "moments"
  | "moment-new"
  | "timeline"
  | "qr"
  | "tags"
  | "tag-order";

type RuntimeRoute =
  | { kind: "public"; param: string }
  | { kind: "qr"; safetyCode: string }
  | { kind: "owner"; petId: string; section: OwnerSection }
  | { kind: "none" };

type RuntimeState =
  | { status: "loading" }
  | { status: "not-found" }
  | {
      status: "public";
      profile: PublicPetProfile;
      moments: PetMoment[];
      records: CareRecord[];
    }
  | {
      status: "qr";
      safetyCode: string;
      profile: PublicPetProfile | null;
    }
  | {
      status: "owner";
      pet: Pet;
      pets: Pet[];
      records: CareRecord[];
      moments: PetMoment[];
      tags: PetTag[];
      orders: TagOrder[];
      section: OwnerSection;
    };

export function RuntimeRouteFallback({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RuntimeState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const route = parseRuntimeRoute(window.location.pathname);

    async function resolveRoute() {
      if (route.kind === "none") {
        setState({ status: "not-found" });
        return;
      }

      if (route.kind === "public") {
        const { publicCode } = parsePublicProfileParam(route.param);
        const profileResponse =
          await getPublicPetProfileByPublicCode(publicCode);

        if (!active) {
          return;
        }

        if (!profileResponse.data) {
          setState({ status: "not-found" });
          return;
        }

        const [momentsResponse, recordsResponse] = await Promise.all([
          getPublicPetMoments(profileResponse.data.id),
          getPetRecords(profileResponse.data.id),
        ]);

        if (!active) {
          return;
        }

        setState({
          status: "public",
          profile: profileResponse.data,
          moments: momentsResponse.data,
          records: recordsResponse.data,
        });
        return;
      }

      if (route.kind === "qr") {
        const profileResponse = await getPublicPetProfileBySafetyCode(
          route.safetyCode
        );

        if (active) {
          setState({
            status: "qr",
            safetyCode: route.safetyCode,
            profile: profileResponse.data,
          });
        }

        return;
      }

      const [
        petResponse,
        petsResponse,
        recordsResponse,
        momentsResponse,
        tagsResponse,
        ordersResponse,
      ] = await Promise.all([
        getPetById(route.petId),
        getPets(),
        getPetRecords(route.petId),
        getPetMoments(route.petId),
        getPetTags(route.petId),
        getOrders(),
      ]);

      if (!active) {
        return;
      }

      if (!petResponse.data) {
        setState({ status: "not-found" });
        return;
      }

      const resolvedPet = petResponse.data;
      const pets = petsResponse.data.some((pet) => pet.id === resolvedPet.id)
        ? petsResponse.data
        : [resolvedPet, ...petsResponse.data];

      setState({
        status: "owner",
        pet: resolvedPet,
        pets,
        records: recordsResponse.data,
        moments: momentsResponse.data,
        tags: tagsResponse.data,
        orders: ordersResponse.data,
        section: route.section,
      });
    }

    resolveRoute().catch(() => {
      if (active) {
        setState({ status: "not-found" });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return <RuntimeLoading />;
  }

  if (state.status === "not-found") {
    return <>{children}</>;
  }

  if (state.status === "public") {
    return (
      <main className="min-h-screen bg-pet-cream">
        <PublicSharePetProfile
          initialMoments={state.moments}
          initialProfile={state.profile}
          initialRecords={state.records}
          initialLostMode={state.profile.lostModeEnabled}
        />
      </main>
    );
  }

  if (state.status === "qr") {
    return (
      <QrSafetyRouteView
        initialProfile={state.profile}
        safetyCode={state.safetyCode}
      />
    );
  }

  return <OwnerRuntimeView state={state} />;
}

function OwnerRuntimeView({
  state,
}: {
  state: Extract<RuntimeState, { status: "owner" }>;
}) {
  const { pet, pets, records, moments, tags, orders, section } = state;
  const petOrders = orders.filter((order) => order.petId === pet.id);

  if (section === "edit") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Edit pet"
          title={`Edit ${pet.name}`}
          description="Update profile, photos, privacy, and safety settings."
        />
        <PetProfileForm initialPet={pet} mode="edit" />
      </AppLayout>
    );
  }

  if (section === "records") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Care Records"
          title={`${pet.name}'s health and care history`}
          description="Keep vaccines, deworming, grooming, vet visits, medication, and allergy notes in one place."
        />
        <PetSwitcher activePetId={pet.id} pets={pets} section="records" />
        <RecordsManager petId={pet.id} initialRecords={records} />
      </AppLayout>
    );
  }

  if (section === "moments") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Pet moments"
          title={`${pet.name}'s memories`}
          description="Save photos, short videos, milestones, funny moments, and life notes for this pet."
        />
        <PetSwitcher activePetId={pet.id} pets={pets} section="moments" />
        <PetMomentsManager pet={pet} initialMoments={moments} />
      </AppLayout>
    );
  }

  if (section === "moment-new") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Add moment"
          title={`Save a moment for ${pet.name}`}
          description="Add a memory, milestone, photo moment, or short clip for your pet."
        />
        <PetMomentForm pet={pet} />
      </AppLayout>
    );
  }

  if (section === "timeline") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Life timeline"
          title={`${pet.name}'s story`}
          description="A gentle timeline of milestones, memories, care days, and everyday notes."
        />
        <PetTimeline pet={pet} initialMoments={moments} />
      </AppLayout>
    );
  }

  if (section === "qr") {
    return (
      <AppLayout>
        <PetQrSafetyManager initialPet={pet} initialTags={tags} />
      </AppLayout>
    );
  }

  if (section === "tags") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Smart tags"
          title={`${pet.name}'s MyPetLink Smart Tags`}
          description="One pet can have multiple tags for different collars, replacements, or upgrades."
          action={
            <CTAButton href={ownerRoutes.petTagOrder(pet.id)} icon="tag">
              Order Physical Tag
            </CTAButton>
          }
        />
        <TagManagementPanel
          initialOrders={petOrders}
          initialTags={tags}
          petId={pet.id}
          pets={pets}
        />
      </AppLayout>
    );
  }

  if (section === "tag-order") {
    const orderPets = pets.some((item) => item.id === pet.id)
      ? pets
      : [pet, ...pets];

    return (
      <AppLayout>
        <PageHeader
          eyebrow="Order physical tag"
          title={`Order a tag for ${pet.name}`}
          description="Choose a MyPetLink QR Pet Tag or MyPetLink QR + NFC Smart Tag after creating your pet profile."
        />
        <TagOrderFlow
          initialTagType="MyPetLink QR Pet Tag"
          pets={orderPets}
          preselectedPetId={pet.id}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section className="brand-card mb-6 rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="sm:hidden">
              <PetAvatar pet={pet} size="md" />
            </span>
            <span className="hidden sm:block">
              <PetAvatar pet={pet} size="lg" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-pet-ink sm:text-3xl">
                {pet.name}
              </h1>
              <p className="mt-1 text-sm text-pet-muted">
                {pet.species} &middot; {pet.breed} &middot; {pet.ageLabel}
              </p>
            </div>
          </div>
          <CTAButton
            href={ownerRoutes.petEdit(pet.id)}
            icon="settings"
            fullWidth
            className="sm:w-auto"
          >
            Edit Pet Details
          </CTAButton>
        </div>
        <ProfileAccessBadges
          className="mt-4"
          finderProfileUrl={pet.qrSafetyPath}
          orders={petOrders}
          qrStatus={pet.qrStatus}
          scroll
          tags={tags}
        />
      </section>

      <PetManagementTabs
        pet={pet}
        records={records}
        moments={moments}
        orders={petOrders}
        tags={tags}
      />
    </AppLayout>
  );
}

function RuntimeLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-pet-cream px-4">
      <div className="brand-card w-full max-w-md rounded-[2rem] p-8 text-center">
        <div className="flex justify-center">
          <BrandLogo className="h-12 w-auto max-w-[200px]" />
        </div>
        <p className="mt-6 text-sm font-extrabold uppercase text-pet-teal">
          Loading profile
        </p>
        <h1 className="mt-2 text-2xl font-black text-pet-ink">
          Fetching the latest saved pet details
        </h1>
      </div>
    </main>
  );
}

function parseRuntimeRoute(pathname: string): RuntimeRoute {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => safeDecode(part));

  if (parts[0] === "p" && parts.length === 2) {
    return { kind: "public", param: parts[1] };
  }

  if (parts[0] === "q" && parts.length === 2) {
    return { kind: "qr", safetyCode: parts[1] };
  }

  if (parts[0] !== "pets" || !parts[1]) {
    return { kind: "none" };
  }

  const section = ownerSectionFromPath(parts.slice(2).join("/"));

  if (!section) {
    return { kind: "none" };
  }

  return { kind: "owner", petId: parts[1], section };
}

function ownerSectionFromPath(path: string): OwnerSection | null {
  switch (path) {
    case "":
      return "profile";
    case "edit":
      return "edit";
    case "records":
      return "records";
    case "moments":
      return "moments";
    case "moments/new":
      return "moment-new";
    case "timeline":
      return "timeline";
    case "qr":
      return "qr";
    case "tags":
      return "tags";
    case "tags/order":
      return "tag-order";
    default:
      return null;
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
