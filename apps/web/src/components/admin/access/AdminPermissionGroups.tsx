"use client";

import type { AdminCapabilityModule } from "@/services/adminAccessService";

/**
 * Permissions grouped by the part of the business they cover.
 *
 * Grouping is the point: a flat list of eighty switches tells an administrator
 * nothing about what they are actually handing over.
 */
export function AdminPermissionGroups({
  modules,
  emptyMessage = "No permissions.",
}: {
  modules: AdminCapabilityModule[];
  emptyMessage?: string;
}) {
  if (modules.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="grid gap-4 p-5">
      {modules.map((module) => (
        <section key={module.key} className="min-w-0 rounded-xl bg-slate-50 p-4">
          <h3 className="text-sm font-black text-slate-900">{module.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{module.description}</p>
          <ul className="mt-3 grid gap-2">
            {module.capabilities.map((capability) => (
              <li key={capability.key} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    capability.isSensitive
                      ? "bg-[#a63c2e]"
                      : capability.isWriteAccess
                        ? "bg-slate-900"
                        : "bg-slate-400"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900">
                    {capability.name}
                    {capability.isSensitive ? (
                      <span className="ml-2 rounded-full bg-[#fff2ef] px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-[#a63c2e]">
                        High impact
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-slate-500">{capability.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The same grouping, as a picker. Used when building or editing a role.
 *
 * `lockedKeys` are permissions the signed-in administrator does not hold
 * themselves, so they cannot hand them out — the API refuses it too, and
 * showing them as unavailable is clearer than letting the save fail.
 */
export function AdminPermissionPicker({
  modules,
  selected,
  lockedKeys,
  onToggle,
  onToggleModule,
  disabled = false,
}: {
  modules: AdminCapabilityModule[];
  selected: ReadonlySet<string>;
  lockedKeys: ReadonlySet<string>;
  onToggle: (key: string, next: boolean) => void;
  onToggleModule: (keys: string[], next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4">
      {modules.map((module) => {
        const selectable = module.capabilities
          .filter((capability) => !lockedKeys.has(capability.key))
          .map((capability) => capability.key);
        const allSelected =
          selectable.length > 0 && selectable.every((key) => selected.has(key));

        return (
          <section key={module.key} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-900">{module.name}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{module.description}</p>
              </div>
              {selectable.length > 0 ? (
                <button
                  className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => onToggleModule(selectable, !allSelected)}
                  type="button"
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              ) : null}
            </div>

            <ul className="mt-3 grid gap-2">
              {module.capabilities.map((capability) => {
                const locked = lockedKeys.has(capability.key);
                return (
                  <li key={capability.key}>
                    <label
                      className={`flex items-start gap-3 rounded-lg px-2 py-2 ${
                        locked ? "opacity-60" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        checked={selected.has(capability.key)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                        disabled={disabled || locked}
                        onChange={(event) => onToggle(capability.key, event.target.checked)}
                        type="checkbox"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900">
                          {capability.name}
                          {capability.isSensitive ? (
                            <span className="ml-2 rounded-full bg-[#fff2ef] px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-[#a63c2e]">
                              High impact
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {capability.description}
                        </span>
                        {locked ? (
                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            You cannot grant this because you do not have it yourself.
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
