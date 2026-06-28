import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { PetTag, QrStatus } from "@/types";

type AccessItem = {
  label: string;
  description: string;
  icon: IconName;
  tone: "warm" | "mint" | "teal" | "soft" | "danger";
};

const pendingTagStatuses = ["Pending", "Preparing", "Delivered"];

export function getQrStatusLabel(
  qrStatus: QrStatus = "active",
  finderProfileUrl?: string
) {
  if (finderProfileUrl !== undefined && !finderProfileUrl.trim()) {
    return "QR Not Set Up";
  }

  if (qrStatus === "active") {
    return "QR Active";
  }

  if (qrStatus === "draft") {
    return "QR Draft";
  }

  return "QR Not Set Up";
}

export function getQrStatusBadge(
  qrStatus: QrStatus = "active",
  finderProfileUrl?: string
): AccessItem {
  const label = getQrStatusLabel(qrStatus, finderProfileUrl);

  if (label === "QR Active") {
    return {
      label,
      description: "This pet's QR safety page is ready for finder scans.",
      icon: "qr",
      tone: "mint",
    };
  }

  if (label === "QR Draft") {
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

export function getSmartTagStatusBadge(tags: PetTag[] = []): AccessItem {
  const linkedTags = tags.filter((tag) => tag.petId && !tag.isArchived);
  const hasActiveTag = linkedTags.some((tag) => tag.status === "Active");
  const hasPendingReplacement = linkedTags.some(
    (tag) =>
      tag.replacementForTagId &&
      pendingTagStatuses.includes(tag.status)
  );
  const hasPendingTag = linkedTags.some((tag) =>
    pendingTagStatuses.includes(tag.status)
  );
  const hasLostTag = linkedTags.some((tag) => tag.status === "Lost");
  const hasDisabledTag = linkedTags.some((tag) => tag.status === "Disabled");

  if (hasActiveTag) {
    return {
      label: "Smart Tag Active",
      description: "A physical MyPetLink tag is active for this pet.",
      icon: "tag",
      tone: "mint",
    };
  }

  if (hasPendingReplacement) {
    return {
      label: "Replacement ordered",
      description: "A replacement tag order is in progress for this pet.",
      icon: "tag",
      tone: "warm",
    };
  }

  if (hasPendingTag) {
    return {
      label: "Smart Tag Pending",
      description: "A physical tag has been ordered or delivered but is not active yet.",
      icon: "tag",
      tone: "warm",
    };
  }

  if (hasLostTag) {
    return {
      label: "Tag Lost",
      description: "The linked tag has been reported lost.",
      icon: "tag",
      tone: "danger",
    };
  }

  if (hasDisabledTag) {
    return {
      label: "Tag Disabled",
      description: "The linked tag is disabled.",
      icon: "tag",
      tone: "soft",
    };
  }

  return {
    label: "No smart tag yet",
    description: "No physical MyPetLink tag is active for this pet yet.",
    icon: "tag",
    tone: "soft",
  };
}

export function getNfcStatusBadge(tags: PetTag[] = []): AccessItem | null {
  const nfcTags = tags.filter((tag) => tag.petId && tag.hasNfc && !tag.isArchived);
  const hasActiveNfc = nfcTags.some((tag) => tag.status === "Active");
  const hasPendingNfc = nfcTags.some((tag) =>
    pendingTagStatuses.includes(tag.status)
  );

  if (hasActiveNfc) {
    return {
      label: "NFC Active",
      description: "A QR + NFC smart tag is active for this pet.",
      icon: "tag",
      tone: "mint",
    };
  }

  if (hasPendingNfc) {
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
  qrStatus = "active",
  showNfc = true,
  tags,
}: {
  finderProfileUrl?: string;
  qrStatus?: QrStatus;
  showNfc?: boolean;
  tags?: PetTag[];
}): AccessItem[] {
  const items = [getQrStatusBadge(qrStatus, finderProfileUrl)];

  if (tags) {
    items.push(getSmartTagStatusBadge(tags));
  }

  const nfcBadge = showNfc && tags ? getNfcStatusBadge(tags) : null;

  if (nfcBadge) {
    items.push(nfcBadge);
  }

  return items;
}

function getAccessSummary(qrStatus: QrStatus = "active") {
  if (qrStatus === "active") {
    return "Your pet profile can be opened by QR scan now.";
  }

  if (qrStatus === "draft") {
    return "Finish the profile details before sharing the QR pet profile.";
  }

  return "Create a QR safety page before printing or sharing a pet tag.";
}

export function ProfileAccessBadges({
  className = "",
  finderProfileUrl,
  qrStatus = "active",
  scroll = false,
  showNfc = true,
  tags,
}: {
  className?: string;
  finderProfileUrl?: string;
  qrStatus?: QrStatus;
  scroll?: boolean;
  showNfc?: boolean;
  tags?: PetTag[];
}) {
  const items = getAccessItems({ finderProfileUrl, qrStatus, showNfc, tags });

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
  qrStatus = "active",
  tags,
}: {
  compact?: boolean;
  finderProfileUrl?: string;
  qrStatus?: QrStatus;
  tags?: PetTag[];
}) {
  const items = getAccessItems({ finderProfileUrl, qrStatus, tags });

  return (
    <section className="brand-card rounded-[1.75rem] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-pet-ink">
            QR and smart tag safety
          </h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            {getAccessSummary(qrStatus)} Physical tag badges are based on this
            pet&apos;s linked tag records.
          </p>
        </div>
        <ProfileAccessBadges
          className="sm:justify-end"
          finderProfileUrl={finderProfileUrl}
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
