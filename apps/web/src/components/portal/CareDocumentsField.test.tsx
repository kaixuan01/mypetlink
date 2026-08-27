// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CareDocument } from "@/types";
import { CareDocumentsField } from "./CareDocumentsField";

afterEach(() => cleanup());

describe("CareDocumentsField", () => {
  it("accepts multiple vaccination documents and keeps long filenames usable", () => {
    const onChange = vi.fn();
    render(
      <CareDocumentsField documents={[]} onChange={onChange} recordType="Vaccine" />
    );

    expect(screen.getByText(/vaccination certificate or card/i)).toBeTruthy();
    const files = [
      new File(["pdf"], "a-very-long-vaccination-certificate-file-name-that-must-wrap.pdf", {
        type: "application/pdf",
      }),
      new File(["image"], "clinic-card.png", { type: "image/png" }),
    ];
    fireEvent.change(screen.getByLabelText("+ Add document"), {
      target: { files },
    });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        fileName: files[0].name,
        category: "VaccinationDocument",
        sortOrder: 0,
        sourceFile: files[0],
      }),
      expect.objectContaining({
        fileName: files[1].name,
        category: "VaccinationDocument",
        sortOrder: 1,
        sourceFile: files[1],
      }),
    ]);
  });

  it("rejects unsupported and oversized files with an accessible error", () => {
    const onChange = vi.fn();
    const oversized = new File(["x"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });
    render(
      <CareDocumentsField documents={[]} onChange={onChange} recordType="Vet Visit" />
    );

    fireEvent.change(screen.getByLabelText("+ Add document"), {
      target: {
        files: [
          new File(["text"], "notes.txt", { type: "text/plain" }),
          oversized,
        ],
      },
    });

    expect(screen.getByRole("alert").textContent).toContain("PDF, JPG, or PNG");
    expect(screen.getByRole("alert").textContent).toContain("under 10MB");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes one selected document without disturbing the rest", () => {
    const onChange = vi.fn();
    const documents = [document("a", "certificate.pdf", 0), document("b", "card.png", 1)];
    render(
      <CareDocumentsField documents={documents} onChange={onChange} recordType="Vaccine" />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove certificate.pdf" })
    );

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "b", sortOrder: 0 }),
    ]);
  });
});

function document(id: string, fileName: string, sortOrder: number): CareDocument {
  return {
    id,
    fileName,
    contentType: fileName.endsWith(".pdf") ? "application/pdf" : "image/png",
    fileSizeBytes: 2048,
    category: "VaccinationDocument",
    sortOrder,
  };
}
