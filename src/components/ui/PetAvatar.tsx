import type { Pet, PublicPetProfile } from "@/types";

type PetAvatarProps = {
  pet: Pick<Pet | PublicPetProfile, "photoInitial" | "photoTone" | "species">;
  size?: "sm" | "md" | "lg" | "xl";
};

const sizes = {
  sm: "h-12 w-12 text-lg",
  md: "h-16 w-16 text-2xl",
  lg: "h-24 w-24 text-4xl",
  xl: "h-36 w-36 text-6xl",
};

const tones = {
  apricot: "bg-pet-apricot text-pet-coral",
  mint: "bg-[#ddf4e7] text-pet-sage",
  sky: "bg-[#e8f3ff] text-pet-teal",
};

export function PetAvatar({ pet, size = "md" }: PetAvatarProps) {
  const earClass =
    pet.species === "Cat"
      ? "before:-top-3 before:left-3 before:rotate-[-18deg] after:-top-3 after:right-3 after:rotate-[18deg]"
      : "before:top-3 before:-left-3 before:rotate-[18deg] after:top-3 after:-right-3 after:rotate-[-18deg]";

  return (
    <div
      className={[
        "relative grid shrink-0 place-items-center rounded-[2rem] border-4 border-white font-black shadow-lg shadow-[#0d1b3d]/10",
        "before:absolute before:h-8 before:w-8 before:rounded-full before:bg-current before:opacity-20 after:absolute after:h-8 after:w-8 after:rounded-full after:bg-current after:opacity-20",
        sizes[size],
        tones[pet.photoTone],
        earClass,
      ].join(" ")}
    >
      <span className="relative z-10">{pet.photoInitial}</span>
    </div>
  );
}
