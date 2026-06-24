"use client";

import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Icon } from "@/components/ui/Icon";
import { loginMockOwner } from "@/services/authService";

export function LoginPanel() {
  const router = useRouter();

  function handleLogin() {
    loginMockOwner();
    router.replace("/dashboard");
  }

  return (
    <div className="brand-card rounded-[2rem] p-6">
      <BrandLogo markOnly className="h-16 w-16" />
      <h1 className="mt-5 text-3xl font-black text-pet-ink">
        Welcome back
      </h1>
      <p className="mt-3 text-sm leading-6 text-pet-muted">
        Sign in to manage your pet profiles.
      </p>
      <div className="mt-6 grid gap-3">
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-teal bg-pet-teal px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#1570ef]/20 transition hover:bg-[#0f5fd0]"
          onClick={handleLogin}
          type="button"
        >
          <Icon name="shield" className="h-4 w-4" />
          Continue with Google
        </button>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155]"
          onClick={handleLogin}
          type="button"
        >
          <Icon name="paw" className="h-4 w-4" />
          Try Demo Account
        </button>
      </div>
      <p className="mt-5 rounded-2xl bg-pet-cream p-4 text-xs leading-5 text-pet-muted">
        Explore a sample owner workspace with pet profiles, records, memories,
        and smart tags.
      </p>
    </div>
  );
}
