"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminActionButton, AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { codesFromManifest, manifestFileProblem, nfcUrlFromRecords, tagCodeFromQr, type NdefRecord } from "@/lib/physicalQaReaders";
import { canUseAdminApi } from "@/services/adminService";
import { physicalQaService as qa, type QaCapture, type QaCondition, type QaFilters, type QaHistory, type QaItem, type QaPreview, type QaStatus, type QaSummary } from "@/services/physicalQaService";

type ReaderEvent = { message: { records: NdefRecord[] }; serialNumber?: string };
type NfcReader = { scan: (options: { signal: AbortSignal }) => Promise<void>; onreading: ((event: ReaderEvent) => void) | null; onreadingerror: (() => void) | null };
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ReaderWindow = Window & { NDEFReader?: new () => NfcReader; BarcodeDetector?: new (options: { formats: string[] }) => Detector };
type PendingSwitch = { url: string; code: string };
const inputStyle = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
// Consecutive frames without a QR code before the same code may be read again.
const EMPTY_FRAMES_BEFORE_REREAD = 4;
function historyText(action: string, result: string | null) {
  try {
    const value = JSON.parse(result ?? "{}");
    if (action.endsWith("qa-enrolled")) return [value.qaShipmentReference && `Shipment ${value.qaShipmentReference}`, value.commitment && `Held for ${value.commitment}`].filter(Boolean).join(" · ");
    return [value.status && statusLabel(value.status), value.condition && `Condition: ${statusLabel(value.condition)}`, value.qaRemarks].filter(Boolean).join(" · ");
  } catch { return "Inspection details unavailable."; }
}
const initialFilters: QaFilters = { batch: "", sku: "", tagCode: "", qaStatus: "", shipment: "" };
const statusLabel = (status: string | null) => status === "NeedsReview" ? "Needs Review" : status ?? "Outside QA cohort";
const commitmentLabel = (kind: string) => kind === "MerchantOrder" ? "Merchant order" : "Customer order";
const message = (e: unknown) => e instanceof Error ? e.message : "We couldn't save this inspection. Please try again.";

function HistoryList({ history }: { history: QaHistory[] }) {
  return <>{history.map(h => <div key={h.id} className="rounded-lg bg-slate-50 p-2 text-xs"><strong>{h.adminName ?? "Administrator"} · {new Date(h.createdAt).toLocaleString()}</strong><p>{h.action.endsWith("qa-enrolled") ? "Enrolled for inspection" : "Inspection saved"}</p><p>{historyText(h.action, h.result)}</p></div>)}</>;
}

function CodeList({ title, codes }: { title: string; codes: string[] }) {
  if (codes.length === 0) return null;
  return <details className="text-sm"><summary className="cursor-pointer text-red-800">{title} ({codes.length})</summary><p className="mt-1 break-words font-mono text-xs">{codes.join(", ")}</p></details>;
}

function ManifestReview({ preview }: { preview: QaPreview }) {
  return <div className="grid gap-3 text-sm">
    <p>Expected {preview.expectedCount} · manifest entries {preview.manifestEntries} · distinct codes {preview.uniqueCodes} · found in inventory {preview.found} · ready to enroll {preview.eligible} · already enrolled {preview.alreadyEnrolled} · customer units still waiting for a tag {preview.outstandingRetailReservations}</p>
    <p className="text-slate-600">Matching codes only shows that each code exists in inventory. It does not prove that every package is unique — inspecting each package does.</p>
    {preview.problems.length ? <div className="grid gap-1 rounded-xl bg-red-50 p-3 text-red-800">{preview.problems.map((p, i) => <p key={i}>{p}</p>)}</div> : null}
    <CodeList title="Codes listed more than once" codes={preview.duplicateCodes.map(d => `${d.tagCode} ×${d.occurrences}`)} />
    <CodeList title="Entries that are not tag codes" codes={preview.invalidCodes} />
    <CodeList title="Codes not in inventory" codes={preview.missingCodes} />
    {preview.skus.length ? <div><strong>By SKU</strong><ul className="list-disc pl-5">{preview.skus.map(s => <li key={s.sku ?? "none"}>{s.sku ?? "No SKU"}{s.productName ? ` · ${s.productName}` : ""}{s.variantName ? ` · ${s.variantName}` : ""}{s.tagVariant ? ` (${s.tagVariant})` : ""}: {s.count}</li>)}</ul></div> : null}
    {preview.batches.length ? <div><strong>By production batch</strong><ul className="list-disc pl-5">{preview.batches.map(b => <li key={b.batchNo ?? "none"}>{b.batchNo ?? "No batch"}: {b.inManifest} in this manifest of {b.batchTotal} in the batch{b.notInManifest ? ` — ${b.notInManifest} batch codes are not in this manifest` : ""}{b.notInManifestCodes.length ? <details><summary className="cursor-pointer">Show codes not in this manifest</summary><p className="break-words font-mono text-xs">{b.notInManifestCodes.join(", ")}</p></details> : null}</li>)}</ul></div> : null}
    {preview.commitments.length ? <div className="rounded-xl bg-amber-50 p-3 text-amber-900"><strong>Tags already promised to an order ({preview.commitments.length})</strong><p>These stay with their orders, but none of them can ship until it passes inspection.</p><ul className="list-disc pl-5">{preview.commitments.map(c => <li key={c.tagCode}>{c.tagCode} · {commitmentLabel(c.kind)} {c.reference} · {c.status}</li>)}</ul></div> : null}
    {preview.listsTruncated ? <p className="text-amber-800">Some lists are shortened. Counts cover the whole manifest.</p> : null}
  </div>;
}

