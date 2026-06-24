import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

type AdminTableShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AdminTableShell({
  title,
  description,
  children,
}: AdminTableShellProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                className="min-h-11 rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-slate-400"
                placeholder="Search"
                type="search"
              />
            </label>
            <select className="min-h-11 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600 outline-none">
              <option>All statuses</option>
              <option>Active</option>
              <option>Draft</option>
              <option>Paused</option>
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
