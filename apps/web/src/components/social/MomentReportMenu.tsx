"use client";

import { useRef, useState } from "react";
import { CommunityReportDialog } from "@/components/social/CommunityReportDialog";
import { Icon } from "@/components/ui/Icon";
import { useDismissableMenu } from "@/lib/useDismissableMenu";
import type { PublicMomentListItem } from "@/services/publicSocialService";

export function MomentReportMenu({ moment, signedIn, ownHandle }: {
  moment: PublicMomentListItem;
  signedIn: boolean | null;
  ownHandle: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useDismissableMenu({ open, onClose: (returnFocus) => { setOpen(false); if (returnFocus) triggerRef.current?.focus(); }, menuRef, triggerRef });

  if (!signedIn || ownHandle === undefined || ownHandle === null || !moment.author || ownHandle.toLowerCase() === moment.author.handle.toLowerCase()) return null;

  return <>
    <div className="relative">
      <button aria-expanded={open} aria-haspopup="menu" aria-label="Moment actions" className="grid h-11 w-11 place-items-center rounded-full text-pet-muted hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-pet-teal" onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button"><Icon className="h-5 w-5" name="more" /></button>
      {open ? <div className="absolute right-0 z-20 min-w-40 rounded-xl border border-pet-border bg-white p-1 shadow-lg" ref={menuRef} role="menu">
        <button className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-black text-pet-ink hover:bg-pet-cream" onClick={() => { setOpen(false); setReporting(true); }} role="menuitem" type="button">Report Moment</button>
      </div> : null}
    </div>
    {reporting ? <CommunityReportDialog onClose={() => { setReporting(false); requestAnimationFrame(() => triggerRef.current?.focus()); }} open report={{ type: "moment", target: moment.id, household: moment.author }} /> : null}
  </>;
}
