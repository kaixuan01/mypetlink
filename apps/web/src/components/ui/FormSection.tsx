import type { ReactNode } from "react";

type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="brand-card min-w-0 rounded-[1.75rem] p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-black text-pet-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-pet-muted">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
