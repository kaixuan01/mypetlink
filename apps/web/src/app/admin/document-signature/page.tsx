import type { Metadata } from "next";
import { AdminDocumentSignatureManager } from "@/components/admin/AdminDocumentSignatureManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "My Signature" };

export default function AdminDocumentSignaturePage() {
  return (
    <>
      <PageHeader
        compactOnMobile
        eyebrow="Configuration"
        title="My signature"
        description="Keep your signature on file to sign the Delivered By section of Delivery Orders you generate."
      />
      <AdminDocumentSignatureManager />
    </>
  );
}
