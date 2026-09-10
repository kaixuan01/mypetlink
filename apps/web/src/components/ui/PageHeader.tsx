import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  compactOnMobile?: boolean;
  /**
   * Heading level for the title. Defaults to the page title, which is correct
   * when a route renders one of these at the top. A page that uses this to
   * introduce several sections must pass "h2" so the document keeps a single
   * H1 and a readable outline.
   */
  as?: "h1" | "h2";
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  compactOnMobile = false,
  as: Heading = "h1",
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
        <Heading
          className={`${compactOnMobile ? "mt-0.5" : "mt-1"} text-2xl font-black leading-tight text-pet-ink sm:mt-2 sm:text-4xl`}
        >
          {title}
        </Heading>
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
