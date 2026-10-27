// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminDocumentSignatureManager } from "./AdminDocumentSignatureManager";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), image: vi.fn() }));
vi.mock("@/services/adminDocumentSignatureService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/adminDocumentSignatureService")>();
  return { ...actual, getDocumentSignature: mocks.load, saveDocumentSignature: mocks.save, removeDocumentSignature: mocks.remove, getDocumentSignatureImage: mocks.image };
});

const saved = {
  signature: { id: "sig-1", signatoryName: "Synthetic Signatory", signatoryPosition: "Director", imageWidth: 300, imageHeight: 100, savedAt: "2026-10-24T01:00:00Z" },
  maxUploadBytes: 2097152,
};
const empty = { signature: null, maxUploadBytes: 2097152 };
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "signature.png", { type: "image/png" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:synthetic-signature");
  URL.revokeObjectURL = vi.fn();
  mocks.image.mockResolvedValue(new Blob(["synthetic"], { type: "image/png" }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("adds a first signature with a name, position and image", async () => {
  mocks.load.mockResolvedValue(empty);
  mocks.save.mockResolvedValue(saved);
  render(<AdminDocumentSignatureManager />);
  expect(await screen.findByText("You don’t have a signature on file yet.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Synthetic Signatory" } });
  fireEvent.change(screen.getByLabelText("Position"), { target: { value: "Director" } });

  // Only PNG and JPEG are accepted, checked before anything is sent.
  fireEvent.change(screen.getByLabelText(/Signature image/), { target: { files: [new File(["<svg/>"], "s.svg", { type: "image/svg+xml" })] } });
  expect((await screen.findByRole("alert")).textContent).toContain("PNG or JPEG");

  fireEvent.change(screen.getByLabelText(/Signature image/), { target: { files: [png()] } });
  expect(screen.getByRole("img", { name: "New signature, not saved yet" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
    signatoryName: "Synthetic Signatory", signatoryPosition: "Director",
    image: { base64: "iVBORw==", contentType: "image/png" }, currentSignatureId: null,
  }));
  expect(await screen.findByText(/Your signature is saved/)).toBeTruthy();
  expect(screen.getByRole("img", { name: "Your saved signature" })).toBeTruthy();
});

it("changes only the wording without re-uploading, and refuses an oversized image", async () => {
  mocks.load.mockResolvedValue(saved);
  mocks.save.mockResolvedValue({ ...saved, signature: { ...saved.signature, id: "sig-2", signatoryPosition: "Managing Director" } });
  render(<AdminDocumentSignatureManager />);
  const position = await screen.findByLabelText("Position");
  expect(screen.getByText("Synthetic Signatory, Director")).toBeTruthy();

  const big = new File([new Uint8Array(2097153)], "big.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText(/Replace signature image/), { target: { files: [big] } });
  expect((await screen.findByRole("alert")).textContent).toContain("up to 2 MB");

  fireEvent.change(position, { target: { value: "Managing Director" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
    signatoryName: "Synthetic Signatory", signatoryPosition: "Managing Director", image: null, currentSignatureId: "sig-1",
  }));
});

it("removes the signature only after confirming", async () => {
  mocks.load.mockResolvedValue(saved);
  mocks.remove.mockResolvedValue(empty);
  render(<AdminDocumentSignatureManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Remove signature" }));
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(screen.getByText(/Delivery Orders you already signed keep their signature/)).toBeTruthy();
  const buttons = screen.getAllByRole("button", { name: "Remove signature" });
  fireEvent.click(buttons[buttons.length - 1]);
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("sig-1"));
  expect(await screen.findByText(/Your signature was removed/)).toBeTruthy();
});

it("shows the server's reason when a save is refused", async () => {
  const { ApiClientError } = await import("@/services/apiClient");
  mocks.load.mockResolvedValue(empty);
  mocks.save.mockRejectedValue(new ApiClientError(400, "signature_image_invalid", "We couldn’t find a signature in this image."));
  render(<AdminDocumentSignatureManager />);
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Synthetic Signatory" } });
  fireEvent.change(screen.getByLabelText("Position"), { target: { value: "Director" } });
  fireEvent.change(screen.getByLabelText(/Signature image/), { target: { files: [png()] } });
  fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
  expect((await screen.findByRole("alert")).textContent).toContain("couldn’t find a signature");
});
