import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  isActivePet,
  isArchivedPet,
  isMemorialPet,
  type PetLifecycleLike,
} from "@/lib/petLifecycle";
import {
  getPetNfcTagStatus,
  getPetSmartTagStatus,
} from "@/lib/tagStatus";
import type { PetTag, QrStatus, TagOrder } from "@/types";

type AccessItem = {
  label: string;
  description: string;
  icon: IconName;
  tone: "warm" | "mint" | "teal" | "soft" | "danger";
};

type ProfileAccessPet = PetLifecycleLike & {
  id?: string;
  name?: string;
};

export function getQrStatusLabel(
  qrStatus: QrStatus = "active",
  finderProfileUrl?: string,
  pet?: ProfileAccessPet
) {
  if (isMemorialPet(pet)) {
    return "Memorial Profile";
  }

  if (isArchivedPet(pet)) {
    return "Archived Profile";
  }

  if (finderProfileUrl !== undefined && !finderProfileUrl.trim()) {
    return "QR Not Set Up";
  }

  if (qrStatus === "active") {
    return "QR Safety Active";
  }

  if (qrStatus === "draft") {
    return "QR Safety Draft";
  }

  return "QR Not Set Up";
}

export function getQrStatusBadge(
  qrStatus: QrStatus = "active",
  finderProfileUrl?: string,
  pet?: ProfileAccessPet
): AccessItem {
  const label = getQrStatusLabel(qrStatus, finderProfileUrl, pet);

  if (label === "Memorial Profile") {
    return {
      label,
      description: "QR Safety contact actions are turned off for this memorial.",
      icon: "heart",
      tone: "soft",
    };
  }

  if (label === "Archived Profile") {
    return {
      label,
      description: "Restore this profile to use finder contact actions again.",
      icon: "record",
      tone: "soft",
    };
  }

  if (label === "QR Safety Active") {
    return {
      label,
      description: "This pet's QR safety page is ready for finder scans.",
      icon: "qr",
      tone: "mint",
    };
  }

  if (label === "QR Safety Draft") {
    return {
      label,
      description: "Finish the safety details before relying on this QR page.",
      icon: "qr",
      tone: "warm",
    };
  }

  return {
    label,
    description: "Create a QR safety page before sharing or printing a tag.",
    icon: "qr",
    tone: "soft",
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
      label: "Smart Tag Active",
      description: "A physical MyPetLink tag is active for this pet.",
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
    label: "No Active Smart Tag",
    description: "No physical MyPetLink tag is active for this pet yet.",
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
  finderProfileUrl,
  orders,
  pet,
  qrStatus = "active",
  showNfc = true,
  tags,
}: {
  finderProfileUrl?: string;
  qrStatus?: QrStatus;
  showNfc?: boolean;
  pet?: ProfileAccessPet;
  orders?: TagOrder[];
  tags?: PetTag[];
}): AccessItem[] {
  const items = [getQrStatusBadge(qrStatus, finderProfileUrl, pet)];

  if (tags) {
    items.push(getSmartTagStatusBadge(tags, orders, pet));
  }

  const nfcBadge = showNfc && tags ? getNfcStatusBadge(tags, orders, pet) : null;

  if (nfcBadge) {
    items.push(nfcBadge);
  }

  return items;
}

function getAccessSummary(qrStatus: QrStatus = "active", pet?: ProfileAccessPet) {
  if (isMemorialPet(pet)) {
    return "This memorial profile keeps memories available while finder contact actions stay off.";
  }

  if (isArchivedPet(pet)) {
    return "This archived profile is saved for history while finder contact actions stay off.";
  }

  if (qrStatus === "active") {
    return "Your pet's QR Safety Page is ready for finders.";
  }

  if (qrStatus === "draft") {
    return "Finish the safety details before sharing the QR Safety Page.";
  }

  return "Create a QR Safety Page before printing or sharing a pet tag.";
}

export function ProfileAccessBadges({
  className = "",
  finderProfileUrl,
  qrStatus = "active",
  orders,
  pet,
  scroll = false,
  showNfc = true,
  tags,
}: {
  className?: string;
  finderProfileUrl?: string;
  orders?: TagOrder[];
  pet?: ProfileAccessPet;
  qrStatus?: QrStatus;
  scroll?: boolean;
  showNfc?: boolean;
  tags?: PetTag[];
}) {
  const items = getAccessItems({
    finderProfileUrl,
    orders,
    pet,
    qrStatus,
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
  finderProfileUrl,
  orders,
  pet,
  qrStatus = "active",
  tags,
}: {
  compact?: boolean;
  finderProfileUrl?: string;
  orders?: TagOrder[];
  pet?: ProfileAccessPet;
  qrStatus?: QrStatus;
  tags?: PetTag[];
}) {
  const items = getAccessItems({ finderProfileUrl, orders, pet, qrStatus, tags });
  const showActiveTagSummary = !pet || isActivePet(pet);

  return (
    <section className="brand-card rounded-[1.75rem] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-pet-ink">
            QR and smart tag safety
          </h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            {getAccessSummary(qrStatus, pet)}
            {showActiveTagSummary
              ? " Active physical tags open this same safety page."
              : ""}
          </p>
        </div>
        <ProfileAccessBadges
          className="sm:justify-end"
          finderProfileUrl={finderProfileUrl}
          orders={orders}
          pet={pet}
          qrStatus={qrStatus}
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
