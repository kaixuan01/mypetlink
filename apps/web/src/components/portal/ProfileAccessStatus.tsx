import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  isActivePet,
  isArchivedPet,
  isMemorialPet,
} from "@/lib/petLifecycle";
import {
  getSafetyProfileStatusView,
  type SafetyProfilePetInput,
} from "@/lib/safetyProfile";
import {
  getPetNfcTagStatus,
  getPetSmartTagStatus,
} from "@/lib/tagStatus";
import type { PetTag, TagOrder } from "@/types";

type AccessItem = {
  label: string;
  description: string;
  icon: IconName;
  tone: "warm" | "mint" | "teal" | "soft" | "danger";
};

type ProfileAccessPet = SafetyProfilePetInput & {
  id?: string;
  name?: string;
};

/**
 * Safety Profile status presented as a badge. Derived only from the profile's
 * own switch and contact readiness — never from linked Smart Tags, which have
 * their own independent badge below.
 */
export function getSafetyProfileBadge(pet?: ProfileAccessPet): AccessItem {
  const view = getSafetyProfileStatusView(pet ?? {});

  return {
    label: view.label,
    description: view.description,
    icon: view.status === "memorial" ? "heart" : "qr",
    tone: view.tone,
  };
}

export function getSmartTagStatusBadge(
  tags: PetTag[] = [],
  orders: TagOrder[] = [],
  pet?: ProfileAccessPet
): AccessItem {
  if (isMemorialPet(pet)) {
    return {
      label: "Smart Tags Inactive",
      description: "Physical tags are kept as history for this memorial profile.",
      icon: "tag",
      tone: "soft",
    };
  }

  if (isArchivedPet(pet)) {
    return {
      label: "Smart Tags Inactive",
      description: "Restore this profile before using physical tags again.",
      icon: "tag",
      tone: "soft",
    };
  }

  const status = getPetSmartTagStatus(tags, orders, pet?.id, pet);

  if (status === "active") {
    return {
      label: "Smart Tag Linked",
      description: "A physical MyPetLink tag is linked to this pet.",
      icon: "tag",
      tone: "mint",
    };
  }

  if (status === "pending") {
    return {
      label: "Smart Tag Pending",
      description:
        "A physical tag order is in progress or waiting for activation.",
      icon: "tag",
      tone: "warm",
    };
  }

  return {
    label: "No Smart Tag Linked",
    description: "No physical MyPetLink tag is linked to this pet yet.",
    icon: "tag",
    tone: "soft",
  };
}

export function getNfcStatusBadge(
  tags: PetTag[] = [],
  orders: TagOrder[] = [],
  pet?: ProfileAccessPet
): AccessItem | null {
  if (pet && !isActivePet(pet)) {
    return null;
  }

  const status = getPetNfcTagStatus(tags, orders, pet?.id, pet);

  if (status === "active") {
    return {
      label: "NFC Active",
      description: "A QR + NFC smart tag is active for this pet.",
      icon: "tag",
      tone: "mint",
    };
  }

  if (status === "pending") {
    return {
      label: "NFC Pending",
      description: "A QR + NFC smart tag exists but is not active yet.",
      icon: "tag",
      tone: "warm",
    };
  }

  return null;
}

function getAccessItems({
  orders,
  pet,
  showNfc = true,
  tags,
}: {
  showNfc?: boolean;
  pet?: ProfileAccessPet;
  orders?: TagOrder[];
  tags?: PetTag[];
}): AccessItem[] {
  const items = [getSafetyProfileBadge(pet)];

  if (tags) {
    items.push(getSmartTagStatusBadge(tags, orders, pet));
  }

  const nfcBadge = showNfc && tags ? getNfcStatusBadge(tags, orders, pet) : null;

  if (nfcBadge) {
    items.push(nfcBadge);
  }

  return items;
}

function getAccessSummary(pet?: ProfileAccessPet) {
  if (isMemorialPet(pet)) {
    return "This memorial profile keeps memories available while finder contact actions stay off.";
  }

  if (isArchivedPet(pet)) {
    return "This archived profile is saved for history while finder contact actions stay off.";
  }

  return getSafetyProfileStatusView(pet ?? {}).description;
}

export function ProfileAccessBadges({
  className = "",
  orders,
  pet,
  scroll = false,
  showNfc = true,
  tags,
}: {
  className?: string;
  orders?: TagOrder[];
  pet?: ProfileAccessPet;
  scroll?: boolean;
  showNfc?: boolean;
  tags?: PetTag[];
}) {
  const items = getAccessItems({
    orders,
    pet,
    showNfc,
    tags,
  });

  return (
    <div
      className={`${
        scroll
          ? "hide-scrollbar flex gap-2 overflow-x-auto"
          : "flex flex-wrap gap-2"
      } ${className}`}
    >
      {items.map((item) => (
        <Badge className="shrink-0" key={item.label} tone={item.tone}>
          {item.label}
        </Badge>
      ))}
    </div>
  );
}

export function ProfileAccessStatus({
  compact = false,
  orders,
  pet,
  tags,
}: {
  compact?: boolean;
  orders?: TagOrder[];
  pet?: ProfileAccessPet;
  tags?: PetTag[];
}) {
  const items = getAccessItems({ orders, pet, tags });
  const showActiveTagSummary = !pet || isActivePet(pet);

  return (
    <section className="brand-card rounded-[1.75rem] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-pet-ink">
            Safety Profile and Smart Tag
          </h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            {getAccessSummary(pet)}
            {showActiveTagSummary
              ? " Linked physical tags open this same Safety Profile."
              : ""}
          </p>
        </div>
        <ProfileAccessBadges
          className="sm:justify-end"
          orders={orders}
          pet={pet}
          tags={tags}
        />
      </div>

      {!compact ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {items.map((item) => (
            <div
              className="rounded-[1.25rem] bg-pet-cream p-4"
              key={item.label}
            >
              <div className="flex items-center gap-2 text-sm font-black text-pet-ink">
                <Icon name={item.icon} className="h-4 w-4 text-pet-teal" />
                {item.label}
              </div>
              <p className="mt-2 text-sm leading-6 text-pet-muted">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
