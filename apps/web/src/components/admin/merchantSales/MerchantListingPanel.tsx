"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PhoneNumberInput } from "@/components/ui/PhoneNumberInput";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ImageUploadField } from "@/components/portal/ImageUploadField";
import { MerchantLogo } from "@/components/ui/MerchantLogo";
import { uploadMediaFile, deleteMedia } from "@/services/mediaService";
import { updateMerchantLogo } from "@/services/merchantDirectoryService";
import { partnerStorePath } from "@/lib/routes";
import { getMerchantSalesError, getMerchantSalesFieldErrors } from "@/services/adminMerchantSalesService";
import { getMerchantListing, saveMerchantBranch, updateMerchantListing, type MerchantListing, type BranchInput, type AdminBranch, type PublicationPermission } from "@/services/merchantDirectoryService";
import { fieldClass, primaryButton, secondaryButton, InlineError } from "./shared";

const locationCopy = (message: string) => message.replace(/\bbranches\b/gi, word => word[0] === "B" ? "Store locations" : "store locations")
  .replace(/\bbranch\b/gi, word => word[0] === "B" ? "Store location" : "store location");
const locationFieldErrors = (error: unknown) => Object.fromEntries(Object.entries(getMerchantSalesFieldErrors(error)).map(([key, message]) => [key, locationCopy(message)]));

const freshBranch = (): BranchInput => ({ name: "", address: { addressLine1: "", addressLine2: null, city: "", state: "", postcode: "", country: "Malaysia" }, googleMapsUrl: null, wazeUrl: null, latitude: null, longitude: null, contactPhone: null, whatsApp: null, businessHours: null, isActive: true, showOnWebsite: false, displayOrder: 0 });
const emptyPermission = (): PublicationPermission => ({ source: "WhatsApp", reference: "" });
type MerchantDraft = { description: string; visible: boolean; savedDescription: string; savedVisible: boolean; token: string; permission: PublicationPermission; withdrawalReason: string; confirmedScope: string };
type LogoDraft = { file?: File; preview: string; token: string; originalMediaId: string | null };
const logoTypes = ["image/png", "image/jpeg", "image/webp"];
const merchantDirty = (d: MerchantDraft | null) => Boolean(d && (d.description !== d.savedDescription || d.visible !== d.savedVisible || d.permission.reference || d.permission.source !== "WhatsApp" || d.withdrawalReason));

function PermissionFields({ value, onChange, errors }: { value: PublicationPermission; onChange: (value: PublicationPermission) => void; errors: Record<string, string> }) {
  return <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-bold">Private publication permission</legend>
    <label className="grid gap-1 text-sm font-bold">Permission source<select className={fieldClass} value={value.source} onChange={e => onChange({ ...value, source: e.target.value as PublicationPermission["source"] })}>
      <option value="WhatsApp">WhatsApp</option><option value="Email">Email</option><option value="WrittenAgreement">Written agreement</option><option value="Other">Other</option></select>{errors["permission.source"] && <span className="text-red-700">{errors["permission.source"]}</span>}</label>
    <label className="grid gap-1 text-sm font-bold">Permission reference<input className={fieldClass} required maxLength={500} value={value.reference} onChange={e => onChange({ ...value, reference: e.target.value })} />{errors["permission.reference"] && <span className="text-red-700">{errors["permission.reference"]}</span>}</label>
    <p className="text-sm text-slate-600">Record the contact, agreement date and message or document reference. This is kept privately in activity history. Confirm that permission covers the selected store location details.</p>
  </fieldset>;
}

