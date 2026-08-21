import { getMalaysiaCalendarDateParts } from "@/lib/careRecordStatus";
import { parsePetBirthday } from "@/lib/petAge";
import type { Pet, PublicPetProfile } from "@/types";

export type PetShareCardVariant = "profile" | "birthday";

export type PetOccasion = {
  variant: Exclude<PetShareCardVariant, "profile">;
  count: number;
  label: string;
};

type OccasionPet = Pick<
  Pet | PublicPetProfile,
  "birthday" | "lifecycleStatus"
>;

export function derivePetOccasions(
  pet: OccasionPet,
  now: Date = new Date()
): PetOccasion[] {
  if (pet.lifecycleStatus !== "Active") return [];

  const today = getMalaysiaCalendarDateParts(now);
  const occasions: PetOccasion[] = [];
  const birthdayAge = anniversaryCount(pet.birthday, today);
  if (birthdayAge !== null) {
    occasions.push({ variant: "birthday", count: birthdayAge, label: "Birthday" });
  }

  return occasions;
}

function anniversaryCount(
  value: string | null | undefined,
  today: { year: number; month: number; day: number }
) {
  const date = parsePetBirthday(value);
  if (
    !date ||
    date.year > today.year ||
    date.month !== today.month ||
    date.day !== today.day
  ) {
    return null;
  }
  return today.year - date.year;
}
