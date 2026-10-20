"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AdminSection } from "@/components/admin/AdminPanels";
import { AdminStatusBadge } from "@/components/admin/AdminStatus";
import { FormDialog } from "@/components/ui/FormDialog";
import * as api from "@/services/adminConsignmentService";
import { dateTime, primaryButton, secondaryButton, shortDate } from "../shared";
import {
  documentGuidance,
  documentTone,
  emptySignedCopyForm,
  fileSizeLabel,
  fileToBase64,
  malaysiaDay,
  shareMessage,
  shortFingerprint,
  validateSignedCopy,
  type SignedCopyForm,
} from "./agreementDocument";
import type { ConsignmentContext } from "./context";
import { errorMessage } from "./model";
import { Callout, DateField, FieldShell, StatusPill, TextAreaField, TextField, textButton } from "./ui";

type FileAction = "preview" | "download" | "print" | "share" | `issued-${string}` | `signed-${string}`;

/**
 * The agreement the partner signs, generated from this version's saved terms.
 * Preview → issue (frozen) → download, print or share → record the partner's
 * signed copy. None of these steps approves the agreement.
 */
export function AgreementDocumentCard({ agreement: a, context }: { agreement: api.Agreement; context: ConsignmentContext }) {
  const { can, reloadKey, actions } = context;
  const canOpenFiles = can.manage || can.approve;
  const [summary, setSummary] = useState<api.AgreementDocumentSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [fileBusy, setFileBusy] = useState<FileAction | null>(null);
  const [fileError, setFileError] = useState("");
  const [fileNotice, setFileNotice] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getAgreementDocument(a.id)
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setLoadError("");
      })
      .catch((e) => {
        if (active) setLoadError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [a.id, a.concurrencyToken, reloadKey]);

  const current = summary?.issuedDocuments.find((d) => d.isCurrent) ?? null;
  const stale = Boolean(summary && summary.concurrencyToken !== a.concurrencyToken);
  const open = a.status !== "Closed";
  const busy = actions.busy || fileBusy !== null;

  async function withFile(action: FileAction, run: () => Promise<void>) {
    if (fileBusy) return;
    setFileBusy(action);
    setFileError("");
    setFileNotice("");
    try {
      await run();
    } catch (e) {
      setFileError(errorMessage(e));
    } finally {
      setFileBusy(null);
    }
  }

  function preview() {
    // Opened inside the click, so the browser treats it as the operator's own window.
    const tab = window.open("", "_blank");
    void withFile("preview", async () => {
      try {
        showPdf(tab, await api.previewAgreementDocument(a));
      } catch (e) {
        tab?.close();
        throw e;
      }
    });
  }

  function issue() {
    const next = (summary?.issuedDocuments[0]?.issueNumber ?? 0) + 1;
    actions.request({
      title: next > 1 ? `Issue updated agreement (issue ${next})?` : "Issue agreement for signature?",
      message: `This fixes ${a.reference} version ${a.version} as issue ${next}, exactly as saved now. Later edits create a new issue; this copy stays as it was sent.`,
      details: (
        <p className="text-sm font-semibold text-slate-600">
          Issuing doesn’t approve the agreement or record a signature. Send the issued PDF to the partner, then record their signed copy.
        </p>
      ),
      confirmLabel: "Issue agreement",
      run: async () => {
        setSummary(await api.issueAgreementDocument(a));
        return "Agreement issued. Download, print or share it with the partner for signature.";
      },
    });
  }

  function share(document: api.IssuedAgreementDocument) {
    void withFile("share", async () => {
      const file = await api.fetchIssuedAgreement(a.id, document);
      const shareable = new File([file.blob], file.fileName, { type: "application/pdf" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [shareable] })) {
        try {
          await navigator.share({ files: [shareable], title: `Consignment agreement ${a.reference}`, text: shareMessage(a, document) });
          setFileNotice("The agreement was handed to your device’s share options. Nothing is recorded as sent or signed.");
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      setShareOpen(true);
    });
  }

  const guidance = summary ? documentGuidance(summary, a) : null;
  const unsignedApproval =
    summary && a.status === "Draft" && a.pendingTerms.length === 0 && !summary.signedCopyMatchesCurrentTerms && !stale;

  return (
    <AdminSection
      action={summary ? <StatusPill tone={documentTone(summary.status)}>{summary.statusLabel}</StatusPill> : undefined}
      compact
      description="Generated from this version’s saved terms. The partner signs the issued copy; internal approval is separate."
      title="Agreement document"
    >
      <div className="grid gap-4 p-4 sm:p-5">
        {loadError ? (
          <Callout role="alert" tone="critical">
            {loadError}
          </Callout>
        ) : null}
        {!summary && !loadError ? (
          <p className="text-sm font-semibold text-slate-500" role="status">
            Loading agreement document…
          </p>
        ) : null}
        {summary ? (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Agreement version">
                {a.reference} v{a.version}
              </Fact>
              <Fact label="Issued copy">{current ? `Issue ${current.issueNumber} · ${shortDate(current.issuedAt)}` : "Not issued for these terms"}</Fact>
              <Fact label="Terms fingerprint">
                {summary.currentTermsFingerprint ? (
                  <span className="font-mono">{shortFingerprint(summary.currentTermsFingerprint)}</span>
                ) : (
                  "Available when the terms are complete"
                )}
              </Fact>
              <Fact label="Signed copy">
                {summary.signedCopies.length === 0
                  ? "None recorded"
                  : summary.signedCopyMatchesCurrentTerms
                    ? "Matches current terms"
                    : "Only for earlier terms"}
              </Fact>
            </dl>

            {guidance ? (
              <Callout title={guidance.title} tone={guidance.tone}>
                {guidance.message}
                {stale ? (
                  <button className={`${textButton} ml-1`} onClick={() => window.location.reload()} type="button">
                    Reload
                  </button>
                ) : null}
              </Callout>
            ) : null}
            {unsignedApproval ? (
              <Callout title="No signed copy of these terms is recorded here" tone="warning">
                Before approving, check that the partner’s signed agreement matches these exact terms
                {summary.currentTermsFingerprint ? ` (fingerprint ${shortFingerprint(summary.currentTermsFingerprint)})` : ""}.
              </Callout>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {can.manage && open && summary.canIssue && !stale ? (
                <button className={primaryButton} disabled={busy} onClick={issue} type="button">
                  {summary.issuedDocuments.length > 0 ? "Issue updated agreement" : "Issue for signature"}
                </button>
              ) : null}
              {can.manage && open && current && !stale ? (
                <button
                  className={summary.status === "issued" ? primaryButton : secondaryButton}
                  disabled={busy}
                  onClick={() => setUploadOpen(true)}
                  type="button"
                >
                  Upload signed copy
                </button>
              ) : null}
              {canOpenFiles && open && summary.missingForDocument.length === 0 && !stale ? (
                <button className={secondaryButton} disabled={busy} onClick={preview} type="button">
                  {fileBusy === "preview" ? "Preparing…" : "Preview PDF"}
                </button>
              ) : null}
              {canOpenFiles && current ? (
                <>
                  <button
                    className={secondaryButton}
                    disabled={busy}
                    onClick={() => void withFile("download", async () => api.saveAgreementFile(await api.fetchIssuedAgreement(a.id, current)))}
                    type="button"
                  >
                    {fileBusy === "download" ? "Preparing…" : "Download PDF"}
                  </button>
                  <button
                    className={secondaryButton}
                    disabled={busy}
                    onClick={() => void withFile("print", async () => printPdf(await api.fetchIssuedAgreement(a.id, current)))}
                    type="button"
                  >
                    {fileBusy === "print" ? "Preparing…" : "Print"}
                  </button>
                  <button className={secondaryButton} disabled={busy} onClick={() => share(current)} type="button">
                    {fileBusy === "share" ? "Preparing…" : "Share"}
                  </button>
                </>
              ) : null}
              {can.manage && a.status === "Draft" && summary.signedCopies.length > 0 ? (
                <button
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => context.openWizard({ mode: "revision", agreement: a })}
                  type="button"
                >
                  Create new version
                </button>
              ) : null}
            </div>
            {can.manage && a.status === "Draft" && summary.signedCopies.length > 0 ? (
              <p className="-mt-2 text-xs font-semibold text-slate-500">
                The partner has signed these terms, so they can only change through a new version, signed again.
              </p>
            ) : null}
            {!canOpenFiles ? (
              <p className="-mt-2 text-xs font-semibold text-slate-500">
                Opening agreement files needs permission to manage or approve agreements.
              </p>
            ) : null}
            {fileError ? (
              <Callout role="alert" tone="critical">
                {fileError}
              </Callout>
            ) : null}
            {fileNotice ? (
              <Callout role="status" tone="info">
                {fileNotice}
              </Callout>
            ) : null}

            {summary.issuedDocuments.length > 0 ? (
              <History title="Issued copies">
                {summary.issuedDocuments.map((d) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={d.id}>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-900">
                        Issue {d.issueNumber}
                        <AdminStatusBadge tone={d.isCurrent ? "info" : "neutral"}>{d.isCurrent ? "Current terms" : "Superseded"}</AdminStatusBadge>
                      </span>
                      <span className="text-xs text-slate-500">
                        Issued {dateTime(d.issuedAt)}
                        {d.issuedByName ? ` by ${d.issuedByName}` : ""} · Fingerprint{" "}
                        <span className="font-mono">{shortFingerprint(d.termsFingerprint)}</span>
                      </span>
                    </span>
                    {canOpenFiles ? (
                      <button
                        className={textButton}
                        disabled={busy}
                        onClick={() => void withFile(`issued-${d.id}`, async () => api.saveAgreementFile(await api.fetchIssuedAgreement(a.id, d)))}
                        type="button"
                      >
                        {fileBusy === `issued-${d.id}` ? "Preparing…" : "Download"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </History>
            ) : null}
            {summary.signedCopies.length > 0 ? (
              <History title="Signed copies received">
                {summary.signedCopies.map((c) => (
                  <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={c.id}>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-900">
                        <span className="break-all">{c.originalFileName}</span>
                        <AdminStatusBadge tone={c.matchesCurrentTerms ? "positive" : "warning"}>
                          {c.matchesCurrentTerms ? "Matches current terms" : "For earlier terms"}
                        </AdminStatusBadge>
                      </span>
                      <span className="text-xs text-slate-500">
                        Signed by {c.partnerSignatoryName}
                        {c.partnerSignatoryDesignation ? ` (${c.partnerSignatoryDesignation})` : ""} on {shortDate(c.partnerSignedOn)} · for issue{" "}
                        {c.issueNumber}
                        {c.companySignatoryName ? ` · MyPetLink: ${c.companySignatoryName}${c.companySignedOn ? ` on ${shortDate(c.companySignedOn)}` : ""}` : ""}
                      </span>
                      <span className="text-xs text-slate-500">
                        Recorded {dateTime(c.uploadedAt)}
                        {c.uploadedByName ? ` by ${c.uploadedByName}` : ""} · {fileSizeLabel(c.fileSize)}
                      </span>
                    </span>
                    {canOpenFiles ? (
                      <button
                        className={textButton}
                        disabled={busy}
                        onClick={() => void withFile(`signed-${c.id}`, async () => api.saveAgreementFile(await api.fetchSignedAgreement(a.id, c)))}
                        type="button"
                      >
                        {fileBusy === `signed-${c.id}` ? "Preparing…" : "Download"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </History>
            ) : null}
          </>
        ) : null}
      </div>
      {uploadOpen && current ? (
        <SignedCopyDialog
          agreement={a}
          issue={current}
          onClose={() => setUploadOpen(false)}
          onSaved={(result) => {
            setSummary(result);
            setUploadOpen(false);
            actions.setNotice({ tone: "success", title: "Signed copy recorded. The agreement still needs its own approval." });
          }}
        />
      ) : null}
      {shareOpen && current ? (
        <ShareDialog
          agreement={a}
          issue={current}
          onClose={() => setShareOpen(false)}
          onDownload={() => withFile("download", async () => api.saveAgreementFile(await api.fetchIssuedAgreement(a.id, current)))}
        />
      ) : null}
    </AdminSection>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="break-words font-bold text-slate-800">{children}</dd>
    </div>
  );
}

function History({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</h4>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{children}</ul>
    </div>
  );
}

function showPdf(tab: Window | null, file: api.AgreementFile) {
  if (!tab) {
    api.saveAgreementFile(file);
    return;
  }
  const url = URL.createObjectURL(file.blob);
  tab.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

/** Prints the PDF itself, so nothing is re-laid out or clipped by the page around it. */
function printPdf(file: api.AgreementFile) {
  const url = URL.createObjectURL(file.blob);
  const frame = document.createElement("iframe");
  frame.title = file.fileName;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // Some browsers refuse to print an embedded PDF; open it for their own print button instead.
      window.open(url, "_blank");
    }
  };
  document.body.append(frame);
  window.setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 5 * 60 * 1000);
}

function ShareDialog({
  agreement,
  issue,
  onClose,
  onDownload,
}: {
  agreement: api.Agreement;
  issue: api.IssuedAgreementDocument;
  onClose: () => void;
  onDownload: () => Promise<void>;
}) {
  const message = shareMessage(agreement, issue);
  const [copied, setCopied] = useState(false);
  return (
    <FormDialog
      description="Attach the issued PDF to your own email or WhatsApp message to the partner."
      eyebrow="Agreement document"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} onClick={onClose} type="button">
            Done
          </button>
          <button className={primaryButton} onClick={() => void onDownload()} type="button">
            Download PDF
          </button>
        </div>
      }
      onRequestClose={onClose}
      open
      title="Send to the partner"
    >
      <div className="grid gap-4 text-sm">
        <ol className="grid list-decimal gap-1 pl-5 font-semibold text-slate-700">
          <li>Download the PDF ({issue.fileName}).</li>
          <li>Attach it to an email or WhatsApp message to {agreement.merchantName}.</li>
          <li>When the signed copy comes back, record it with Upload signed copy.</li>
        </ol>
        <FieldShell
          hint="Paste this beside the attachment. It asks the partner to check the fingerprint printed on every page."
          id="agreement-share-message"
          label="Suggested message"
        >
          <textarea className="min-h-40 w-full rounded-xl border border-pet-border bg-slate-50 px-3 py-2 font-semibold text-pet-ink" id="agreement-share-message" readOnly value={message} />
        </FieldShell>
        <button
          className={`${secondaryButton} justify-self-start`}
          onClick={() => {
            void navigator.clipboard?.writeText(message).then(
              () => setCopied(true),
              () => setCopied(false)
            );
          }}
          type="button"
        >
          {copied ? "Message copied" : "Copy message"}
        </button>
        <Callout tone="info">Sending happens outside MyPetLink, so nothing here is marked as sent or signed.</Callout>
      </div>
    </FormDialog>
  );
}

function SignedCopyDialog({
  agreement,
  issue,
  onClose,
  onSaved,
}: {
  agreement: api.Agreement;
  issue: api.IssuedAgreementDocument;
  onClose: () => void;
  onSaved: (summary: api.AgreementDocumentSummary) => void;
}) {
  const [form, setForm] = useState<SignedCopyForm>(emptySignedCopyForm);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const issuedOn = malaysiaDay(issue.issuedAt);
  const today = malaysiaDay(new Date());
  const errors = validateSignedCopy(form, issuedOn, today);
  const visible = (key: keyof SignedCopyForm) => (showErrors ? errors[key] : undefined);
  const set = <K extends keyof SignedCopyForm>(key: K, value: SignedCopyForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const blank = (value: string) => value.trim() || null;

  async function submit() {
    if (Object.keys(errors).length > 0 || !form.file) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      onSaved(
        await api.uploadSignedAgreement(agreement.id, {
          issuedDocumentId: issue.id,
          fileName: form.file.name,
          contentType: form.file.type,
          contentBase64: await fileToBase64(form.file),
          partnerSignatoryName: form.partnerSignatoryName.trim(),
          partnerSignatoryDesignation: blank(form.partnerSignatoryDesignation),
          partnerSignedOn: form.partnerSignedOn,
          companySignatoryName: blank(form.companySignatoryName),
          companySignatoryDesignation: blank(form.companySignatoryDesignation),
          companySignedOn: form.companySignedOn || null,
          notes: blank(form.notes),
        })
      );
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      closeOnBackdrop={false}
      description={`For ${agreement.reference} version ${agreement.version}, issue ${issue.issueNumber} (fingerprint ${shortFingerprint(issue.termsFingerprint)}).`}
      eyebrow="Agreement document"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} disabled={saving} onClick={onClose} type="button">
            Cancel
          </button>
          <button className={primaryButton} disabled={saving} onClick={() => void submit()} type="button">
            {saving ? "Recording…" : "Record signed copy"}
          </button>
        </div>
      }
      maxWidthClassName="sm:max-w-2xl"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
      open
      title="Upload signed copy"
    >
      <div className="grid gap-4">
        <Callout tone="info">
          Upload the copy the partner actually signed — a PDF or a clear photo or scan, up to 8 MB. Check its fingerprint reads{" "}
          <span className="font-mono">{shortFingerprint(issue.termsFingerprint)}</span>. Recording it doesn’t approve the agreement.
        </Callout>
        <FieldShell error={visible("file")} id="signed-copy-file" label="Signed agreement file" requirement="required">
          <input
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            aria-invalid={visible("file") ? true : undefined}
            className="block w-full text-sm font-semibold text-slate-700 file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-[#e8f3ff] file:px-4 file:font-black file:text-pet-teal"
            id="signed-copy-file"
            onChange={(event) => set("file", event.target.files?.[0] ?? null)}
            type="file"
          />
        </FieldShell>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            error={visible("partnerSignatoryName")}
            label="Signed for the partner by"
            maxLength={200}
            onChange={(value) => set("partnerSignatoryName", value)}
            requirement="required"
            value={form.partnerSignatoryName}
          />
          <TextField
            label="Partner signatory’s designation"
            maxLength={200}
            onChange={(value) => set("partnerSignatoryDesignation", value)}
            requirement="optional"
            value={form.partnerSignatoryDesignation}
          />
          <DateField
            error={visible("partnerSignedOn")}
            label="Date the partner signed"
            max={today}
            min={issuedOn}
            onChange={(value) => set("partnerSignedOn", value)}
            requirement="required"
            value={form.partnerSignedOn}
          />
        </div>
        <fieldset className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <legend className="float-left mb-1 w-full text-sm font-black uppercase tracking-wide text-slate-500 sm:col-span-2">
            MyPetLink signature (if already signed)
          </legend>
          <TextField
            error={visible("companySignatoryName")}
            label="Signed for MyPetLink by"
            maxLength={200}
            onChange={(value) => set("companySignatoryName", value)}
            requirement="optional"
            value={form.companySignatoryName}
          />
          <TextField
            label="Designation"
            maxLength={200}
            onChange={(value) => set("companySignatoryDesignation", value)}
            requirement="optional"
            value={form.companySignatoryDesignation}
          />
          <DateField
            error={visible("companySignedOn")}
            label="Date signed for MyPetLink"
            max={today}
            min={issuedOn}
            onChange={(value) => set("companySignedOn", value)}
            requirement="optional"
            value={form.companySignedOn}
          />
        </fieldset>
        <TextAreaField error={visible("notes")} label="Notes" onChange={(value) => set("notes", value)} requirement="optional" value={form.notes} />
        {saveError ? (
          <Callout role="alert" tone="critical">
            {saveError} Your entries are kept.
          </Callout>
        ) : null}
      </div>
    </FormDialog>
  );
}
