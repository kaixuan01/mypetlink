"use client";

import { Icon } from "@/components/ui/Icon";
import type { Pet } from "@/types";

type QRDownloadButtonProps = {
  pet: Pet;
};

const qrCells = [
  1, 1, 1, 0, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 0, 1, 1, 0, 1,
  1, 1, 1, 1, 0, 1, 1, 1, 1,
  0, 0, 1, 0, 1, 1, 0, 1, 0,
  1, 0, 0, 1, 1, 0, 1, 0, 1,
  0, 1, 1, 0, 0, 1, 0, 1, 1,
  1, 1, 1, 1, 0, 1, 1, 0, 1,
  1, 0, 1, 0, 1, 0, 0, 1, 0,
  1, 1, 1, 0, 1, 1, 1, 0, 1,
];

export function QRDownloadButton({ pet }: QRDownloadButtonProps) {
  function handleDownload() {
    const cellSize = 18;
    const gridSize = 9 * cellSize;
    const cells = qrCells
      .map((cell, index) => {
        if (!cell) {
          return "";
        }

        const x = 36 + (index % 9) * cellSize;
        const y = 52 + Math.floor(index / 9) * cellSize;

        return `<rect x="${x}" y="${y}" width="13" height="13" rx="3" fill="#1570ef" />`;
      })
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
  <rect width="240" height="300" rx="28" fill="#fff8f2" />
  <rect x="24" y="40" width="${gridSize + 24}" height="${gridSize + 24}" rx="22" fill="#ffffff" />
  ${cells}
  <text x="120" y="244" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0d1b3d">${escapeSvgText(pet.name)}</text>
  <text x="120" y="270" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#5f6b85">MyPetLink Safety Page</text>
</svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${pet.slug}-mypetlink-qr.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-pet-border bg-white px-5 py-3 text-sm font-extrabold text-pet-ink shadow-sm transition hover:bg-pet-cream active:translate-y-px"
      onClick={handleDownload}
      type="button"
    >
      <Icon name="qr" className="h-4 w-4" />
      Download QR Code
    </button>
  );
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
