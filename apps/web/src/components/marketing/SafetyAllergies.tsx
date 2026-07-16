import { Icon } from "@/components/ui/Icon";

type SafetyAllergiesProps = {
  allergies: string[];
  variant?: "safety" | "public";
};

export function SafetyAllergies({
  allergies,
  variant = "safety",
}: SafetyAllergiesProps) {
  const normalized = allergies
    .map((allergy) => allergy.trim())
    .filter(Boolean)
    .filter(
      (allergy, index, values) =>
        values.findIndex(
          (value) => value.toLocaleLowerCase() === allergy.toLocaleLowerCase()
        ) === index
    );

  if (!normalized.length) {
    return null;
  }

  return (
    <section
      aria-label="Known allergies"
      className={
        variant === "safety"
          ? "rounded-[1.5rem] border-2 border-[#e98a78] bg-[#fff1ee] p-4"
          : "rounded-[1.25rem] border border-[#e9aa9e] bg-[#fff7f5] p-4"
      }
    >
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#8f2f24]">
        <Icon name="shield" className="h-4 w-4 shrink-0" />
        Known allergies
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Allergy list">
        {normalized.map((allergy) => (
          <li
            className="max-w-full break-words rounded-full bg-white px-3 py-2 text-sm font-black leading-5 text-pet-ink shadow-sm [overflow-wrap:anywhere]"
            key={allergy.toLocaleLowerCase()}
          >
            {allergy}
          </li>
        ))}
      </ul>
    </section>
  );
}
