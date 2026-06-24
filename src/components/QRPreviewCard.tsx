import { Badge } from "@/components/ui/Badge";
import { CTAButton } from "@/components/ui/CTAButton";
import { Icon } from "@/components/ui/Icon";
import { PetAvatar } from "@/components/ui/PetAvatar";
import type { Pet } from "@/types";

const qrCells = [
  1, 1, 1, 0, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 0, 1, 1, 0, 1,
  1, 1, 1, 1, 0, 1, 1, 1, 1,
  0, 0, 1, 0, 1, 1, 0, 1, 0,
  1, 0, 0, 1, 1, 0, 1, 0, 1,
  0, 1, 1, 0, 0, 1, 0, 1, 1,
  1, 1, 1, 1, 0, 1, 1, 0, 1,
  1, 0, 1, 0, 1, 0, 0, 1, 0,
  1, 1, 1, 0, 1, 1, 1, 0, 1,
];

type QRPreviewCardProps = {
  pet?: Pet;
  compact?: boolean;
};

const fallbackPet: Pick<Pet, "name" | "species" | "photoInitial" | "photoTone"> = {
  name: "Milo",
  species: "Dog",
  photoInitial: "M",
  photoTone: "apricot",
};

export function QRPreviewCard({ pet, compact }: QRPreviewCardProps) {
  const displayPet = pet ?? fallbackPet;

  return (
    <div className="brand-card rounded-[2rem] p-5">
      <div className="brand-paw-dots rounded-[1.5rem] bg-pet-cream p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="warm">MyPetLink QR Tag</Badge>
            <h2 className="mt-3 text-2xl font-black text-pet-ink">
              {displayPet.name}
            </h2>
            <p className="mt-1 text-sm text-pet-muted">
              QR safety profile preview
            </p>
          </div>
          <PetAvatar pet={displayPet} size="sm" />
        </div>
        <div
          className={`mt-6 grid gap-6 ${
            compact ? "" : "sm:grid-cols-[170px_1fr] sm:items-center"
          }`}
        >
          <div className="grid aspect-square grid-cols-9 gap-1 rounded-[1.25rem] bg-white p-4 shadow-inner ring-4 ring-[#e8f3ff]">
            {qrCells.map((cell, index) => (
              <span
                key={`${cell}-${index}`}
                className={
                  cell
                    ? "rounded-[0.2rem] bg-pet-teal"
                    : "rounded-sm bg-transparent"
                }
              />
            ))}
          </div>
          <div>
            <p className="text-sm leading-6 text-pet-muted">
              A finder can scan the tag, view important safety notes, and
              contact you quickly.
            </p>
            <div className="mt-5 grid gap-2 text-sm">
              {[
                ["phone", "WhatsApp Owner"],
                ["phone", "Call Owner"],
                ["pin", "Send Found Location"],
              ].map(([icon, label]) => (
                <div
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-3 font-bold text-pet-ink shadow-sm"
                  key={label}
                >
                  <Icon name={icon as "phone" | "pin"} className="h-4 w-4" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {!compact ? (
        <CTAButton
          href={pet?.finderProfileUrl ?? "/t/8KX29A"}
          icon="qr"
          variant="secondary"
          fullWidth
          className="mt-4"
        >
          View QR Profile
        </CTAButton>
      ) : null}
    </div>
  );
}
