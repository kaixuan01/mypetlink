import { apiRequestBlob } from "@/services/apiClient";

// Downloads a MyPetLink order document (Order Summary or Official Receipt) as a
// PDF from the backend, which is the authoritative source for wording, totals,
// and payment status. No documents are generated or stored on the client.

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadPdf(path: string, fallbackFileName: string) {
  const { blob, fileName } = await apiRequestBlob(path);
  saveBlob(blob, fileName ?? fallbackFileName);
}

// --- Owner (own orders only; enforced by the backend) ---

export function downloadOwnerOrderSummaryPdf(orderKey: string, orderNumber: string) {
  return downloadPdf(
    `/api/v1/orders/${encodeURIComponent(orderKey)}/summary.pdf`,
    `MyPetLink-Order-${orderNumber}.pdf`
  );
}

export function downloadOwnerOrderReceiptPdf(orderKey: string, orderNumber: string) {
  return downloadPdf(
    `/api/v1/orders/${encodeURIComponent(orderKey)}/receipt.pdf`,
    `MyPetLink-Receipt-${orderNumber}.pdf`
  );
}

// --- Admin (any order; requires the admin policy) ---

export function downloadAdminOrderSummaryPdf(orderId: string, orderNumber: string) {
  return downloadPdf(
    `/api/v1/admin/orders/${encodeURIComponent(orderId)}/summary.pdf`,
    `MyPetLink-Order-${orderNumber}.pdf`
  );
}

export function downloadAdminOrderReceiptPdf(orderId: string, orderNumber: string) {
  return downloadPdf(
    `/api/v1/admin/orders/${encodeURIComponent(orderId)}/receipt.pdf`,
    `MyPetLink-Receipt-${orderNumber}.pdf`
  );
}
