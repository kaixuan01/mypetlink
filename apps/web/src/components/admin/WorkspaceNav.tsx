"use client";

import Link from "next/link";

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
        className="hidden flex-wrap items-end gap-2 lg:flex"
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
              <p className="px-1.5 pb-1 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-400">
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

      <label className="grid gap-1 lg:hidden" data-testid="workspace-nav-mobile">
        <span className="text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-500">
          Workspace section
        </span>
        <select
          aria-label={label}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm outline-none focus:border-[#1570ef] focus:ring-2 focus:ring-[#1570ef]/20"
          onChange={(event) => onNavigate(event.target.value as Id)}
          value={activeId}
        >
          {visibleGroups.map((group) =>
            group.label ? (
              <optgroup key={group.id} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))
            )
          )}
        </select>
      </label>
    </>
  );
}
