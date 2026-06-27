import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { QrStatus } from "@/types";

type AccessItem = {
  label: string;
  description: string;
  icon: IconName;
  tone: "warm" | "mint" | "teal" | "soft" | "danger";
};

const accessItems: AccessItem[] = [
  {
    label: "NFC Ready",
    description: "MyPetLink QR + NFC smart tags open the same safe profile.",
    icon: "tag",
    tone: "warm",
  },
  {
    label: "GPS Coming Later",
    description: "Premium GPS safety features can be added later.",
    icon: "shield",
    tone: "teal",
  },
];

export function getQrStatusLabel(qrStatus: QrStatus = "active") {
  if (qrStatus === "active") {
    return "QR Active";
  }

  if (qrStatus === "draft") {
    return "QR Draft";
  }

  return "Private";
}

function getQrStatusDescription(qrStatus: QrStatus = "active") {
  if (qrStatus === "active") {
    return "Your pet profile can be opened by QR scan now.";
  }

  if (qrStatus === "draft") {
    return "Finish the profile details before sharing the QR pet profile.";
  }

  return "The public pet profile is private until you turn sharing back on.";
}

function getAccessItems(qrStatus: QrStatus = "active"): AccessItem[] {
  return [
    {
      label: getQrStatusLabel(qrStatus),
      description: getQrStatusDescription(qrStatus),
      icon: "qr",
      tone: qrStatus === "active" ? "mint" : "warm",
    },
    ...accessItems,
  ];
}

export function ProfileAccessBadges({
  className = "",
  qrStatus = "active",
  scroll = false,
}: {
  className?: string;
  qrStatus?: QrStatus;
  scroll?: boolean;
}) {
  return (
    <div
      className={`${
        scroll
          ? "hide-scrollbar flex gap-2 overflow-x-auto"
          : "flex flex-wrap gap-2"
      } ${className}`}
    >
      {getAccessItems(qrStatus).map((item) => (
        <Badge className="shrink-0" key={item.label} tone={item.tone}>
          {item.label}
        </Badge>
      ))}
    </div>
  );
}

export function ProfileAccessStatus({
  compact = false,
  qrStatus = "active",
}: {
  compact?: boolean;
  qrStatus?: QrStatus;
}) {
  const items = getAccessItems(qrStatus);

  return (
    <section className="brand-card rounded-[1.75rem] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-pet-ink">
            QR, NFC, and GPS safety
          </h2>
          <p className="mt-2 text-sm leading-6 text-pet-muted">
            Your pet profile can be opened by QR scan now. MyPetLink QR + NFC
            smart tags can open the same safe profile with a simple tap.
          </p>
        </div>
        <ProfileAccessBadges className="sm:justify-end" qrStatus={qrStatus} />
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