export function MerchantListingPanel({ merchantId, merchantName = "Merchant", merchantActive, merchantToken, canManage, onMerchantChanged, onDirtyChange }: {
  merchantId: string; merchantName?: string; merchantActive: boolean; merchantToken: string; canManage: boolean; onMerchantChanged?: () => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const [listing, setListing] = useState<MerchantListing | null>(null);
  const [merchantDraft, setMerchantDraft] = useState<MerchantDraft | null>(null);
  const [logoDraft, setLogoDraft] = useState<LogoDraft | null>(null);
  const [draft, setDraft] = useState<BranchInput | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"listing" | "branch" | null>(null);
  const [branchBaseline, setBranchBaseline] = useState("");
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const branchDirty = Boolean(draft && JSON.stringify(draft) !== branchBaseline);
  const dirty = merchantDirty(merchantDraft) || branchDirty || logoDraft !== null;
  const description = merchantDraft?.description ?? "";
  const visible = merchantDraft?.visible ?? false;
  const accept = useCallback((value: MerchantListing, mode: "refresh" | "listing" | "branch" | "logo" = "refresh") => {
    setListing(value);
    if (mode !== "refresh") setLogoDraft(previous => previous && previous.originalMediaId === (value.logoMediaFileId ?? null)
      ? { ...previous, token: value.concurrencyToken } : previous);
    setMerchantDraft(previous => {
      if (!previous || mode === "listing" || !merchantDirty(previous)) return { description: value.businessDescription ?? "", visible: value.showOnWebsite,
        savedDescription: value.businessDescription ?? "", savedVisible: value.showOnWebsite, token: value.concurrencyToken, permission: emptyPermission(), withdrawalReason: "", confirmedScope: "" };
      // Only our own branch operation may advance a dirty merchant token,
      // and only if the merchant fields still match its original baseline.
      if ((mode === "branch" || mode === "logo") && previous.savedVisible === value.showOnWebsite && previous.savedDescription === (value.businessDescription ?? "")) return { ...previous, token: value.concurrencyToken };
      return previous;
    });
  }, []);
  // A route teardown is not consent to discard. Only saving or an explicit
  // discard clears the workspace guard, never an unmount cleanup.
  useLayoutEffect(() => { onDirtyChange?.(dirty || busy); }, [dirty, busy, onDirtyChange]);
  useLayoutEffect(() => {
    // The workspace owns unload consent when present, so explicit discard is
    // not followed by a second native warning from this panel.
    if (onDirtyChange) return;
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    const controller = new AbortController();
    getMerchantListing(merchantId, controller.signal).then(value => { if (!controller.signal.aborted) accept(value); }).catch(() => {
      if (!controller.signal.aborted) setError("We couldn’t load store locations. Please try again.");
    });
    return () => controller.abort();
  }, [merchantId, merchantToken, accept]);

  async function save(kind: "listing" | "branch") {
    if (!listing || !merchantDraft || busy) return;
    setBusy(true); setError(""); setFields({}); setMessage("");
    try {
      const value = kind === "listing"
        ? await updateMerchantListing(merchantId, { showOnWebsite: visible, businessDescription: description || null, concurrencyToken: merchantDraft.token,
            ...(visible && !merchantDraft.savedVisible ? { permission: { ...merchantDraft.permission, branchIds: listing.branches.filter(b => b.showOnWebsite).map(b => b.id) } } : {}),
            ...(!visible && merchantDraft.withdrawalReason ? { withdrawalReason: merchantDraft.withdrawalReason } : {}) })
        : await saveMerchantBranch(merchantId, branchId, { ...draft!, merchantConcurrencyToken: listing.concurrencyToken });
      accept(value, kind);
      if (kind === "branch") setDraft(null);
      setMessage(kind === "listing" ? "Public listing settings saved." : "Store location saved.");
      onMerchantChanged?.();
    } catch (caught) {
      setError(locationCopy(getMerchantSalesError(caught, "We couldn’t save these changes. Please try again.")));
      setFields(locationFieldErrors(caught));
    } finally { setBusy(false); }
  }
  function edit(branch?: AdminBranch) {
    const action = () => { const next = branch ? { ...branch, address: { ...branch.address } } : freshBranch();
      setBranchId(branch?.id ?? null); setDraft(next); setBranchBaseline(JSON.stringify(next)); setError(""); setFields({}); setMessage(""); };
    if (branchDirty) setPendingDiscard(() => action); else action();
  }
  async function reloadListing() {
    setBusy(true); setError(""); setFields({});
    try { accept(await getMerchantListing(merchantId), "listing"); setDraft(null); setLogoDraft(null); setMessage("Listing reloaded."); }
    catch (caught) { setError(getMerchantSalesError(caught, "We couldn’t load store locations. Please try again.")); }
    finally { setBusy(false); }
  }
  async function saveLogo() {
    if (!listing || !logoDraft || busy || !canManage) return;
    setBusy(true); setError(""); setFields({}); setMessage("");
    let uploadedId: string | null = null;
    try {
      if (logoDraft.file) uploadedId = (await uploadMediaFile({ file: logoDraft.file,
        category: "MerchantLogo", merchantId, cleanupOnFailure: true })).mediaId;
      const value = await updateMerchantLogo(merchantId, uploadedId, logoDraft.token);
      accept(value, "logo"); setLogoDraft(null);
      setMessage(uploadedId ? "Merchant logo saved." : "Merchant logo removed.");
      onMerchantChanged?.();
    } catch (caught) {
      if (uploadedId) await deleteMedia(uploadedId).catch(() => undefined);
      setError(getMerchantSalesError(caught, caught instanceof Error ? caught.message : "We couldn’t save the logo. Please try again."));
      setFields(locationFieldErrors(caught));
    } finally { setBusy(false); }
  }
  const parentActive = listing?.merchantIsActive ?? merchantActive;
  const published = parentActive && listing?.isPublished;
  const scopeKey = JSON.stringify(listing?.branches.filter(b => b.showOnWebsite).map(b => ({ id: b.id, name: b.name, address: b.address })) ?? []);
  const previousBranch = listing?.branches.find(b => b.id === branchId);
  const branchScopeChanged = Boolean(previousBranch && draft && (previousBranch.name !== draft.name.trim()
    || (Object.keys(draft.address) as (keyof BranchInput["address"])[]).some(key => (previousBranch.address[key]?.trim() ?? "") !== (draft.address[key]?.trim() ?? ""))));
  const needsBranchPermission = Boolean(listing?.showOnWebsite && draft?.showOnWebsite && draft.isActive && (!previousBranch?.showOnWebsite || !previousBranch?.isActive || branchScopeChanged));
  const field = (label: string, key: keyof BranchInput, options: { type?: string; maxLength?: number; min?: number; max?: number } = {}) => (
    <label className="grid gap-1 text-sm font-bold" key={key}>{label}
      <input className={fieldClass} value={String(draft?.[key] ?? "")} {...options}
        required={key === "name" || key === "displayOrder"}
        step={key === "displayOrder" ? "1" : options.type === "number" ? "any" : undefined}
        onChange={e => setDraft(d => d && ({ ...d, [key]: options.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null }))} />
      {fields[key] && <span className="text-xs text-red-700">{fields[key]}</span>}
    </label>
  );
  return <section className="grid gap-4 rounded-2xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center gap-3"><h3 className="font-bold">Partner Directory &amp; Store Locations</h3>
      <Badge tone={published ? "teal" : "soft"}>{!parentActive ? "Inactive" : published ? "Published" : "Hidden"}</Badge>
      {published && listing?.publicCode && <a className={secondaryButton} href={partnerStorePath(listing.publicCode)} target="_blank" rel="noopener noreferrer">View public listing</a>}
      {listing && <button className={secondaryButton} type="button" disabled={busy} onClick={() => { const action = () => void reloadListing(); if (dirty) setPendingDiscard(() => action); else action(); }}>Reload listing</button>}
    </div>
    <InlineError message={error} />
    {message && <p role="status" className="text-sm text-teal-700">{message}</p>}
    {!listing ? <div><p role="status">{error ? "Store locations are unavailable." : "Loading store locations…"}</p>{error && <button className={secondaryButton} type="button" onClick={() => { setError(""); void getMerchantListing(merchantId).then(accept).catch(() => setError("We couldn’t load store locations. Please try again.")); }}>Retry</button>}</div> : <>
      {canManage ? <form className="grid gap-3 rounded-xl border border-slate-200 p-4" onSubmit={e => { e.preventDefault(); void saveLogo(); }}>
        <ImageUploadField label="Merchant logo" layout="compact" shape="square" fit="contain" preserveTransparency
          acceptedTypes={logoTypes} maxBytes={2 * 1024 * 1024} disabled={busy} onReadingChange={setBusy}
          error={fields.mediaId || fields.concurrencyToken}
          value={logoDraft?.preview ?? listing.logoUrl ?? ""}
          onFileSelected={file => setLogoDraft(previous => ({ file, preview: previous?.preview ?? listing.logoUrl ?? "",
            token: previous?.token ?? listing.concurrencyToken, originalMediaId: previous ? previous.originalMediaId : listing.logoMediaFileId ?? null }))}
          onChange={preview => setLogoDraft(previous => !preview && !listing.logoMediaFileId && !listing.logoUrl ? null
            : { file: previous?.file, token: previous?.token ?? listing.concurrencyToken,
              originalMediaId: previous ? previous.originalMediaId : listing.logoMediaFileId ?? null, preview })}
          helper="One logo shared by all store locations. PNG, JPG or WebP, up to 2 MB and 4096 × 4096 pixels. Save to apply changes.">
          <button type="submit" className={primaryButton} disabled={busy || !logoDraft}>{busy ? "Saving…" : "Save logo"}</button>
          {logoDraft && <button type="button" className={secondaryButton} disabled={busy} onClick={() => setLogoDraft(null)}>Discard logo changes</button>}
        </ImageUploadField>
      </form> : <div className="flex items-center gap-3"><MerchantLogo name={merchantName} src={listing.logoUrl} /><span className="text-sm font-bold">Merchant logo</span></div>}
      <form className="grid gap-3" onSubmit={e => { e.preventDefault(); if (visible !== listing.showOnWebsite) setConfirmation("listing"); else void save("listing"); }}>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={visible} disabled={!canManage || busy} onChange={e => setMerchantDraft(d => d && ({ ...d, visible: e.target.checked }))} />Show on Website</label>
        <p className="text-sm text-slate-600">Allow this merchant and its selected store locations to appear in the public MyPetLink Partner Directory. Enable only with the merchant’s permission. This does not affect its partnership or sales access.</p>
        <label className="grid gap-1 text-sm font-bold">Business description<textarea className={fieldClass} maxLength={2000} disabled={!canManage || busy} value={description} onChange={e => setMerchantDraft(d => d && ({ ...d, description: e.target.value }))} />{fields.businessDescription && <span className="text-red-700">{fields.businessDescription}</span>}</label>
        {canManage && merchantDraft && visible && !merchantDraft.savedVisible && <fieldset disabled={busy} className="grid gap-3">
          <PermissionFields value={merchantDraft.permission} onChange={permission => setMerchantDraft(d => d && ({ ...d, permission }))} errors={fields} />
          <p className="text-sm text-slate-600">Selected locations covered by this permission: {listing.branches.filter(b => b.showOnWebsite).map(b => `${b.name}${b.isActive ? "" : " (inactive)"}`).join(", ") || "None. Permission must be recorded separately when locations are selected later."}</p>
          <label className="flex items-start gap-2 text-sm font-bold"><input type="checkbox" required checked={merchantDraft.confirmedScope === scopeKey} onChange={e => setMerchantDraft(d => d && ({ ...d, confirmedScope: e.target.checked ? scopeKey : "" }))} />I confirm permission covers all selected locations and their public details.</label>
          {fields["permission.branchIds"] && <span className="text-sm text-red-700">{fields["permission.branchIds"]}</span>}
        </fieldset>}
        {canManage && !visible && merchantDraft?.savedVisible && <label className="grid gap-1 text-sm font-bold">Withdrawal reason (optional)<textarea className={fieldClass} maxLength={500} disabled={busy} value={merchantDraft.withdrawalReason} onChange={e => setMerchantDraft(d => d && ({ ...d, withdrawalReason: e.target.value }))} />{fields.withdrawalReason && <span className="text-red-700">{fields.withdrawalReason}</span>}</label>}
        {visible && !published && <p className="text-sm text-slate-600">An active merchant needs at least one active store location with Show on Website enabled to appear publicly.</p>}
        {canManage && <button type="submit" disabled={busy} className={`${primaryButton} justify-self-start`}>{busy ? "Saving…" : "Save listing settings"}</button>}
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold">Store Locations ({listing.branches.length})</h4>{canManage && <button className={secondaryButton} type="button" disabled={busy || listing.branches.length >= 100} onClick={() => edit()}>Add location</button>}</div>
      {listing.branches.length === 0 && <p className="text-sm text-slate-600">No store locations added. Add your shop’s physical address to get started.</p>}
      {listing.branches.map(branch => <article key={branch.id} className="rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="min-w-0 font-bold [overflow-wrap:anywhere]">{branch.name}</h5>
          <div className="flex flex-wrap gap-2"><Badge tone={branch.isActive ? "mint" : "soft"}>{branch.isActive ? "Active" : "Inactive"}</Badge>
            <Badge tone={branch.isPublished && parentActive ? "teal" : "soft"}>{branch.isPublished && parentActive ? "Published" : "Hidden"}</Badge></div></div>
        <p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{[branch.address.addressLine1, branch.address.addressLine2, branch.address.postcode, branch.address.city, branch.address.state, branch.address.country].filter(Boolean).join(", ")}</p>
        {branch.showOnWebsite && (!listing.showOnWebsite || !parentActive) && <p className="mt-1 text-xs text-slate-500">Selected for public display; currently hidden by merchant settings or status.</p>}
        {canManage && <button type="button" className={`${secondaryButton} mt-2`} disabled={busy} onClick={() => edit(branch)}>Edit location</button>}
      </article>)}
      {draft && canManage && <form className="grid gap-4 rounded-xl bg-slate-50 p-4" onSubmit={e => {
        e.preventDefault(); const previous = listing.branches.find(b => b.id === branchId);
        const before = Boolean(parentActive && listing.showOnWebsite && previous?.isActive && previous.showOnWebsite);
        const after = Boolean(parentActive && listing.showOnWebsite && draft.isActive && draft.showOnWebsite);
        if (before !== after) setConfirmation("branch"); else void save("branch");
      }}>
        <h4 className="font-bold">{branchId ? "Edit location" : "Add location"}</h4>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          {field("Store name / Location name", "name", { maxLength: 160 })}
          {(["addressLine1", "addressLine2", "city", "state", "postcode", "country"] as const).map(key => <label className="grid gap-1 text-sm font-bold" key={key}>
            {{addressLine1: "Store address", addressLine2: "Address line 2 (optional)", city: "City", state: "State", postcode: "Postcode", country: "Country"}[key]}
            <input className={fieldClass} required={key !== "addressLine2"} maxLength={{addressLine1: 240, addressLine2: 240, city: 120, state: 120, postcode: 16, country: 80}[key]} value={draft.address[key] ?? ""} onChange={e => setDraft(d => d && ({ ...d, address: { ...d.address, [key]: e.target.value } }))} />
            {fields[`address.${key}`] && <span className="text-xs text-red-700">{fields[`address.${key}`]}</span>}
          </label>)}
          {field("Google Maps link (optional)", "googleMapsUrl", { type: "url", maxLength: 2048 })}
          {field("Waze link (optional)", "wazeUrl", { type: "url", maxLength: 2048 })}
          {field("Latitude (optional)", "latitude", { type: "number", min: -90, max: 90 })}
          {field("Longitude (optional)", "longitude", { type: "number", min: -180, max: 180 })}
          <PhoneNumberInput label="Store phone (optional)" value={draft.contactPhone ?? ""} onChange={v => setDraft(d => d && ({ ...d, contactPhone: v || null }))} error={fields.contactPhone} />
          <PhoneNumberInput label="Store WhatsApp (optional)" value={draft.whatsApp ?? ""} onChange={v => setDraft(d => d && ({ ...d, whatsApp: v || null }))} error={fields.whatsApp} />
          {field("Business hours (optional)", "businessHours", { maxLength: 500 })}
          {field("Display order", "displayOrder", { type: "number", min: 0, max: 10000 })}
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={e => setDraft(d => d && ({ ...d, isActive: e.target.checked }))} />Active location</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.showOnWebsite} onChange={e => setDraft(d => d && ({ ...d, showOnWebsite: e.target.checked }))} />Show this location on website</label>
        </fieldset>
        {needsBranchPermission && <fieldset disabled={busy}><PermissionFields value={draft.permission ?? emptyPermission()} onChange={permission => setDraft(d => d && ({ ...d, permission }))} errors={fields} /></fieldset>}
        {previousBranch?.showOnWebsite && (!draft.isActive || !draft.showOnWebsite) && <label className="grid gap-1 text-sm font-bold">Location withdrawal reason (optional)<textarea className={fieldClass} maxLength={500} disabled={busy} value={draft.withdrawalReason ?? ""} onChange={e => setDraft(d => d && ({ ...d, withdrawalReason: e.target.value }))} />{fields.withdrawalReason && <span className="text-red-700">{fields.withdrawalReason}</span>}</label>}
        <p className="text-sm text-slate-600">Display this location publicly when the merchant is also published. Add HTTPS Google Maps or Waze links independently, or enter both coordinates to offer both navigation options. Links do not verify a destination.</p>
        <div className="flex gap-2"><button className={primaryButton} type="submit" disabled={busy}>{busy ? "Saving…" : "Save location"}</button><button className={secondaryButton} type="button" disabled={busy} onClick={() => { const action = () => setDraft(null); if (branchDirty) setPendingDiscard(() => action); else action(); }}>Cancel</button></div>
      </form>}
    </>}
    <ConfirmDialog open={confirmation !== null} title="Change public availability?" message="Confirm that you have the merchant’s permission to publish the selected information. Hidden or inactive locations will be removed from the directory. Partnership and sales access are unaffected." confirmLabel="Save changes" onCancel={() => setConfirmation(null)} onConfirm={() => { const kind = confirmation; setConfirmation(null); if (kind) void save(kind); }} />
    <ConfirmDialog open={pendingDiscard !== null} title="Discard unsaved changes?" message="Save your changes first, discard them to continue, or keep editing." confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={() => setPendingDiscard(null)} onConfirm={() => { const action = pendingDiscard; setPendingDiscard(null); action?.(); }} />
  </section>;
}
