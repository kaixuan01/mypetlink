"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdminDetailItem } from "@/components/admin/AdminPanels";
import { formatAdminDateTime, lifecycleTone, tagStatusTone } from "@/components/admin/adminDisplay";
import { Badge } from "@/components/ui/Badge";
import { adminRoutes } from "@/lib/routes";
import { useModalDialogFocus } from "@/lib/useModalDialogFocus";
import { getAdminOwnerDetail, type AdminOwner, type AdminOwnerDetail } from "@/services/adminOwnerService";

export function AdminOwnerDetailDrawer({
  summary,
  initialDetail,
  onClose,
}: {
  summary: AdminOwner;
  initialDetail?: AdminOwnerDetail;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<{ key: string; detail: AdminOwnerDetail | null; error: string } | null>(() =>
    initialDetail?.owner.ownerUserId === summary.ownerUserId
      ? { key: summary.ownerUserId, detail: initialDetail, error: "" }
      : null);
  const [copied, setCopied] = useState("");

  useModalDialogFocus({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });

  useEffect(() => {
    if (initialDetail?.owner.ownerUserId === summary.ownerUserId) {
      return;
    }
    const controller = new AbortController();
    getAdminOwnerDetail(summary.ownerUserId, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setState({ key: summary.ownerUserId, detail, error: "" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key: summary.ownerUserId, detail: null, error: "We couldn't load this owner account. Please try again." });
      });
    return () => controller.abort();
  }, [initialDetail, summary.ownerUserId]);

  const detail = state?.key === summary.ownerUserId ? state.detail : null;
  const error = state?.key === summary.ownerUserId ? state.error : "";
  const owner = detail?.owner ?? summary;

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(`${label} copied.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-pet-ink/35 backdrop-blur-sm">
      <button aria-label="Close owner details" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <aside
        aria-label={`Owner account details for ${owner.displayName}, ${owner.email}`}
        aria-modal="true"
        className="relative flex h-full w-full max-w-4xl flex-col overflow-y-auto bg-white shadow-2xl"
        ref={dialogRef}
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase text-slate-400">Owner account</p>
            <h2 className="truncate text-xl font-black text-slate-950">{owner.displayName}</h2>
            <p className="truncate text-sm font-semibold text-slate-500">{owner.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={statusTone(owner.status)}>{owner.status}</Badge>
              <Badge tone={owner.contactReady ? "mint" : "warm"}>{owner.contactReady ? "Contact ready" : "Contact incomplete"}</Badge>
              <Badge tone="soft">{owner.planName}</Badge>
            </div>
          </div>
          <button aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50" onClick={onClose} ref={closeRef} type="button">×</button>
        </header>

        <div className="grid gap-5 p-4 sm:p-5">
          <p aria-live="polite" className="sr-only">{copied}</p>
          {!detail && !error ? <p className="text-sm font-semibold text-slate-500" role="status">Loading owner account details…</p> : null}
          {error ? <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700" role="alert">{error}</p> : null}

          {detail ? (
            <>
              <section aria-labelledby="owner-account-heading">
                <h3 className="text-sm font-black text-slate-900" id="owner-account-heading">Account summary</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Account status" value={owner.status} />
                  <AdminDetailItem label="Plan" value={`${owner.planName} (${owner.planCode})`} />
                  <AdminDetailItem label="Authentication" value={detail.authenticationProviders.length ? detail.authenticationProviders.join(", ") : "Not recorded"} />
                  <AdminDetailItem label="Joined" value={formatAdminDateTime(owner.joinedAt)} />
                  <AdminDetailItem label="Updated" value={formatAdminDateTime(owner.updatedAt)} />
                  <AdminDetailItem label="Last signed in" value={formatAdminDateTime(owner.lastLoginAt)} />
                </div>
              </section>

              <section aria-labelledby="owner-contact-heading">
                <h3 className="text-sm font-black text-slate-900" id="owner-contact-heading">Contact and finder readiness</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">Owner defaults and pet-specific finder visibility are evaluated separately.</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <AdminDetailItem label="Owner defaults" value={owner.contactReady ? "Usable phone or WhatsApp" : "Missing usable contact"} />
                  <AdminDetailItem label="Finder-ready pets" value={String(owner.finderReadyPetCount)} />
                  <AdminDetailItem label="Pets needing contact review" value={String(owner.finderContactIssuePetCount)} />
                  <AdminDetailItem label="Phone" value={detail.phoneE164 || "—"} />
                  <AdminDetailItem label="WhatsApp" value={detail.whatsappE164 || "—"} />
                  <AdminDetailItem label="Default general area" value={detail.defaultGeneralArea || "—"} />
                  <AdminDetailItem label="Phone shown by default" value={detail.defaultPrivacy.showPhone ? "Yes" : "No"} />
                  <AdminDetailItem label="WhatsApp shown by default" value={detail.defaultPrivacy.showWhatsapp ? "Yes" : "No"} />
                  <AdminDetailItem label="Owner name shown by default" value={detail.defaultPrivacy.showOwnerName ? "Yes" : "No"} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton label="Copy email" onClick={() => void copy(owner.email, "Email")} />
                  {detail.phoneE164 ? <CopyButton label="Copy phone" onClick={() => void copy(detail.phoneE164!, "Phone")} /> : null}
                  {detail.whatsappE164 ? <CopyButton label="Copy WhatsApp" onClick={() => void copy(detail.whatsappE164!, "WhatsApp")} /> : null}
                </div>
              </section>

              <section aria-labelledby="owner-usage-heading">
                <h3 className="text-sm font-black text-slate-900" id="owner-usage-heading">Plan and usage</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <AdminDetailItem label="Active pets" value={`${owner.activePetCount} / ${owner.maxPets || "—"}`} />
                  <AdminDetailItem label="All pet profiles" value={String(owner.petCount)} />
                  <AdminDetailItem label="Memories" value={String(owner.memoryCount)} />
                  <AdminDetailItem label="Highest memories on one pet" value={`${detail.highestMemoriesOnPet}${owner.maxMemoriesPerPet ? ` / ${owner.maxMemoriesPerPet}` : ""}`} />
                </div>
                {owner.petUsageNearLimit || detail.memoryUsageNearLimit ? (
                  <p className="mt-2 text-sm font-bold text-amber-800">
                    {owner.petUsageNearLimit && detail.memoryUsageNearLimit
                      ? "Pet and memory usage are near the current plan limits."
                      : owner.petUsageNearLimit
                        ? "Pet usage is near the current plan limit."
                        : "Memory usage is near the current plan limit."}
                  </p>
                ) : null}
              </section>

              <section aria-labelledby="owner-pets-heading">
                <SectionHeading id="owner-pets-heading" title="Pet profiles" href={adminRoutes.petsForOwner(owner.ownerUserId)} action="View all pets" />
                {detail.pets.length ? (
                  <ul className="mt-2 grid gap-2">
                    {detail.pets.map((pet) => (
                      <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2" key={pet.petId}>
                        <span className="min-w-0"><Link className="font-bold text-slate-900 hover:underline" href={adminRoutes.pet(pet.petId)}>{pet.name}</Link><span className="block text-xs font-semibold text-slate-500">Updated {formatAdminDateTime(pet.updatedAt)}</span></span>
                        <span className="flex flex-wrap gap-1.5"><Badge tone={lifecycleTone[pet.lifecycle]}>{pet.lifecycle}</Badge>{pet.lostModeEnabled ? <Badge tone="danger">Lost Mode</Badge> : null}{pet.publicProfileSetupIssue || pet.qrSafetySetupIssue ? <Badge tone="warm">Setup review</Badge> : null}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyLine>No pet profiles linked.</EmptyLine>}
              </section>

              <section aria-labelledby="owner-orders-heading">
                <SectionHeading id="owner-orders-heading" title="Orders and payment proofs" href={adminRoutes.ordersForOwner(owner.ownerUserId)} action="View all orders" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link className={actionClass} href={adminRoutes.paymentProofsForOwner(owner.ownerUserId)}>View payment proofs</Link>
                </div>
                {detail.recentOrders.length ? (
                  <ul className="mt-2 grid gap-2">
                    {detail.recentOrders.map((order) => <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2" key={order.orderId}><span><Link className="font-mono text-sm font-black text-slate-900 hover:underline" href={adminRoutes.order(order.orderId)}>{order.orderNumber}</Link><span className="block text-xs font-semibold text-slate-500">{order.currency} {order.amount.toFixed(2)} · {formatAdminDateTime(order.createdAt)}</span></span><span className="text-right text-xs font-bold text-slate-600">{humanize(order.paymentStatus)}<span className="block">{humanize(order.status)}</span></span></li>)}
                  </ul>
                ) : <EmptyLine>No orders linked.</EmptyLine>}
                {detail.recentPaymentProofs.length ? (
                  <ul className="mt-2 grid gap-2">
                    {detail.recentPaymentProofs.map((proof) => (
                      <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2" key={proof.paymentProofId}>
                        <span className="font-mono text-sm font-black text-slate-900">{proof.orderNumber}</span>
                        <span className="text-right text-xs font-bold text-slate-600">
                          {humanize(proof.status)}
                          <span className="block">Submitted {formatAdminDateTime(proof.submittedAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section aria-labelledby="owner-tags-heading">
                <SectionHeading id="owner-tags-heading" title="Physical Smart Tags" href={adminRoutes.smartTagsForOwner(owner.ownerUserId)} action="View Smart Tags" />
                {detail.smartTags.length ? <ul className="mt-2 grid gap-2">{detail.smartTags.map((tag) => <li className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2" key={tag.tagId}><span className="font-mono text-sm font-black text-slate-900">{tag.tagCode}</span><Badge tone={tag.isArchived ? "soft" : tagStatusTone[tag.status]}>{tag.isArchived ? "Archived" : tag.status}</Badge></li>)}</ul> : <EmptyLine>No physical Smart Tags linked.</EmptyLine>}
              </section>

              <section aria-labelledby="owner-history-heading">
                <h3 className="text-sm font-black text-slate-900" id="owner-history-heading">Account activity</h3>
                {detail.history.length ? <ol className="mt-2 grid gap-2">{detail.history.map((entry, index) => <li className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm" key={`${entry.label}:${entry.createdAt}:${index}`}><span className="font-bold text-slate-900">{entry.label}</span><span className="shrink-0 text-right text-xs font-semibold text-slate-500">{entry.actor}<span className="block">{formatAdminDateTime(entry.createdAt)}</span></span></li>)}</ol> : <EmptyLine>No account activity recorded.</EmptyLine>}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

const actionClass = "inline-flex min-h-10 items-center rounded-full border border-slate-200 px-3.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pet-teal";

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className={actionClass} onClick={onClick} type="button">{label}</button>;
}

function SectionHeading({ id, title, href, action }: { id: string; title: string; href: string; action: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900" id={id}>{title}</h3><Link className={actionClass} href={href}>{action}</Link></div>;
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-xl bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">{children}</p>;
}

function statusTone(status: AdminOwner["status"]): "mint" | "warm" | "danger" | "soft" {
  if (status === "Active") return "mint";
  if (status === "Suspended" || status === "Deleted") return "danger";
  return "warm";
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}
