"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { loginMockOwner } from "@/services/authService";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.04 12.26c0-.82-.07-1.6-.21-2.36H12v4.46h6.19a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.43-4.96 3.43-8.47Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.76v2.98A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6V7.12H1.76a12 12 0 0 0 0 10.76L5.6 14.7Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.68 0 3.2.58 4.39 1.72l3.29-3.29C17.7 1.2 15.1 0 12 0A11.99 11.99 0 0 0 1.76 7.12L5.6 10.1C6.5 7.39 9.02 4.77 12 4.77Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.1em"
      height="1.1em"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.36 12.78c-.02-2.18 1.78-3.23 1.86-3.28-1.01-1.48-2.59-1.69-3.15-1.71-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.85-.75-1.46.02-2.82.85-3.57 2.16-1.53 2.65-.39 6.56 1.09 8.71.72 1.05 1.58 2.23 2.71 2.19 1.09-.04 1.5-.7 2.81-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-1.07 2.62-2.13.83-1.22 1.17-2.4 1.19-2.46-.03-.01-2.28-.88-2.3-3.44ZM14.2 6.06c.6-.73 1-1.74.89-2.75-.86.03-1.91.57-2.53 1.3-.55.64-1.04 1.67-.91 2.65.96.08 1.94-.49 2.55-1.2Z" />
    </svg>
  );
}

export function LoginPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  function handleProviderLogin() {
    loginMockOwner();
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") ?? params.get("next");
    const destination =
      redirect && redirect.startsWith("/") && !redirect.startsWith("//")
        ? redirect
        : "/dashboard";

    router.replace(destination);
  }

  function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) {
      return;
    }

    // Phase 1 will send a real magic link / OTP here. For now we confirm the
    // request in the UI without contacting a backend.
    setSentTo(trimmed);
  }

  if (sentTo) {
    return (
      <div className="brand-card rounded-[2rem] p-6 sm:p-8">
        <BrandLogo markOnly className="h-14 w-14" />
        <h1 className="mt-5 text-2xl font-black text-pet-ink sm:text-3xl">
          Check your inbox
        </h1>
        <p className="mt-3 text-sm leading-6 text-pet-muted">
          We sent a secure login link to{" "}
          <span className="font-bold text-pet-ink">{sentTo}</span>. Open it on
          this device to finish signing in.
        </p>
        <p className="mt-5 rounded-2xl bg-pet-cream p-4 text-xs leading-5 text-pet-muted">
          Didn&apos;t get it? Check your spam folder, or try a different email.
        </p>
        <button
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink transition hover:bg-pet-cream"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          type="button"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="brand-card rounded-[2rem] p-6 sm:p-8">
      <BrandLogo className="h-9 w-auto" />
      <h1 className="mt-6 text-2xl font-black text-pet-ink sm:text-3xl">
        Welcome to MyPetLink
      </h1>
      <p className="mt-3 text-sm leading-6 text-pet-muted">
        Sign in to manage your pet profiles, safety contacts, and QR pages.
      </p>

      <div className="mt-6 grid gap-3">
        <button
          className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink shadow-sm transition hover:bg-pet-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
          onClick={handleProviderLogin}
          type="button"
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-pet-ink bg-pet-ink px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#16264d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-ink"
          onClick={handleProviderLogin}
          type="button"
        >
          <AppleMark />
          Continue with Apple
        </button>
      </div>

      <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-pet-muted">
        <span className="h-px flex-1 bg-pet-border" />
        or
        <span className="h-px flex-1 bg-pet-border" />
      </div>

      <form className="grid gap-3" onSubmit={handleEmailSubmit}>
        <label className="grid gap-2 text-sm font-bold text-pet-ink">
          Email address
          <input
            autoComplete="email"
            className="min-h-12 rounded-2xl border border-pet-border bg-white px-4 py-3 text-sm font-semibold text-pet-ink shadow-sm outline-none transition focus:border-pet-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
            inputMode="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <button
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-pet-coral bg-pet-coral px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#ff7a6e]/20 transition hover:bg-[#f26155] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-coral"
          type="submit"
        >
          Send login link
        </button>
      </form>

      <p className="mt-5 rounded-2xl bg-pet-cream p-4 text-xs leading-5 text-pet-muted">
        No password required. We&apos;ll send you a secure login link or code.
      </p>
    </div>
  );
}
