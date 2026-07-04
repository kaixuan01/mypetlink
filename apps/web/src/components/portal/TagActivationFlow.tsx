"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import { getPetSummaryLabel } from "@/lib/petDisplay";
import { getActivePets } from "@/lib/petLifecycle";
import { ownerRoutes, tagPath } from "@/lib/routes";
import { isApiConfigured } from "@/services/apiConfig";
import { isOwnerAuthenticated, loginMockOwner } from "@/services/authService";
import { getPets } from "@/services/petService";
import {
  activateTag,
  getFinderState,
  getFriendlyTagErrorMessage,
  getAllTags,
} from "@/services/tagService";
import type { FinderResult, Pet, PetTag } from "@/types";

type TagActivationFlowProps = {
  initialResult: FinderResult;
  tagCode: string;
};

function getPreferredPetId(result: FinderResult) {
  return result.state === "pending" ? result.petId ?? "" : "";
}

// Scan -> /t/{tagCode} (Unassigned) -> here. Sign in, pick the pet, confirm the
// binding, see success. The tag code stays in the URL the whole time so an
// unauthenticated owner is never sent back to re-scan or dropped on the
// dashboard before activation completes.
export function TagActivationFlow({
  initialResult,
  tagCode,
}: TagActivationFlowProps) {
  const apiMode = isApiConfigured();
  const [result, setResult] = useState(initialResult);
  const [authed, setAuthed] = useState(() => isOwnerAuthenticated());
  const [pets, setPets] = useState<Pet[]>([]);
  const [ownerTags, setOwnerTags] = useState<PetTag[]>([]);
  const [ownerDataLoaded, setOwnerDataLoaded] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState(() =>
    getPreferredPetId(initialResult)
  );
  const [submitting, setSubmitting] = useState(false);
  const [activatedPet, setActivatedPet] = useState<Pet | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getFinderState(tagCode)
      .then((next) => {
        if (active) {
          setResult(next);
          setSelectedPetId((current) => current || getPreferredPetId(next));
          setError("");
        }
      })
      .catch((caught) => {
        if (active) {
          setError(getFriendlyTagErrorMessage(caught));
        }
      });

    return () => {
      active = false;
    };
  }, [tagCode]);

  useEffect(() => {
    if (!authed) {
      return;
    }

    let active = true;

    Promise.all([getPets(), getAllTags()])
      .then(([petResponse, tagResponse]) => {
        if (active) {
          const activePets = getActivePets(petResponse.data);
          setPets(activePets);
          setOwnerTags(tagResponse.data);
          const preferredPetId = getPreferredPetId(initialResult);
          setSelectedPetId((current) => {
            if (current && activePets.some((pet) => pet.id === current)) {
              return current;
            }

            if (
              preferredPetId &&
              activePets.some((pet) => pet.id === preferredPetId)
            ) {
              return preferredPetId;
            }

            return activePets[0]?.id || "";
          });
          setOwnerDataLoaded(true);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(getFriendlyTagErrorMessage(caught));
          setOwnerDataLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [authed, initialResult]);

  function handleSignIn() {
    if (apiMode) {
      window.location.href = `/login?redirect=${encodeURIComponent(
        `/activate/${tagCode}`
      )}`;
      return;
    }

    loginMockOwner();
    setAuthed(true);
  }

  async function handleActivate() {
    const assigned = getOwnedAssignedTag(ownerTags, tagCode);

    if (!assigned && !selectedPetId) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await activateTag(tagCode, assigned ? undefined : selectedPetId);

      if (response.data) {
        setActivatedPet(
          pets.find((pet) => pet.id === (assigned?.petId ?? selectedPetId)) ?? null
        );
      }
    } catch (caught) {
      setError(getFriendlyTagErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !authed) {
    return (
      <ActivationShell>
        <ActivationCard
          description={error}
          icon="shield"
          tagCode={tagCode}
          title="Tag status unavailable"
          tone="soft"
        />
      </ActivationShell>
    );
  }

  if (activatedPet) {
    return (
      <ActivationShell>
        <ActivationCard
          description={`${activatedPet.name}'s MyPetLink tag is now active. If they are ever found, the finder can open their safety page instantly.`}
          icon="shield"
          tagCode={tagCode}
          title="Tag activated"
          tone="teal"
        >
          <div className="grid gap-3">
            <CTAButton
              className="min-h-14 text-base"
              href={activatedPet.publicProfilePath}
              icon="qr"
              fullWidth
            >
              Preview Public Profile
            </CTAButton>
            <CTAButton
              href={tagPath(tagCode)}
              icon="tag"
              variant="secondary"
              fullWidth
            >
              View Tag Scan Page
            </CTAButton>
            <CTAButton href={ownerRoutes.dashboard} variant="outline" fullWidth>
              Go to Dashboard
            </CTAButton>
          </div>
        </ActivationCard>
      </ActivationShell>
    );
  }

  if (result.state === "active") {
    return (
      <ActivationShell>
        <ActivationCard
          description="This tag is already linked to a pet profile. You can open its safety page anytime."
          icon="paw"
          tagCode={result.tagCode}
          title="Tag already activated"
          tone="teal"
        >
          <CTAButton
            className="min-h-14 text-base"
            href={tagPath(result.tagCode)}
            icon="qr"
            fullWidth
          >
            View Tag Scan Page
          </CTAButton>
        </ActivationCard>
      </ActivationShell>
    );
  }

  if (result.state === "inactive") {
    return (
      <ActivationShell>
        <ActivationCard
          description="This tag is no longer active, so it cannot be activated. Please order or activate another MyPetLink tag."
          icon="shield"
          tagCode={result.tagCode}
          title="This tag cannot be activated"
          tone="soft"
        />
      </ActivationShell>
    );
  }

  if (result.state === "pending" && !authed) {
    return (
      <ActivationShell>
        <ActivationCard
          description="Sign in to the MyPetLink account that ordered this tag. We will check the order before activation."
          icon="shield"
          tagCode={result.tagCode}
          title="Sign in to activate this tag"
          tone="teal"
        >
          <CTAButton
            className="min-h-14 text-base"
            icon="paw"
            onClick={handleSignIn}
            fullWidth
          >
            Continue with owner account
          </CTAButton>
        </ActivationCard>
      </ActivationShell>
    );
  }

  if (result.state === "pending" && authed && !ownerDataLoaded) {
    return (
      <ActivationShell>
        <ActivationCard
          description="Checking this tag against your owner account."
          icon="tag"
          tagCode={result.tagCode}
          title="Checking tag ownership"
          tone="soft"
        />
      </ActivationShell>
    );
  }

  if (result.state === "pending") {
    const assigned = getOwnedAssignedTag(ownerTags, tagCode);
    const assignedPet = assigned?.petId
      ? pets.find((pet) => pet.id === assigned.petId)
      : undefined;

    if (!assigned || !assignedPet) {
      return (
        <ActivationShell>
          <ActivationCard
            description="This tag is linked to another MyPetLink account. Please sign in with the account that ordered this tag."
            icon="shield"
            tagCode={result.tagCode}
            title="This tag is linked to another account"
            tone="soft"
          />
        </ActivationShell>
      );
    }

    return (
      <ActivationShell>
        <ActivationCard
          description="This tag is already linked to your order. Activate it when you have received the physical tag."
          icon="tag"
          tagCode={result.tagCode}
          title={`Activate this tag for ${assignedPet.name}`}
          tone="teal"
        >
          <div className="grid gap-3">
            {error ? (
              <p className="rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-center text-sm font-bold text-[#a63c2e]">
                {error}
              </p>
            ) : null}
            <CTAButton
              className="min-h-14 text-base"
              disabled={submitting}
              icon="paw"
              onClick={handleActivate}
              fullWidth
            >
              {submitting ? "Activating..." : "Activate Tag"}
            </CTAButton>
          </div>
        </ActivationCard>
      </ActivationShell>
    );
  }

  if (result.state === "not-found") {
    return (
      <ActivationShell>
        <ActivationCard
          description="We could not find a MyPetLink tag with this code. Please check the code printed on the tag and try again."
          icon="qr"
          tagCode={result.tagCode}
          title="Tag not found"
          tone="soft"
        />
      </ActivationShell>
    );
  }

  if (!authed) {
    return (
      <ActivationShell>
        <ActivationCard
          description="Sign in to your MyPetLink owner account to link this tag to your pet. We will keep this tag code ready for you."
          icon="shield"
          tagCode={tagCode}
          title="Sign in to activate this tag"
          tone="teal"
        >
          <CTAButton
            className="min-h-14 text-base"
            icon="paw"
            onClick={handleSignIn}
            fullWidth
          >
            Continue with owner account
          </CTAButton>
        </ActivationCard>
      </ActivationShell>
    );
  }

  if (error && !pets.length) {
    return (
      <ActivationShell>
        <ActivationCard
          description={error}
          icon="shield"
          tagCode={tagCode}
          title="Pet profiles could not load"
          tone="soft"
        />
      </ActivationShell>
    );
  }

  if (!pets.length) {
    return (
      <ActivationShell>
        <ActivationCard
          description="A tag needs an active pet profile so finders can open the QR Safety Page."
          icon="paw"
          tagCode={tagCode}
          title="No active pet profile available"
          tone="soft"
        >
          <CTAButton href={ownerRoutes.petNew} icon="paw" fullWidth>
            Add Pet Profile
          </CTAButton>
        </ActivationCard>
      </ActivationShell>
    );
  }

  return (
    <ActivationShell>
      <ActivationCard
        description="Choose which pet this tag belongs to. You can change this later from Smart Tags."
        icon="tag"
        tagCode={tagCode}
        title="Activate your MyPetLink Tag"
        tone="teal"
      >
        <div className="grid gap-3 text-left">
          {pets.map((pet) => {
            const selected = pet.id === selectedPetId;

            return (
              <button
                className={`flex items-center gap-3 rounded-[1.25rem] border-2 p-3 text-left transition ${
                  selected
                    ? "border-pet-teal bg-[#e8f3ff]"
                    : "border-pet-border bg-white hover:bg-pet-cream"
                }`}
                key={pet.id}
                onClick={() => setSelectedPetId(pet.id)}
                type="button"
              >
                <PetAvatar pet={pet} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-black text-pet-ink">
                    {pet.name}
                  </span>
                  <span className="block text-xs font-semibold text-pet-muted">
                    {getPetSummaryLabel(pet)}
                  </span>
                </span>
                {selected ? (
                  <Icon name="shield" className="h-5 w-5 text-pet-teal" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3">
          {error ? (
            <p className="rounded-[1.25rem] border border-[#ffd2c9] bg-[#fff4f1] px-4 py-3 text-center text-sm font-bold text-[#a63c2e]">
              {error}
            </p>
          ) : null}
          <CTAButton
            className="min-h-14 text-base"
            disabled={!selectedPetId || submitting}
            icon="paw"
            onClick={handleActivate}
            fullWidth
          >
            {submitting ? "Activating..." : "Activate Tag"}
          </CTAButton>
          <Link
            className="text-center text-sm font-bold text-pet-teal underline"
            href={ownerRoutes.petNew}
          >
            Create a new pet profile instead
          </Link>
        </div>
      </ActivationCard>
    </ActivationShell>
  );
}

function getOwnedAssignedTag(tags: PetTag[], tagCode: string) {
  const normalized = tagCode.trim().toLowerCase();

  return tags.find(
    (tag) =>
      tag.tagCode.toLowerCase() === normalized &&
      Boolean(tag.petId) &&
      !tag.isArchived &&
      ["Pending", "Preparing", "Delivered"].includes(tag.status)
  );
}

function ActivationShell({ children }: { children: ReactNode }) {
  return (
    <main className="brand-blue-section min-h-screen px-4 py-5 sm:px-6">
      <header className="mx-auto mb-4 flex max-w-xl items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo markOnly className="h-10 w-10" />
          <span className="text-sm font-black text-pet-ink">
            MyPetLink Tag Activation
          </span>
        </Link>
      </header>
      {children}
    </main>
  );
}

function ActivationCard({
  children,
  description,
  icon,
  tagCode,
  title,
  tone,
}: {
  children?: ReactNode;
  description: string;
  icon: "shield" | "tag" | "qr" | "paw";
  tagCode: string;
  title: string;
  tone: "teal" | "soft";
}) {
  const iconWrap =
    tone === "teal"
      ? "bg-[#e8f3ff] text-pet-teal"
      : "bg-pet-cream text-pet-muted";

  return (
    <article className="brand-card mx-auto max-w-xl rounded-[2rem] p-6 text-center sm:p-8">
      <span
        className={`mx-auto grid h-16 w-16 place-items-center rounded-[1.5rem] ${iconWrap}`}
      >
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-3xl font-black text-pet-ink">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-pet-muted">
        {description}
      </p>
      <div className="mx-auto mt-5 flex flex-col items-center rounded-[1.25rem] bg-pet-cream px-5 py-3">
        <span className="text-xs font-bold uppercase text-pet-muted">
          Tag code
        </span>
        <span className="mt-1 font-black tracking-wide text-pet-ink">
          {tagCode}
        </span>
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </article>
  );
}
