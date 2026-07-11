"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppLayout } from "@/components/layouts/AppLayout";
import { PublicSharePetProfile } from "@/components/marketing/PublicSharePetProfile";
import { QrSafetyRouteView } from "@/components/marketing/QrSafetyRouteView";
import { PetDetailHeader } from "@/components/portal/PetDetailHeader";
import { PetManagementTabs } from "@/components/portal/PetManagementTabs";
import { PetMomentForm } from "@/components/portal/PetMomentForm";
import { PetMomentsManager } from "@/components/portal/PetMomentsManager";
import { PetProfileForm } from "@/components/portal/PetProfileForm";
import { PetQrRedirect } from "@/components/portal/PetQrRedirect";
import { PetSwitcher } from "@/components/portal/PetSwitcher";
import { PetTimeline } from "@/components/portal/PetTimeline";
import { RecordsManager } from "@/components/portal/RecordsManager";
import { OrderDetailView } from "@/components/portal/OrderDetailView";
import { TagFinderView } from "@/components/portal/TagFinderView";
import { TagManagementPanel } from "@/components/portal/TagManagementPanel";
import { SmartTagsComingSoon } from "@/components/portal/SmartTagsComingSoon";
import { TagOrderFlow } from "@/components/portal/TagOrderFlow";
import { CTAButton } from "@/components/ui/CTAButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PetProfileLoading } from "@/components/ui/PetProfileLoading";
import { formatOrderNumber } from "@/lib/orders";
import {
  genericNotFoundTitle,
  loadingTitle,
  orderNotFoundTitle,
  ownerPetPageTitle,
  petNotFoundTitle,
  publicPetProfileDocumentTitle,
  publicProfileNotFoundTitle,
  qrSafetyNotFoundTitle,
  qrSafetyPageTitle,
  setAbsolutePageTitle,
  setPageTitle,
  tagNotFoundTitle,
  tagScanPageTitle,
} from "@/lib/pageTitles";
import { smartTagOrderingEnabled } from "@/lib/features";
import { parsePublicProfileParam, ownerRoutes } from "@/lib/routes";
import { isApiClientError } from "@/services/apiClient";
import { isApiConfigured } from "@/services/apiConfig";
import { getPublicPetMoments, getPetMoments } from "@/services/momentService";
import {
  getPetById,
  getPets,
  getPublicPetProfileByPublicCode,
  getPublicPetProfileBySafetyCode,
} from "@/services/petService";
import { getPetRecords } from "@/services/recordService";
import {
  getAllTags,
  getFinderState,
  getOrder,
  getOrders,
  getPetTags,
} from "@/services/tagService";
import type {
  CareRecord,
  FinderResult,
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
  | { kind: "tag"; tagCode: string }
  | { kind: "order"; orderKey: string }
  | { kind: "owner"; petId: string; section: OwnerSection }
  | { kind: "none" };

type RuntimeState =
  | { status: "loading" }
  | { status: "unavailable"; message: string; title: string }
  | { status: "not-found"; title: string }
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
      status: "tag";
      tagCode: string;
      result: FinderResult;
    }
  | {
      status: "order";
      orderKey: string;
      order: TagOrder | null;
      pets: Pet[];
      tags: PetTag[];
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
    if (state.status === "loading") {
      setPageTitle(loadingTitle);
      return;
    }

    if (state.status === "owner") {
      setPageTitle(ownerPetPageTitle(state.section, state.pet.name));
      return;
    }

    if (state.status === "public") {
      setAbsolutePageTitle(publicPetProfileDocumentTitle(state.profile.name));
      return;
    }

    if (state.status === "qr") {
      setPageTitle(
        state.profile
          ? qrSafetyPageTitle(state.profile.name)
          : qrSafetyNotFoundTitle
      );
      return;
    }

    if (state.status === "tag") {
      setPageTitle(tagResultTitle(state.result));
      return;
    }

    if (state.status === "order") {
      setPageTitle(
        state.order ? formatOrderNumber(state.order) : orderNotFoundTitle
      );
      return;
    }

    setPageTitle(state.title);
  }, [state]);

  useEffect(() => {
    let active = true;
    const route = parseRuntimeRoute(window.location.pathname);
    const apiMode = isApiConfigured();

    async function resolveRoute() {
      if (route.kind === "none") {
        setState({ status: "not-found", title: genericNotFoundTitle });
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
          setState({
            status: "not-found",
            title: publicProfileNotFoundTitle,
          });
          return;
        }

        if (apiMode) {
          setState({
            status: "public",
            profile: profileResponse.data,
            moments: [],
            records: [],
          });
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

      if (route.kind === "tag") {
        const result = await getFinderState(route.tagCode);

        if (active) {
          setState({
            status: "tag",
            tagCode: route.tagCode,
            result,
          });
        }

        return;
      }

      if (route.kind === "order") {
        const [orderResponse, petsResponse, tagsResponse] = await Promise.all([
          getOrder(route.orderKey),
          getPets(),
          getAllTags(),
        ]);

        if (active) {
          setState({
            status: "order",
            orderKey: route.orderKey,
            order: orderResponse.data,
            pets: petsResponse.data,
            tags: tagsResponse.data,
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
        setState({ status: "not-found", title: petNotFoundTitle });
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

    resolveRoute().catch((caught) => {
      if (active) {
        if (isApiClientError(caught) && caught.status === 0) {
          setState({
            status: "unavailable",
            title: "MyPetLink temporarily unavailable",
            message:
              "We could not reach MyPetLink right now. Please try again.",
          });
          return;
        }

        setState({ status: "not-found", title: genericNotFoundTitle });
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

  if (state.status === "unavailable") {
    return (
      <RuntimeUnavailable title={state.title} message={state.message} />
    );
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

  if (state.status === "tag") {
    return <TagFinderView initialResult={state.result} tagCode={state.tagCode} />;
  }

  if (state.status === "order") {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Order detail"
          title={state.order ? formatOrderNumber(state.order) : "Order"}
          description="Review your tag order, payment status, delivery information, and receipt."
        />
        <OrderDetailView
          initialOrder={state.order}
          initialTags={state.tags}
          orderKey={state.orderKey}
          pets={state.pets}
        />
      </AppLayout>
    );
  }

  return <OwnerRuntimeView state={state} />;
}

function RuntimeUnavailable({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-pet-cream px-4">
      <div className="brand-card w-full max-w-md rounded-[2rem] p-8 text-center">
        <div className="flex justify-center">
          <BrandLogo className="h-12 w-auto max-w-[200px]" />
        </div>
        <h1 className="mt-6 text-2xl font-black text-pet-ink">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
          {message}
        </p>
      </div>
    </main>
  );
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
        <PetQrRedirect petId={pet.id} />
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
            smartTagOrderingEnabled ? (
              <CTAButton href={ownerRoutes.petTagOrder(pet.id)} icon="tag">
                Order Physical Tag
              </CTAButton>
            ) : undefined
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
    if (!smartTagOrderingEnabled) {
      return (
        <AppLayout>
          <PageHeader
            eyebrow="Physical tags"
            title="Smart Tags coming soon"
            description="Smart Tag ordering is not open yet. Your pet's free QR Safety Page is already active."
          />
          <SmartTagsComingSoon petId={pet.id} />
        </AppLayout>
      );
    }

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
      <PetDetailHeader pet={pet} petOrders={petOrders} tags={tags} />

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
    <main className="min-h-screen bg-pet-cream">
      <PetProfileLoading />
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

  if (parts[0] === "t" && parts.length === 2) {
    return { kind: "tag", tagCode: parts[1] };
  }

  if (parts[0] === "orders" && parts.length === 2) {
    return { kind: "order", orderKey: parts[1] };
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

function tagResultTitle(result: FinderResult) {
  switch (result.state) {
    case "active":
      return tagScanPageTitle(result.profile.name);
    case "not-found":
      return tagNotFoundTitle;
    case "unassigned":
      return "Activate MyPetLink Tag";
    case "pending":
      return "MyPetLink Tag Pending";
    case "inactive":
    default:
      return "Inactive MyPetLink Tag";
  }
}
