"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { publicProfilePath, qrSafetyPath } from "@/lib/routes";
import { toAbsoluteUrl } from "@/lib/siteUrl";
import {
  getAdminSampleExperience,
  sampleExperienceError,
  updateAdminSampleExperience,
  type AdminSampleExperience,
} from "@/services/sampleExperienceService";

export function AdminSampleExperienceManager() {
  const [settings, setSettings] = useState<AdminSampleExperience | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await getAdminSampleExperience(signal);
      setSettings(result);
      setSelectedId(result.featuredSamplePetId ?? "");
      setError("");
    } catch (caught) {
      if (!signal?.aborted) setError(sampleExperienceError(caught));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAdminSampleExperience(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSettings(result);
          setSelectedId(result.featuredSamplePetId ?? "");
          setError("");
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(sampleExperienceError(caught));
      });
    return () => controller.abort();
  }, [load]);

  async function save() {
    if (!settings || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateAdminSampleExperience(selectedId || null, settings.rowVersion);
      setSettings(updated);
      setSelectedId(updated.featuredSamplePetId ?? "");
      setNotice(selectedId ? "Featured Sample Pet saved." : "The Sample Experience is now unconfigured.");
    } catch (caught) {
      setError(sampleExperienceError(caught));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!settings && !error) return <p className="rounded-2xl bg-white p-5 text-sm font-semibold text-slate-500">Loading Sample Experience settings…</p>;

  const selected = settings?.eligiblePets.find((pet) => pet.petId === selectedId)
    ?? (settings?.selectedPet?.petId === selectedId ? settings.selectedPet : null);

  return (
    <section className="grid min-w-0 gap-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="featured-sample-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950" id="featured-sample-heading">Featured Sample Pet</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">Choose only a pet that an administrator has explicitly approved for public demonstration.</p>
        </div>
        {settings ? <Badge tone={settings.status === "Ready" ? "mint" : settings.status === "NeedsReplacement" ? "warm" : "soft"}>{settings.status}</Badge> : null}
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800" role="status">{notice}</p> : null}
      {settings?.status === "NeedsReplacement" ? <p className="rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900" role="alert">The configured pet is no longer suitable for public use. Select another approved pet or clear the setting. The public page is showing a safe unavailable state.</p> : null}

      <label className="grid min-w-0 gap-2 text-sm font-extrabold text-slate-800" htmlFor="featured-sample-pet">
        Featured Sample Pet
        <select id="featured-sample-pet" className="min-h-12 w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 font-semibold" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">No featured sample pet</option>
          {settings?.eligiblePets.map((pet) => <option disabled={!pet.canBeFeatured} key={pet.petId} value={pet.petId}>{pet.name} · {pet.ownerName}{pet.canBeFeatured ? "" : " · unavailable"}</option>)}
          {settings?.selectedPet && !settings.eligiblePets.some((pet) => pet.petId === settings.selectedPet?.petId)
            ? <option disabled value={settings.selectedPet.petId}>{settings.selectedPet.name} · no longer eligible</option>
            : null}
        </select>
      </label>

      {selected ? <PetStatus pet={selected} /> : <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">No pet is selected. The public Sample Experience will not reveal any pet.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button className="min-h-11 rounded-full bg-[#1b4f9c] px-5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!settings || busy || selectedId === (settings.featuredSamplePetId ?? "") || Boolean(selected && !selected.canBeFeatured)} onClick={save} type="button">{busy ? "Saving…" : "Save Changes"}</button>
        {settings?.updatedBy ? <span className="text-xs font-semibold text-slate-500">Last updated by {settings.updatedBy}</span> : null}
      </div>
    </section>
  );
}

function PetStatus({ pet }: { pet: NonNullable<AdminSampleExperience["selectedPet"]> }) {
  const publicPath = pet.publicSlug && pet.publicCode ? publicProfilePath(pet.publicSlug, pet.publicCode) : null;
  const safetyPath = pet.safetyCode ? qrSafetyPath(pet.safetyCode) : null;
  return (
    <div className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 p-4">
      <div className="flex min-w-0 items-center gap-3">
        {pet.profilePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`${pet.name}'s profile`} className="h-14 w-14 shrink-0 rounded-2xl object-cover" src={pet.profilePhotoUrl} />
        ) : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-pet-cream text-xl font-black">{pet.name.slice(0, 1)}</span>}
        <div className="min-w-0"><p className="break-words font-black text-slate-950">{pet.name}</p><p className="break-all text-xs font-semibold text-slate-500">{pet.ownerName} · {pet.ownerEmail}</p></div>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <Status label="Lifecycle" value={pet.lifecycle} good={pet.lifecycle === "Active"} />
        <Status label="Public Share Profile" value={pet.publicProfileAvailable ? "Available" : "Unavailable"} good={pet.publicProfileAvailable} />
        <Status label="Safety Profile" value={pet.safetyProfileAvailable ? "Available" : "Unavailable"} good={pet.safetyProfileAvailable} />
      </dl>
      <div className="flex flex-wrap gap-2">
        {publicPath && pet.publicProfileAvailable ? <a className={previewClass} href={publicPath} rel="noopener noreferrer" target="_blank">Preview Public Profile</a> : null}
        {safetyPath && pet.safetyProfileAvailable ? <a className={previewClass} href={safetyPath} rel="noopener noreferrer" target="_blank">Preview Safety Profile</a> : null}
      </div>
      {publicPath ? <p className="break-all text-xs font-semibold text-slate-500">{toAbsoluteUrl(publicPath)}</p> : null}
      {safetyPath ? <p className="break-all text-xs font-semibold text-slate-500">{toAbsoluteUrl(safetyPath)}</p> : null}
    </div>
  );
}

function Status({ good, label, value }: { good: boolean; label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-extrabold uppercase text-slate-400">{label}</dt><dd className={good ? "mt-1 font-bold text-emerald-700" : "mt-1 font-bold text-amber-800"}>{value}</dd></div>;
}

const previewClass = "inline-flex min-h-10 items-center rounded-full border border-slate-200 px-4 text-xs font-extrabold text-slate-700 hover:bg-slate-50";
