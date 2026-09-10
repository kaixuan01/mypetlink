import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  compactOnMobile?: boolean;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  compactOnMobile = false,
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col md:flex-row md:items-end md:justify-between ${
        compactOnMobile
          ? "mb-4 gap-3 sm:mb-8 sm:gap-5"
          : "mb-6 gap-4 sm:mb-8 sm:gap-5"
      }`}
    >
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-xs font-extrabold uppercase text-pet-teal sm:text-sm">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={`${compactOnMobile ? "mt-0.5" : "mt-1"} text-2xl font-black leading-tight text-pet-ink sm:mt-2 sm:text-4xl`}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={`${compactOnMobile ? "mt-1.5 leading-5" : "mt-2 leading-6"} text-sm text-pet-muted sm:mt-3 sm:text-base sm:leading-7`}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
