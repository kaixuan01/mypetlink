"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNotice, AdminSection } from "@/components/admin/AdminPanels";
import { formatAdminDateTime } from "@/components/admin/adminDisplay";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  documentSignatureError,
  getDocumentSignature,
  getDocumentSignatureImage,
  readSignatureFile,
  removeDocumentSignature,
  saveDocumentSignature,
  signatureImageTypes,
  signatureTextMaxLength,
  type DocumentSignatureStatus,
} from "@/services/adminDocumentSignatureService";

const primary =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-pet-teal px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const danger =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-[#f3b8ad] bg-white px-5 py-3 text-sm font-extrabold text-[#a63c2e] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Your own signature, kept on file so you can sign the Delivery Orders you
 * generate. Only you can see, change or use it.
 */
export function AdminDocumentSignatureManager() {
  const [status, setStatus] = useState<DocumentSignatureStatus | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const apply = useCallback(async (next: DocumentSignatureStatus) => {
    setStatus(next);
    setName(next.signature?.signatoryName ?? "");
    setPosition(next.signature?.signatoryPosition ?? "");
    pick(null);
    setFileKey((key) => key + 1);
    let url: string | null = null;
    if (next.signature) {
      try {
        url = URL.createObjectURL(await getDocumentSignatureImage());
      } catch {
        url = null;
      }
    }
    // The previous preview's URL is released by the effect below.
    setImageUrl(url);
  }, []);

  const load = useCallback(async () => {
    try {
      await apply(await getDocumentSignature());
      setError("");
      setState("ready");
    } catch (caught) {
      setError(documentSignatureError(caught, "We couldn’t load your signature. Please try again."));
      setState("error");
    }
  }, [apply]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // The chosen file is previewed locally until it is saved; its URL is released when it changes.
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  function pick(chosen: File | null) {
    setFile(chosen);
    setFileUrl(chosen ? URL.createObjectURL(chosen) : null);
  }

  function choose(chosen: File | null) {
    setMessage("");
    setError("");
    if (!chosen) {
      pick(null);
      return;
    }
    if (!(signatureImageTypes as readonly string[]).includes(chosen.type)) {
      pick(null);
      setFileKey((key) => key + 1);
      setError("Choose a PNG or JPEG image of your signature.");
      return;
    }
    if (status && chosen.size > status.maxUploadBytes) {
      pick(null);
      setFileKey((key) => key + 1);
      setError("Choose a signature image of up to 2 MB.");
      return;
    }
    pick(chosen);
  }

  async function save() {
    if (!status || saving) return;
    const signatoryName = name.trim();
    const signatoryPosition = position.trim();
    if (!signatoryName || !signatoryPosition) {
      setError("Enter the name and position to print beside your signature.");
      return;
    }
    if (!status.signature && !file) {
      setError("Choose an image of your signature.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const image = file ? { base64: await readSignatureFile(file), contentType: file.type } : null;
      await apply(
        await saveDocumentSignature({
          signatoryName,
          signatoryPosition,
          image,
          currentSignatureId: status.signature?.id ?? null,
        })
      );
      setMessage("Your signature is saved. Documents you signed before keep the signature they were signed with.");
    } catch (caught) {
      setError(documentSignatureError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!status?.signature || saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await apply(await removeDocumentSignature(status.signature.id));
      setMessage("Your signature was removed. Documents you already signed are unchanged.");
    } catch (caught) {
      setError(documentSignatureError(caught, "We couldn’t remove your signature. Please try again."));
    } finally {
      setSaving(false);
      setConfirmRemove(false);
    }
  }

  if (state === "loading") {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">Loading your signature...</div>;
  }
  if (state === "error" || !status) {
    return (
      <div className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] p-6 text-sm font-bold text-[#a63c2e]" role="alert">
        {error || "We couldn’t load your signature."}
      </div>
    );
  }

  const current = status.signature;
  const changed = Boolean(file) || name.trim() !== (current?.signatoryName ?? "") || position.trim() !== (current?.signatoryPosition ?? "");
  return (
    <div className="space-y-5 sm:space-y-6">
      <AdminNotice>
        Your signature is stored privately. Only you can see it or use it, and it is added to a Delivery Order only when you
        choose to sign while generating one. Received By is never signed for the partner.
      </AdminNotice>
      {message ? <AdminNotice>{message}</AdminNotice> : null}
      {error ? (
        <div className="rounded-2xl border border-[#ffd2c9] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[#a63c2e]" role="alert">
          {error}
        </div>
      ) : null}

      <AdminSection
        description={current ? "The signature you can apply to Delivered By when you generate a Delivery Order." : "You don’t have a signature on file yet."}
        title="Your signature"
      >
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-4">
            <SignaturePreview
              alt={file ? "New signature, not saved yet" : "Your saved signature"}
              caption={file ? "New image — not saved yet" : current ? `Saved ${formatAdminDateTime(current.savedAt)}` : "Choose an image below to add your signature."}
              url={fileUrl ?? imageUrl}
            />
            {current || file ? (
              <p className="text-sm text-slate-600">
                Prints as: <span className="font-bold text-slate-900">{[name.trim(), position.trim()].filter(Boolean).join(", ") || "—"}</span>
              </p>
            ) : null}
          </div>
          <div className="grid content-start gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-900" htmlFor="signature-name">
              Name
              <input
                className="brand-input"
                id="signature-name"
                maxLength={signatureTextMaxLength}
                onChange={(event) => { setName(event.target.value); setMessage(""); }}
                value={name}
              />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-900" htmlFor="signature-position">
              Position
              <input
                className="brand-input"
                id="signature-position"
                maxLength={signatureTextMaxLength}
                onChange={(event) => { setPosition(event.target.value); setMessage(""); }}
                placeholder="For example, Director"
                value={position}
              />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-900" htmlFor="signature-image">
              {current ? "Replace signature image" : "Signature image"}
              <span className="text-xs font-semibold text-slate-500">
                A PNG or JPEG of up to 2 MB: a dark signature on white paper or a transparent background. It is cropped to your
                signature and the background is removed.
              </span>
              <input
                accept={signatureImageTypes.join(",")}
                className="text-sm font-semibold text-slate-700"
                id="signature-image"
                key={fileKey}
                onChange={(event) => choose(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={primary} disabled={saving || !changed} onClick={() => void save()} type="button">
                {saving ? "Saving..." : current ? "Save changes" : "Save signature"}
              </button>
              {current ? (
                <button className={danger} disabled={saving} onClick={() => setConfirmRemove(true)} type="button">
                  Remove signature
                </button>
              ) : null}
              {file ? (
                <button className={secondary} disabled={saving} onClick={() => { pick(null); setFileKey((key) => key + 1); }} type="button">
                  Discard new image
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </AdminSection>

      <ConfirmDialog
        confirmDisabled={saving}
        confirmLabel="Remove signature"
        destructive
        message="Your signature image will be erased and you won’t be able to sign Delivery Orders until you add one again. Delivery Orders you already signed keep their signature."
        onCancel={() => { if (!saving) setConfirmRemove(false); }}
        onConfirm={() => void remove()}
        open={confirmRemove}
        title="Remove your signature?"
      />
    </div>
  );
}

export function SignaturePreview({ url, alt, caption }: { url: string | null; alt: string; caption: string }) {
  return (
    <figure className="grid gap-2">
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-4">
        {url ? (
          // A private blob URL for your own signature: never a public link, so next/image does not apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={alt} className="max-h-28 max-w-full object-contain" src={url} />
        ) : (
          <span className="text-sm font-semibold text-slate-400">No signature on file</span>
        )}
      </div>
      <figcaption className="text-xs font-semibold text-slate-500">{caption}</figcaption>
    </figure>
  );
}
