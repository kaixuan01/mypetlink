"use client";

import { useEffect, useState } from "react";
import { CarePlanner } from "@/components/portal/care/CarePlanner";
import { GenericPetSection } from "@/components/portal/GenericPetSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

type CareView = "upcoming" | "all";

const tabs = [
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All records" },
];

/**
 * Care: the planner of pending care dates across the owner's pets
 * (Upcoming, the default) and the per-pet care history (All records). The
 * view and pet filter live in the address, so Back and shared links keep
 * them; nothing switches the view on the owner's behalf.
 */
export function CareHome() {
  const [view, setView] = useState<CareView | null>(null);
  const [initialPetId, setInitialPetId] = useState<string | undefined>();

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    queueMicrotask(() => {
      setInitialPetId(params.get("pet") ?? undefined);
      setView(params.get("view") === "all" ? "all" : "upcoming");
    });
  }, []);

  function choose(next: string) {
    const nextView: CareView = next === "all" ? "all" : "upcoming";
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.delete("pet");
    if (nextView === "all") url.searchParams.set("view", "all");
    else url.searchParams.delete("view");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  useEffect(() => {
    function restore() {
      const params = new URL(window.location.href).searchParams;
      setView(params.get("view") === "all" ? "all" : "upcoming");
      setInitialPetId(params.get("pet") ?? undefined);
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  return (
    <div className="grid gap-4" data-care-home>
      {view === "upcoming" ? (
        <PageHeader
          description="Every care date that's waiting, across your pets. Mark one as done when it's taken care of."
          eyebrow="Care"
          title="Care planner"
        />
      ) : null}
      <SegmentedTabs
        activeId={view ?? "upcoming"}
        ariaLabel="Care"
        onChange={choose}
        sticky={false}
        tabs={tabs}
      />
      {view === "upcoming" ? <CarePlanner initialPetId={initialPetId} key={initialPetId ?? "all"} /> : null}
      {view === "all" ? <GenericPetSection section="records" /> : null}
    </div>
  );
}
