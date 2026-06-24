import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-sm font-extrabold uppercase text-pet-teal">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-black leading-tight text-pet-ink sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 text-base leading-7 text-pet-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
