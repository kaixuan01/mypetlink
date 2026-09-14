"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/**
 * Shown when an operator reaches a page their permissions do not cover.
 *
 * Deliberately plain: it explains what to do next rather than hinting at what
 * the page would have contained, and it never suggests the restriction is a
 * fault the operator can work around.
 */
export function AdminNoAccessNotice({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="mx-auto grid max-w-xl gap-4 rounded-2xl border border-[#e3dccd] bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pet-cream">
        <Icon name="shield" className="h-6 w-6 text-pet-ink" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-black text-pet-ink">{title}</h1>
      <p className="text-sm text-[#5b6478]">
        {description
          ?? "You do not have permission to open this page. Ask an administrator who manages access if you need it."}
      </p>
      <Link
        className="mx-auto rounded-full bg-pet-ink px-5 py-2 text-sm font-bold text-white"
        href="/admin"
      >
        Back to Overview
      </Link>
    </section>
  );
}
