// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/components/qr/QrCodeCard", () => ({
  QrCodeCard: ({ title, targetPath }: { title: string; targetPath: string }) => (
    <div>
      <span>{title}</span>
      <a href={targetPath}>View target</a>
    </div>
  ),
}));

const { QrCodeButton } = await import("./QrCodeButton");

afterEach(() => {
  cleanup();
  expect(document.body.style.overflow).toBe("");
});

it("moves focus into the named dialog, closes with Escape, and restores focus", async () => {
  render(
    <QrCodeButton
      fileNameBase="milo-profile"
      label="QR code"
      targetPath="/p/milo-code?share=version"
      title="Milo's profile QR"
    />
  );

  const trigger = screen.getByRole("button", { name: "QR code" });
  trigger.focus();
  fireEvent.click(trigger);

  expect(
    screen.getByRole("dialog", { name: "Milo's profile QR" })
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close" })).toBe(document.activeElement);
  expect(document.body.style.overflow).toBe("hidden");

  fireEvent.keyDown(document, { key: "Escape" });

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(trigger).toBe(document.activeElement);
});