export function AdminPhysicalQaPanel({ canManage, canExport, onSaved }: { canManage: boolean; canExport: boolean; onSaved?: () => void }) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<QaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<QaSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshGeneration = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hint, setHint] = useState("");
  const [item, setItem] = useState<QaItem | null>(null);
  const current = useRef<QaItem | null>(null);
  // The package just saved or cleared. The camera ignores its QR until it has
  // seen a different code, so a package still in view can't reopen itself.
  const recent = useRef<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<QaCapture | null>(null);
  const [nfc, setNfc] = useState<QaCapture | null>(null);
  const [condition, setCondition] = useState<QaCondition>("Unchecked");
  const [decision, setDecision] = useState<QaStatus>("Passed");
  const [remarks, setRemarks] = useState("");
  const [history, setHistory] = useState<QaHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const captureBusy = useRef(false);
  const saveRequest = useRef<{ key: string; id: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraAbort = useRef<AbortController | null>(null);
  const nfcAbort = useRef<AbortController | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [nfcOn, setNfcOn] = useState(false);
  const [supportsNfc, setSupportsNfc] = useState(false);
  const [shipment, setShipment] = useState("");
  const [expected, setExpected] = useState(900);
  const [manifest, setManifest] = useState<string[]>([]);
  const [preview, setPreview] = useState<QaPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const connected = canUseAdminApi();

  const refresh = useCallback(async () => {
    if (!connected) return;
    const generation = ++refreshGeneration.current;
    setLoading(true);
    try {
      const [list, counts] = await Promise.all([qa.list(filters, page), qa.summary(filters)]);
      if (generation === refreshGeneration.current) { setRows(list.items); setTotal(list.total); setSummary(counts); }
    } catch (e) { if (generation === refreshGeneration.current) setError(message(e)); } finally { if (generation === refreshGeneration.current) setLoading(false); }
  }, [connected, filters, page]);
  const invalidateRefresh = useCallback(() => { refreshGeneration.current++; }, []);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 200); return () => { window.clearTimeout(timer); invalidateRefresh(); }; }, [refresh, invalidateRefresh]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSupportsNfc(Boolean((window as ReaderWindow).NDEFReader)), 0);
    return () => {
      window.clearTimeout(timer); cameraAbort.current?.abort(); nfcAbort.current?.abort();
      stream.current?.getTracks().forEach(t => t.stop());
    };
  }, []);
  const selectItem = useCallback((next: QaItem | null) => {
    current.current = next; setItem(next); setCode(next?.tagCode ?? ""); setPendingSwitch(null);
    setQr(null); setNfc(null); setCondition("Unchecked"); setDecision("Passed"); setRemarks(""); setHistory([]); saveRequest.current = null;
  }, []);
  const runExclusive = useCallback(async (action: () => Promise<void>) => {
    if (captureBusy.current) return;
    captureBusy.current = true; setBusy(true); setError("");
    try { await action(); } catch (e) { setError(message(e)); }
    finally { captureBusy.current = false; setBusy(false); }
  }, []);
  const lookup = () => runExclusive(async () => { setHint(""); selectItem(await qa.lookup(code.trim())); });
  // Records a QR reading against one specific package. The server decides
  // whether it matches; a mismatch can only ever be saved as an exception.
  const captureQrFor = useCallback(async (target: QaItem, url: string) => {
    const result = await qa.capture(target, "Camera", url);
    if (current.current?.id === target.id) setQr(result);
  }, []);
  const onQrRead = useCallback((url: string) => runExclusive(async () => {
    const scanned = tagCodeFromQr(url);
    const target = current.current;
    if (target) {
      // Another package's QR while one is open: never re-target silently.
      if (scanned && scanned !== target.tagCode) { setPendingSwitch({ url, code: scanned }); return; }
      setHint(""); await captureQrFor(target, url); return;
    }
    if (!scanned) throw new Error("This QR link has no recognizable tag code. Find the package by its printed code to record a failure.");
    if (scanned === recent.current) { setHint(`${scanned} was just finished. Present the next package. To inspect it again, find it by its printed code.`); return; }
    recent.current = null; setHint("");
    const next = await qa.lookup(scanned); selectItem(next);
    await captureQrFor(next, url);
  }), [captureQrFor, runExclusive, selectItem]);
  const startCamera = async () => {
    setError("");
    try {
      const Constructor = (window as ReaderWindow).BarcodeDetector;
      if (!Constructor || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera decoding is unavailable here. Use Chrome on a compatible Android phone and allow camera access.");
      const detector = new Constructor({ formats: ["qr_code"] });
      const controller = new AbortController(); cameraAbort.current?.abort(); cameraAbort.current = controller;
      stream.current?.getTracks().forEach(t => t.stop());
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (controller.signal.aborted) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media; setCameraOn(true);
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      let last = ""; let emptyFrames = 0;
      const scan = async () => {
        if (controller.signal.aborted) return;
        try {
          if (video.current && video.current.readyState >= 2 && !captureBusy.current) {
            const matches = await detector.detect(video.current);
            const value = matches[0]?.rawValue ?? "";
            // A single missed frame is normal while a package moves, so the same
            // code is read again only after it has really left the view.
            if (!value) { if (++emptyFrames >= EMPTY_FRAMES_BEFORE_REREAD) last = ""; }
            else emptyFrames = 0;
            if (value && value !== last) { last = value; await onQrRead(value); }
          }
        } catch (e) { setError(message(e)); }
        if (!controller.signal.aborted) window.setTimeout(() => void scan(), 250);
      };
      void scan();
    } catch (e) { setError(message(e)); stream.current?.getTracks().forEach(t => t.stop()); setCameraOn(false); }
  };
  const startNfc = async () => {
    setError("");
    try {
      const Constructor = (window as ReaderWindow).NDEFReader;
      if (!Constructor) throw new Error("NFC reading is unavailable in this browser. Use Chrome on an NFC-capable Android phone.");
      const controller = new AbortController(); nfcAbort.current?.abort(); nfcAbort.current = controller;
      const reader = new Constructor();
      reader.onreadingerror = () => { setNfc(null); setError("The NFC chip could not be read. Try again, or record Failed with a reason."); };
      reader.onreading = event => {
        const target = current.current;
        if (captureBusy.current) return;
        if (!target) { setHint("Scan the package's QR code first, then hold the same package to the phone."); return; }
        void runExclusive(async () => {
          setNfc(null); setHint("");
          const url = nfcUrlFromRecords(event.message.records);
          const result = await qa.capture(target, "WebNfc", url, event.serialNumber);
          if (current.current?.id === target.id) setNfc(result);
        });
      };
      await reader.scan({ signal: controller.signal }); setNfcOn(true);
    } catch (e) { setNfcOn(false); setError(message(e)); }
  };
  const finish = (finished: QaItem) => { recent.current = finished.tagCode; selectItem(null); };
  const save = (confirmedCondition: QaCondition) => {
    const target = item;
    if (!target) return;
    void runExclusive(async () => {
      const body = { decision, physicalCondition: confirmedCondition, remarks, qrEvidence: qr?.evidence, nfcEvidence: nfc?.evidence };
      const key = JSON.stringify({ id: target.id, version: target.version, ...body });
      // A lost response can be retried with the same operation id. Editing the
      // inspection creates a new id and is subject to the version check.
      if (saveRequest.current?.key !== key) saveRequest.current = { key, id: crypto.randomUUID() };
      await qa.save(target, { ...body, inspectionId: saveRequest.current.id });
      setNotice(`${target.tagCode}: ${statusLabel(decision)} saved. Move this package to the ${decision === "Passed" ? "passed" : "hold"} tray and scan the next tag.`);
      setHint(""); finish(target); onSaved?.(); void refresh();
    });
  };
  const switchTo = (pending: PendingSwitch) => { const open = current.current; if (open) recent.current = open.tagCode; selectItem(null); void onQrRead(pending.url); };
  const keepWith = (pending: PendingSwitch) => { const target = current.current; setPendingSwitch(null); if (target) void runExclusive(() => captureQrFor(target, pending.url)); };
  const chooseManifest = (file: File | undefined) => {
    setPreview(null); setManifest([]); setAcknowledged(false);
    if (!file) return;
    void runExclusive(async () => {
      const problem = manifestFileProblem(file.name);
      if (problem) throw new Error(problem);
      if (file.size > 5_000_000) throw new Error("Choose a manifest smaller than 5 MB.");
      setManifest(codesFromManifest(await file.text()));
    });
  };
  const cohort = (acknowledgeCommitments: boolean) => ({ shipmentReference: shipment.trim(), tagCodes: manifest, expectedCount: expected, acknowledgeCommitments });
  const passBlocked = decision === "Passed" && (!qr?.matches || !nfc?.matches || !nfc.chipId || condition === "Damaged" || condition === "NeedsReview");
  const remarksMissing = (Boolean(item?.inspectedAt) || decision === "Failed" || decision === "NeedsReview") && !remarks.trim();

  return <AdminSection title="Physical tag inspection" description="Read each packaged tag, check its condition and release only passed stock for sale.">
    <div className="grid gap-4 p-4">
      {!connected ? <AdminNotice>Physical inspections require a live MyPetLink connection. No inspection results are saved on this device.</AdminNotice> : null}
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}
      {hint ? <p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{hint}</p> : null}
      {summary ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {([ ["Expected", summary.totalExpected], ["Passed", summary.passed], ["Failed", summary.failed], ["Needs Review", summary.needsReview], ["Pending", summary.pending], ["Inspected", `${summary.inspected} / ${summary.totalExpected}`] ] as const).map(([label, count]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><strong>{count}</strong></div>)}
      </div> : null}
      {canManage && connected ? <>
        <div className="flex flex-wrap gap-2">
          <AdminActionButton onClick={() => { if (cameraOn) { cameraAbort.current?.abort(); stream.current?.getTracks().forEach(t => t.stop()); setCameraOn(false); } else void startCamera(); }}>{cameraOn ? "Stop camera" : "Start QR camera"}</AdminActionButton>
          <AdminActionButton disabled={!supportsNfc} onClick={() => { if (nfcOn) { nfcAbort.current?.abort(); setNfcOn(false); } else void startNfc(); }}>{nfcOn ? "Stop NFC reader" : "Enable NFC reader"}</AdminActionButton>
        </div>
        <p className="text-sm text-slate-600">Scan the QR, hold the same package to the phone&apos;s NFC reader, check its condition, then save. For a good package, confirm and save with Good condition: pass and next. Keep only one tag near the reader. Reader results expire after 30 minutes.</p>
        {!supportsNfc ? <p className="text-sm text-amber-800">This browser can&apos;t read NFC chips. Use Chrome on an NFC-capable Android phone to inspect tags.</p> : null}
        <video ref={video} muted playsInline aria-label="Tag QR camera" className={`${cameraOn ? "block" : "hidden"} max-h-64 w-full rounded-xl bg-slate-900 object-cover`} />
        <div className="flex items-end gap-2"><label className="grid flex-1 gap-1 text-sm">Printed tag code<input className={inputStyle} value={code} maxLength={32} onChange={e => setCode(e.target.value)} disabled={busy} placeholder="MPL-XXXX-XXXX" /></label><AdminActionButton disabled={busy || !code.trim()} onClick={() => void lookup()}>Find tag</AdminActionButton></div>
        <p className="text-xs text-slate-500">Finding a code opens its inspection. It does not verify the physical QR or NFC chip.</p>
        {item ? <div className="grid gap-3 rounded-xl border border-slate-200 p-3">
          <strong>{item.tagCode} · {item.sku ?? "No SKU"}</strong><p className="text-sm">{item.batch} · {item.shipment} · {statusLabel(item.qaStatus)}</p>
          {pendingSwitch ? <div role="alert" className="grid gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p>This QR belongs to {pendingSwitch.code}, but {item.tagCode} is open. Nothing has been recorded.</p>
            <div className="flex flex-wrap gap-2"><AdminActionButton disabled={busy} onClick={() => switchTo(pendingSwitch)}>Open {pendingSwitch.code}</AdminActionButton><AdminActionButton disabled={busy} onClick={() => keepWith(pendingSwitch)}>Record as {item.tagCode}&apos;s QR</AdminActionButton><AdminActionButton disabled={busy} onClick={() => setPendingSwitch(null)}>Ignore</AdminActionButton></div>
            <p className="text-xs">Record it against {item.tagCode} only if this QR is printed on the {item.tagCode} package. It will show as a mismatch.</p>
          </div> : null}
          {!item.canInspect ? <p role="alert" className="text-amber-800">This tag is outside the inspection queue or has already been sent onward.</p> : null}
          {item.inspectedAt ? <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Previously inspected by {item.inspectedBy ?? "an administrator"} at {new Date(item.inspectedAt).toLocaleString()}. If this is a second package with the same code, choose Needs Review and separate both packages. Repeat inspections require a reason and fresh reader results.</p> : null}
          <p className="break-all text-xs text-slate-500">Expected QR: {item.expectedQrUrl}<br />Expected NFC: {item.expectedNfcUrl}</p>
          <p className="text-sm">QR: {qr ? (qr.matches ? "Verified" : qr.problem) : "Awaiting camera scan"}</p>
          <p className="text-sm">NFC: {nfc ? (nfc.matches ? (nfc.chipId ? `Verified · chip ${nfc.chipId}` : "Link verified, but the phone reported no chip ID. This package can't pass — save Needs Review with a reason.") : nfc.problem) : "Awaiting chip read"}</p>
          <label className="grid gap-1 text-sm">Physical condition<select disabled={busy} className={inputStyle} value={condition} onChange={e => setCondition(e.target.value as QaCondition)}><option value="Unchecked">Check condition</option><option value="Good">Good</option><option value="Damaged">Damaged</option><option value="NeedsReview">Needs Review</option></select></label>
          <label className="grid gap-1 text-sm">Decision<select disabled={busy} className={inputStyle} value={decision} onChange={e => setDecision(e.target.value as QaStatus)}>{["Passed", "Failed", "NeedsReview", "Pending"].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Remarks<textarea disabled={busy} className={inputStyle} value={remarks} maxLength={600} onChange={e => setRemarks(e.target.value)} placeholder="Required for failures, reviews and repeat inspections" /></label>
          <AdminActionButton tone="primary" disabled={busy || !item.canInspect || Boolean(pendingSwitch) || passBlocked || remarksMissing} onClick={() => save(decision === "Passed" ? "Good" : condition)}>{busy ? "Working…" : decision === "Passed" ? "Good condition: pass and next" : "Save and scan next tag"}</AdminActionButton>
          <div className="flex flex-wrap gap-2"><AdminActionButton disabled={busy} onClick={() => void runExclusive(async () => { selectItem(await qa.lookup(item.tagCode)); })}>Reload inspection</AdminActionButton><AdminActionButton disabled={busy} onClick={() => { setHint(""); finish(item); }}>Clear / next tag</AdminActionButton><AdminActionButton disabled={busy} onClick={() => void runExclusive(async () => { setHistory(await qa.history(item.id)); })}>View history</AdminActionButton></div>
          <HistoryList history={history} />
        </div> : <p className="text-sm text-slate-500">Ready for the next package. Scan its QR or find its printed code.</p>}
        <details><summary className="cursor-pointer font-bold">Enroll shipment manifest</summary><div className="mt-3 grid gap-3"><p className="text-sm">Pause sales and fulfilment for these SKUs before enrollment. Choose the manufacturer manifest as a CSV file. Enrollment holds these existing tags until they pass; it creates no tag codes and keeps every existing order.</p>
          <label className="grid gap-1 text-sm">Shipment reference<input className={inputStyle} maxLength={100} value={shipment} onChange={e => { setShipment(e.target.value); setPreview(null); setAcknowledged(false); }} /></label>
          <label className="grid gap-1 text-sm">Expected packages<input className={inputStyle} type="number" min={1} max={10000} value={expected} onChange={e => { setExpected(Number(e.target.value)); setPreview(null); setAcknowledged(false); }} /></label>
          <label className="grid gap-1 text-sm">Manufacturer manifest (CSV with a Tag Code column, or one code per line)<input type="file" accept=".csv,.txt,.xlsx" disabled={busy} onChange={e => chooseManifest(e.target.files?.[0])} /></label>
          <p className="text-xs text-slate-500">Have the Excel workbook? In Excel, choose File → Save As → CSV UTF-8, then choose that file here.</p>
          <AdminActionButton disabled={busy || !manifest.length || !shipment.trim()} onClick={() => void runExclusive(async () => { setAcknowledged(false); setPreview(await qa.preview(cohort(false))); })}>Review {manifest.length} manifest codes</AdminActionButton>
          {preview ? <><ManifestReview preview={preview} />
            {preview.requiresAcknowledgement ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I reviewed the orders above and the stock reduction. These tags will be held, and their orders can&apos;t ship until each tag passes inspection.</label> : null}
            <AdminActionButton tone="primary" disabled={busy || preview.problems.length > 0 || (preview.requiresAcknowledgement && !acknowledged)} onClick={() => void runExclusive(async () => { const result = await qa.enroll(cohort(acknowledged)); setNotice(`Shipment enrolled: ${result.alreadyEnrolled} tags are held for inspection. Inspect every package before releasing it.`); setPreview(null); setAcknowledged(false); setFilters({ ...initialFilters, shipment: shipment.trim() }); setPage(1); onSaved?.(); })}>Enroll existing tags for QA</AdminActionButton></> : null}
        </div></details>
      </> : null}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{([ ["shipment", "Shipment"], ["batch", "Batch"], ["sku", "SKU"], ["tagCode", "Tag Code"] ] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs">{label}<input className={inputStyle} value={filters[key]} maxLength={key === "tagCode" ? 32 : key === "shipment" ? 100 : 80} onChange={e => { setFilters({ ...filters, [key]: e.target.value }); setPage(1); }} /></label>)}<label className="grid gap-1 text-xs">QA status<select className={inputStyle} value={filters.qaStatus} onChange={e => { setFilters({ ...filters, qaStatus: e.target.value }); setPage(1); }}><option value="">All</option>{["Pending", "Passed", "Failed", "NeedsReview"].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>{canExport ? <AdminActionButton disabled={!connected || busy} onClick={() => void runExclusive(async () => { await qa.export(filters); })}>Export QA CSV</AdminActionButton> : null}</div>
      {loading ? <p role="status">Loading inspections…</p> : rows.length === 0 ? <p className="text-sm text-slate-500">No inspection tags match these filters.</p> : <div className="grid gap-2">{rows.map(row => <button key={row.id} disabled={busy} onClick={() => { if (canManage) { setHint(""); selectItem(row); } else void runExclusive(async () => { setHistory(await qa.history(row.id)); }); }} className="grid gap-1 rounded-xl border border-slate-200 p-3 text-left sm:grid-cols-3"><strong>{row.tagCode}</strong><span className="text-sm">{row.sku} · {row.batch}</span><span className="text-sm">{statusLabel(row.qaStatus)}</span>{row.remarks ? <span className="text-sm text-slate-600 sm:col-span-3">{row.remarks}</span> : null}{row.inspectedAt ? <span className="text-xs text-slate-500 sm:col-span-3">{row.inspectedBy} · {new Date(row.inspectedAt).toLocaleString()}</span> : null}</button>)}</div>}
      {item ? null : <HistoryList history={history} />}
      <div className="flex items-center gap-3 text-sm"><AdminActionButton disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</AdminActionButton><span>Page {page} · {total} tags</span><AdminActionButton disabled={page * 25 >= total || loading} onClick={() => setPage(page + 1)}>Next</AdminActionButton></div>
    </div>
  </AdminSection>;
}
