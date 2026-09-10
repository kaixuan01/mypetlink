"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";

export type WorkspaceNavItem<Id extends string> = {
  id: Id;
  label: string;
  href: string;
  visible?: boolean;
};

export type WorkspaceNavGroup<Id extends string> = {
  id: string;
  label: string | null;
  items: WorkspaceNavItem<Id>[];
};

/** Removes capability-hidden items and empty groups, then flattens one survivor. */
export function visibleWorkspaceNavGroups<Id extends string>(
  groups: WorkspaceNavGroup<Id>[]
): WorkspaceNavGroup<Id>[] {
  const visible = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.visible !== false),
    }))
    .filter((group) => group.items.length > 0);

  return visible.length === 1 ? [{ ...visible[0], label: null }] : visible;
}

export function WorkspaceNav<Id extends string>({
  activeId,
  groups,
  label,
  onNavigate,
}: {
  activeId: Id;
  groups: WorkspaceNavGroup<Id>[];
  label: string;
  onNavigate: (id: Id) => void;
}) {
  const visibleGroups = visibleWorkspaceNavGroups(groups);

  return (
    <>
      <nav
        aria-label={label}
        className="hidden flex-wrap items-end gap-2 min-[900px]:flex"
        data-testid="workspace-nav-desktop"
      >
        {visibleGroups.map((group) => (
          <div
            className={
              group.label
                ? "rounded-xl bg-slate-100/80 px-2.5 py-2"
                : "flex items-center gap-1 rounded-xl bg-white p-1"
            }
            data-testid={`workspace-nav-group-${group.id}`}
            key={group.id}
          >
            {group.label ? (
              <p className="px-1.5 pb-1 text-[0.68rem] font-black uppercase tracking-wide text-slate-500">
                {group.label}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {group.items.map((item) => (
                <Link
                  aria-current={activeId === item.id ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition ${
                    activeId === item.id
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-white hover:text-slate-950"
                  }`}
                  data-testid={`workspace-nav-item-${item.id}`}
                  href={item.href}
                  key={item.id}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return;
                    }
                    event.preventDefault();
                    onNavigate(item.id);
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <MobileWorkspaceNav
        activeId={activeId}
        groups={visibleGroups}
        label={label}
        onNavigate={onNavigate}
      />
    </>
  );
}

function MobileWorkspaceNav<Id extends string>({
  activeId,
  groups,
  label,
  onNavigate,
}: {
  activeId: Id;
  groups: WorkspaceNavGroup<Id>[];
  label: string;
  onNavigate: (id: Id) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const activeItem = groups.flatMap((group) => group.items).find((item) => item.id === activeId);
  const dialogId = `${id}-workspace-navigation-dialog`;
  const dialogTitleId = `${id}-workspace-navigation-title`;

  useModalDialogFocus({
    dialogRef: panelRef,
    initialFocusRef: closeRef,
    onEscape: () => setOpen(false),
    enabled: open,
  });

  const navigate = (id: Id) => {
    setOpen(false);
    onNavigate(id);
  };

  return (
    <div className="min-[900px]:hidden" data-testid="workspace-nav-mobile">
      <button
        aria-label={`Browse ${label}. Current section: ${activeItem?.label ?? "Unknown"}`}
        aria-controls={dialogId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-white px-3.5 py-2 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1570ef]"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-[0.65rem] font-black uppercase tracking-wide text-slate-500">
            Workspace
          </span>
          <span className="block truncate text-sm font-black text-slate-950">
            {activeItem?.label ?? "Choose section"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-extrabold text-slate-600">
          Browse
          <Icon name="chevron" className="h-3.5 w-3.5" />
        </span>
      </button>

      {open ? (
        <div
          aria-labelledby={dialogTitleId}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end min-[900px]:hidden"
          id={dialogId}
          role="dialog"
        >
          <button
            aria-label="Close workspace navigation"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            className="relative max-h-[82dvh] w-full overflow-y-auto rounded-t-2xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl"
            ref={panelRef}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[0.68rem] font-black uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <h2 className="mt-0.5 text-lg font-black text-slate-950" id={dialogTitleId}>
                  Choose a workspace section
                </h2>
              </div>
              <button
                aria-label="Close workspace navigation"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1570ef]"
                onClick={() => setOpen(false)}
                ref={closeRef}
                type="button"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>

            <nav aria-label={label} className="mt-3 grid gap-3">
              {groups.map((group) => (
                <section
                  aria-labelledby={group.label ? `${id}-workspace-group-${group.id}` : undefined}
                  key={group.id}
                >
                  {group.label ? (
                    <h3
                      className="px-2 pb-1 text-[0.68rem] font-black uppercase tracking-wide text-slate-500"
                      id={`${id}-workspace-group-${group.id}`}
                    >
                      {group.label}
                    </h3>
                  ) : null}
                  <div className="grid gap-1 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const active = item.id === activeId;
                      return (
                        <Link
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-11 items-center justify-between rounded-xl px-3 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1570ef] ${
                            active
                              ? "bg-slate-950 text-white"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                          href={item.href}
                          key={item.id}
                          onClick={(event) => {
                            if (
                              event.button !== 0 ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey
                            ) {
                              return;
                            }
                            event.preventDefault();
                            navigate(item.id);
                          }}
                        >
                          <span>{item.label}</span>
                          {active ? <span className="text-xs font-bold text-slate-300">Current</span> : null}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
