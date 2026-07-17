"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminDetailItem } from "@/components/admin/AdminPanels";
import { formatAdminDateTime, lifecycleTone, tagStatusTone } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes, publicProfilePath, qrSafetyPath } from "@/lib/routes";
import { toAbsoluteUrl } from "@/lib/siteUrl";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import {
  getAdminPetProfileDetail,
  type AdminPetProfile,
  type AdminPetProfileDetail,
} from "@/services/adminPetProfileService";

const historyLabels: Record<string, string> = {
  "pet-profiles.archive": "Pet profile archived",
  "pet-profiles.restore": "Pet profile restored",
  "pet-profiles.disable-qr": "QR Safety disabled by support",
  "pet-profiles.disable-lost-mode": "Lost Mode turned off by support",
};

export function AdminPetProfileDetailDrawer({
  summary,
  onClose,
}: {
  summary: AdminPetProfile;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<{
    key: string;
    detail: AdminPetProfileDetail | null;
    error: string;
  } | null>(null);

  useModalDialogFocus({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });

  useEffect(() => {
    const controller = new AbortController();
    getAdminPetProfileDetail(summary.id, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setState({ key: summary.id, detail, error: "" });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({
            key: summary.id,
            detail: null,
            error: "We couldn't load this pet profile. Please try again.",
          });
        }
      });
    return () => controller.abort();
  }, [summary.id]);

  const detail = state?.key === summary.id ? state.detail : null;
  const error = state?.key === summary.id ? state.error : "";
  const pet = detail?.pet ?? summary;
  const publicPath = pet.publicProfileAccessible && pet.publicSlug && pet.publicCode
    ? publicProfilePath(pet.publicSlug, pet.publicCode)
    : null;
  const qrPath = pet.qrSafetyAccessible && pet.safetyCode ? qrSafetyPath(pet.safetyCode) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-pet-ink/35 backdrop-blur-sm">
      <button
        aria-label="Close pet profile details"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label={`Pet profile details for ${pet.name}, owned by ${pet.ownerName}`}
        aria-modal="true"
        className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-2xl"
        ref={dialogRef}
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            {pet.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`${pet.name}'s profile`}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                src={pet.profilePhotoUrl}
              />
            ) : (
              <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-pet-cream text-xl font-black text-pet-ink">
                {pet.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase text-slate-400">Pet profile</p>
              <h2 className="truncate text-xl font-black text-slate-950">{pet.name}</h2>
              <p className="truncate text-sm font-semibold text-slate-500">Owner: {pet.ownerName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={lifecycleTone[pet.lifecycle]}>{pet.lifecycle}</Badge>
                <Badge tone={pet.lostModeEnabled ? "danger" : "soft"}>Lost Mode {pet.lostModeEnabled ? "On" : "Off"}</Badge>
              </div>
            </div>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="grid gap-5 p-4 sm:p-5">
          {!detail && !error ? <p className="text-sm font-semibold text-slate-500">Loading pet profile details…</p> : null}
          {error ? <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700" role="alert">{error}</p> : null}

          {detail ? (
            <>
              <section aria-labelledby="pet-summary-heading">
                <h3 className="text-sm font-black text-slate-900" id="pet-summary-heading">Summary</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Pet type" value={pet.customSpecies || pet.species} />
                  <AdminDetailItem label="Breed" value={pet.breed || "—"} />
                  <AdminDetailItem label="Gender" value={pet.gender || "—"} />
                  <AdminDetailItem label="Age" value={pet.ageDisplay || "—"} />
                  <AdminDetailItem label="Age information" value={pet.ageMode} />
                  <AdminDetailItem label="Colour" value={detail.color || "—"} />
                  <AdminDetailItem label="Birthday" value={formatDateOnly(detail.birthday)} />
                  <AdminDetailItem label="Adoption day" value={formatDateOnly(detail.adoptionDay)} />
                  <AdminDetailItem label="Created" value={formatAdminDateTime(pet.createdAt)} />
                  <AdminDetailItem label="Updated" value={formatAdminDateTime(pet.updatedAt)} />
                </div>
              </section>

              <section aria-labelledby="pet-owner-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900" id="pet-owner-heading">Owner</h3>
                  <Link className={actionClass} href={adminRoutes.owner(pet.ownerId)}>View owner</Link>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Owner name" value={pet.ownerName} />
                  <AdminDetailItem label="Email" value={pet.ownerEmail || "—"} />
                  <AdminDetailItem label="Phone" value={detail.ownerPhone || "—"} />
                  <AdminDetailItem label="WhatsApp" value={detail.ownerWhatsapp || "—"} />
                  <AdminDetailItem label="General area" value={detail.generalArea || "—"} />
                </div>
              </section>

              <section aria-labelledby="pet-public-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900" id="pet-public-heading">Public Share Profile</h3>
                  {publicPath ? <a className={actionClass} href={publicPath} rel="noopener noreferrer" target="_blank">Open Public Share Profile</a> : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Status" value={routeStatus(pet.publicProfileAccessible, pet.publicProfileSetupIssue)} />
                  <AdminDetailItem label="Enabled setting" value={pet.publicProfileEnabled ? "Enabled" : "Disabled"} />
                  <AdminDetailItem label="Theme" value={pet.profileTheme} />
                  <AdminDetailItem label="Profile photo" value={pet.profilePhotoUrl ? "Available" : "No profile photo"} />
                  <AdminDetailItem label="Cover photo" value={detail.coverPhotoUrl ? "Available" : "No cover photo"} />
                  <AdminDetailItem label="Allergies shared" value={detail.showAllergiesOnPublicProfile ? "Yes" : "No"} />
                </div>
                {publicPath ? <p className="mt-2 break-all rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{toAbsoluteUrl(publicPath)}</p> : null}
                {pet.publicProfileSetupIssue ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">The profile is enabled but its lifecycle or route identity prevents access. No public action is shown.</p> : null}
              </section>

              <section aria-labelledby="pet-qr-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900" id="pet-qr-heading">QR Safety Page</h3>
                  {qrPath ? <a className={actionClass} href={qrPath} rel="noopener noreferrer" target="_blank">Open QR Safety Page</a> : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500">This pet-level safety page is independent of physical Smart Tags.</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Status" value={routeStatus(pet.qrSafetyAccessible, pet.qrSafetySetupIssue)} />
                  <AdminDetailItem label="Enabled setting" value={pet.qrSafetyEnabled ? "Enabled" : "Disabled"} />
                  <AdminDetailItem label="Finder contact" value={pet.hasFinderContact ? "Available" : "Not available"} />
                  <AdminDetailItem label="Phone shown" value={detail.showPhone ? "Yes" : "No"} />
                  <AdminDetailItem label="WhatsApp shown" value={detail.showWhatsapp ? "Yes" : "No"} />
                  <AdminDetailItem label="Emergency note shown" value={detail.showEmergencyNote ? "Yes" : "No"} />
                </div>
                {qrPath ? <p className="mt-2 break-all rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{toAbsoluteUrl(qrPath)}</p> : null}
                {pet.qrSafetySetupIssue ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">QR Safety is enabled but its lifecycle or safety code prevents access. No broken link is shown.</p> : null}
              </section>

              <section aria-labelledby="pet-lost-heading">
                <h3 className="text-sm font-black text-slate-900" id="pet-lost-heading">Lost Mode</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Status" value={pet.lostModeEnabled ? "On" : "Off"} />
                  <AdminDetailItem label="Last seen" value={formatAdminDateTime(pet.lostLastSeenDateTime)} />
                  <AdminDetailItem label="Last-seen area" value={detail.lostLastSeenArea || "—"} />
                  <AdminDetailItem label="Finder message" value={detail.lostMessage || "—"} />
                  <AdminDetailItem label="Reward" value={detail.lostRewardNote || "—"} />
                  <AdminDetailItem label="Contact instructions" value={detail.lostContactInstructions || "—"} />
                </div>
              </section>

              <section aria-labelledby="pet-safety-heading">
                <h3 className="text-sm font-black text-slate-900" id="pet-safety-heading">Safety information</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AdminDetailItem label="Safety note" value={detail.safetyNote || "—"} />
                  <AdminDetailItem label="Emergency note" value={detail.emergencyNote || "—"} />
                </div>
                <div className="mt-3">
                  <p className="text-xs font-extrabold uppercase text-slate-400">Known allergies</p>
                  {detail.allergies.length ? (
                    <ul aria-label="Known allergies" className="mt-1.5 flex flex-wrap gap-1.5">
                      {detail.allergies.map((allergy) => <li className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-800" key={allergy}>{allergy}</li>)}
                    </ul>
                  ) : <p className="mt-1 text-sm font-semibold text-slate-500">No allergies recorded.</p>}
                </div>
              </section>

              <section aria-labelledby="pet-tags-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900" id="pet-tags-heading">Physical Smart Tags</h3>
                  <Link className={actionClass} href={adminRoutes.smartTagsForPet(pet.id)}>View Smart Tags</Link>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-500">No physical tag is a normal state; QR Safety can still be available.</p>
                {detail.smartTags.length ? (
                  <ul className="mt-2 grid gap-2">
                    {detail.smartTags.map((tag) => (
                      <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2" key={tag.id}>
                        <span><span className="block font-mono text-sm font-black text-slate-900">{tag.tagCode}</span><span className="text-xs font-semibold text-slate-500">{tag.hasNfc ? "QR + NFC Smart Tag" : "QR Pet Tag"} · {tag.variant}</span></span>
                        <Badge tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}>{tag.isArchived ? "Archived" : tag.status}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 rounded-xl bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">No physical Smart Tags linked.</p>}
              </section>

              <section aria-labelledby="pet-history-heading">
                <h3 className="text-sm font-black text-slate-900" id="pet-history-heading">Admin support history</h3>
                {detail.history.length ? (
                  <ol className="mt-2 grid gap-2">
                    {detail.history.map((entry, index) => (
                      <li className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm" key={`${entry.action}:${entry.createdAt}:${index}`}>
                        <span className="min-w-0"><span className="block font-bold text-slate-900">{historyLabels[entry.action] ?? humanize(entry.action)}</span>{entry.detail ? <span className="block break-words text-xs font-semibold text-slate-500">{entry.detail}</span> : null}</span>
                        <span className="shrink-0 text-right text-xs font-semibold text-slate-500">{entry.actorName || entry.actorType}<span className="block">{formatAdminDateTime(entry.createdAt)}</span></span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="mt-2 text-sm font-semibold text-slate-500">No Admin support changes recorded. Owner profile edits are not represented as Admin interventions.</p>}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

const actionClass = "inline-flex min-h-10 items-center rounded-full border border-slate-200 px-3.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50";

function routeStatus(accessible: boolean, issue: boolean) {
  return issue ? "Setup issue" : accessible ? "Accessible" : "Unavailable";
}

function formatDateOnly(value?: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function humanize(value: string) {
  return value.replaceAll("-", " ").replaceAll(".", " · ");
}
