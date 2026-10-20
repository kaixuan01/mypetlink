import type { AdminStatusTone } from "@/components/admin/AdminStatus";
import * as api from "@/services/adminConsignmentService";

// Pure rules for the Agreement Document section. The server decides the status;
// these only choose how to present it and check a signed copy before it is sent.

export function documentTone(status: api.AgreementDocumentStatus): AdminStatusTone {
  switch (status) {
    case "incomplete":
      return "critical";
    case "ready":
      return "warning";
    case "issued":
      return "info";
    case "signed-copy-received":
    case "approved":
      return "positive";
    default:
      return "neutral";
  }
}

/** The same short form printed on every page of the agreement, so the two can be compared by eye. */
export function shortFingerprint(fingerprint: string): string {
  return [0, 4, 8].map((start) => fingerprint.slice(start, start + 4).toUpperCase()).join("-");
}

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type Guidance = { tone: "info" | "warning" | "critical"; title: string; message: string };

/** What the operator should do next with the paperwork, or null when nothing is waiting. */
export function documentGuidance(summary: api.AgreementDocumentSummary, agreement: api.Agreement): Guidance | null {
  if (summary.concurrencyToken !== agreement.concurrencyToken) {
    return {
      tone: "warning",
      title: "These terms changed after this page loaded",
      message: "Reload the agreement before previewing or issuing it, so the document matches the terms you can see.",
    };
  }
  const latest = summary.issuedDocuments[0];
  switch (summary.status) {
    case "incomplete": {
      const partner = summary.missingForDocument.some((m) => m.startsWith("Partner"));
      const company = summary.missingForDocument.some((m) => m.startsWith("MyPetLink"));
      const where = [
        partner ? "update the partner in Merchants" : null,
        company ? "complete Business Identity under Configuration" : null,
      ].filter(Boolean);
      return {
        tone: "critical",
        title: "The agreement can’t be prepared yet",
        message: `Still needed: ${summary.missingForDocument.join(", ")}.${where.length ? ` To finish, ${where.join(" and ")}.` : ""}`,
      };
    }
    case "ready":
      return latest
        ? {
            tone: "warning",
            title: `The terms changed after issue ${latest.issueNumber} was sent`,
            message: "Issue the updated agreement and send it to the partner again. Earlier copies are kept for reference but can no longer be signed.",
          }
        : {
            tone: "info",
            title: "Ready to issue for signature",
            message: "Preview the agreement, then issue it. Issuing fixes this copy so you can tell exactly which terms the partner received.",
          };
    case "issued":
      return summary.issuedPartyDetailsChanged
        ? {
            tone: "warning",
            title: "Party details changed after this copy was issued",
            message: "The commercial terms are unchanged. Issue the agreement again if the partner should sign the current company details.",
          }
        : {
            tone: "info",
            title: "Waiting for the partner’s signature",
            message: "Send the issued PDF to the partner. When the signed copy comes back, record it here.",
          };
    case "signed-copy-received":
      return agreement.signedAgreementReference?.trim()
        ? null
        : {
            tone: "info",
            title: "Signed copy received",
            message: "Record the signed agreement reference in the draft. An administrator with approval permission then reviews it — recording the copy does not approve the agreement.",
          };
    default:
      return null;
  }
}

/** A message the operator can paste beside the PDF. It never claims anything was sent. */
export function shareMessage(agreement: api.Agreement, issue: api.IssuedAgreementDocument): string {
  return [
    `Hello ${agreement.merchantName},`,
    "",
    `Attached is the MyPetLink consignment agreement ${agreement.reference} (version ${agreement.version}, issue ${issue.issueNumber}) for your signature.`,
    `Please check that the terms fingerprint on every page reads ${shortFingerprint(issue.termsFingerprint)}, sign the agreement and send the signed copy back to us.`,
    "",
    "Thank you.",
  ].join("\n");
}

export type SignedCopyForm = {
  file: File | null;
  partnerSignatoryName: string;
  partnerSignatoryDesignation: string;
  partnerSignedOn: string;
  companySignatoryName: string;
  companySignatoryDesignation: string;
  companySignedOn: string;
  notes: string;
};

export const emptySignedCopyForm: SignedCopyForm = {
  file: null,
  partnerSignatoryName: "",
  partnerSignatoryDesignation: "",
  partnerSignedOn: "",
  companySignatoryName: "",
  companySignatoryDesignation: "",
  companySignedOn: "",
  notes: "",
};

const acceptedTypes: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

/** The browser's view only; the server checks the file's actual contents again. */
export function validateSignedCopy(form: SignedCopyForm, issuedOn: string, today: string): Partial<Record<keyof SignedCopyForm, string>> {
  const errors: Partial<Record<keyof SignedCopyForm, string>> = {};
  const file = form.file;
  if (!file) errors.file = "Choose the signed agreement file.";
  else {
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!acceptedTypes[file.type]?.includes(extension)) errors.file = "Choose a PDF, JPEG or PNG file.";
    else if (file.size === 0 || file.size > api.MAX_SIGNED_COPY_BYTES) errors.file = "Choose a file of up to 8 MB.";
  }
  if (!form.partnerSignatoryName.trim()) errors.partnerSignatoryName = "Enter who signed for the partner.";
  const dateProblem = (value: string) =>
    value < issuedOn ? "This is before the agreement was issued." : value > today ? "This date is in the future." : undefined;
  if (!form.partnerSignedOn) errors.partnerSignedOn = "Enter the date the partner signed.";
  else errors.partnerSignedOn = dateProblem(form.partnerSignedOn);
  if (form.companySignedOn) errors.companySignedOn = dateProblem(form.companySignedOn);
  if (!form.companySignatoryName.trim() && (form.companySignedOn || form.companySignatoryDesignation.trim()))
    errors.companySignatoryName = "Enter who signed for MyPetLink, or clear the MyPetLink signature details.";
  if (form.notes.trim().length > 1000) errors.notes = "Keep notes to 1,000 characters.";
  for (const key of Object.keys(errors) as (keyof SignedCopyForm)[]) if (!errors[key]) delete errors[key];
  return errors;
}

/** "YYYY-MM-DD" in Malaysia time, matching how the server checks signing dates. */
export function malaysiaDay(iso: string | Date): string {
  const time = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function fileToBase64(file: Blob): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}
