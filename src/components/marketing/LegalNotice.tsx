import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";

export type LegalQuickLink = {
  id: string;
  title: string;
};

type LegalHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  lastUpdated: string;
  links: LegalQuickLink[];
  children?: ReactNode;
};

type LegalSectionProps = {
  id: string;
  number: number;
  title: string;
  children: ReactNode;
};

type LegalBulletListProps = {
  items: ReactNode[];
  icon?: IconName;
};

export function LegalHero({
  eyebrow,
  title,
  description,
  lastUpdated,
  links,
  children,
}: LegalHeroProps) {
  return (
    <section className="brand-peach-section px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          action={<Badge tone="mint">Last updated: {lastUpdated}</Badge>}
        />
        {children ? (
          <div className="brand-card rounded-[1.5rem] p-5 text-sm leading-6 text-pet-muted sm:p-6 sm:text-base sm:leading-7">
            {children}
          </div>
        ) : null}
        <LegalQuickLinks links={links} />
      </div>
    </section>
  );
}

export function LegalQuickLinks({ links }: { links: LegalQuickLink[] }) {
  return (
    <nav
      aria-label="Page sections"
      className="mt-5 rounded-[1.5rem] border border-pet-border bg-white/80 p-4 shadow-sm sm:p-5"
    >
      <p className="text-xs font-black uppercase text-pet-teal">
        Quick links
      </p>
      <div className="mt-3 flex flex-wrap gap-2 sm:gap-2.5">
        {links.map((link) => (
          <a
            className="inline-flex min-h-10 items-center rounded-full bg-pet-cream px-3.5 py-2 text-sm font-bold leading-5 text-pet-ink transition hover:bg-pet-apricot hover:text-pet-teal focus:outline-none focus:ring-4 focus:ring-pet-teal/15"
            href={`#${link.id}`}
            key={link.id}
          >
            {link.title}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function LegalSection({
  id,
  number,
  title,
  children,
}: LegalSectionProps) {
  return (
    <article
      className="brand-card scroll-mt-28 rounded-[1.5rem] p-5 sm:p-6"
      id={id}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#e8f3ff] text-sm font-black text-pet-teal">
          {number}
        </span>
        <h2 className="text-xl font-black leading-tight text-pet-ink sm:text-2xl">
          {title}
        </h2>
      </div>
      <div className="mt-4 space-y-4 text-sm leading-6 text-pet-muted sm:text-base sm:leading-7">
        {children}
      </div>
    </article>
  );
}

export function LegalBulletList({ items, icon = "paw" }: LegalBulletListProps) {
  return (
    <ul className="grid gap-3">
      {items.map((item, index) => (
        <li className="flex gap-2" key={index}>
          <Icon
            name={icon}
            className="mt-1 h-4 w-4 shrink-0 text-pet-coral"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
