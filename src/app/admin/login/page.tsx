import type { Metadata } from "next";
import Link from "next/link";
import { AdminLoginPanel } from "@/components/auth/AdminLoginPanel";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Admin Login",
};

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8f9] px-4 py-10">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-950"
            href="/"
          >
            <Icon name="home" className="h-4 w-4" />
            Back to public site
          </Link>
          <h1 className="mt-6 text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
            Admin Sign In
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-500">
            Manage users, pet profiles, smart tags, QR profiles, and plans from
            the MyPetLink admin workspace.
          </p>
        </div>
        <AdminLoginPanel />
      </div>
    </main>
  );
}
