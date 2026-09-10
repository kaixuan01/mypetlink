/**
 * Small brand decorations — paw prints, sparkles, soft blobs.
 *
 * The landing page got busy the first time because every idea grew its own
 * container. Decoration is the easiest way to repeat that mistake, so the
 * rules are enforced here rather than left to each caller:
 *
 * 1. Corners and margins only. Never between a heading and its body, never
 *    inside a card, never over a call to action.
 * 2. Opacity and size are capped below. A decoration that reads as content is
 *    too strong.
 * 3. Always inert: hidden from assistive technology and untouchable.
 * 4. A section showing Linko gets no other decoration.
 */

type DecorationShape = "paw" | "sparkle" | "blob";

const MAX_SIZE = 48;
const MAX_OPACITY = 0.35;

const shapes: Record<DecorationShape, { path: string; fill: string }> = {
  // Four toes over a pad — the same paw the brand already uses in .brand-paw-dots.
  paw: {
    path: "M7 8.5a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0Zm6.3-2.2a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0Zm6.3 2.2a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0ZM11 11.4c3 0 5.6 2.4 5.6 4.9 0 1.9-1.6 2.9-3.3 2.9-1 0-1.6-.4-2.3-.4s-1.3.4-2.3.4c-1.7 0-3.3-1-3.3-2.9 0-2.5 2.6-4.9 5.6-4.9Z",
    fill: "var(--color-pet-coral, #ff7a6e)",
  },
  sparkle: {
    path: "M12 2.5c.5 4.4 2.6 6.6 7 7-4.4.5-6.5 2.6-7 7-.5-4.4-2.6-6.5-7-7 4.4-.4 6.5-2.6 7-7Z",
    fill: "var(--color-pet-sky, #7cc6f4)",
  },
  blob: {
    path: "M12 2.6c4 0 8 3.4 8 8.2 0 5-3.5 10.6-8 10.6S4 15.8 4 10.8c0-4.8 4-8.2 8-8.2Z",
    fill: "var(--color-pet-sky, #7cc6f4)",
  },
};

export function BrandDecoration({
  shape,
  size = 32,
  opacity = 0.25,
  className = "",
  style,
}: {
  shape: DecorationShape;
  size?: number;
  opacity?: number;
  /** Position it in a corner or margin. Absolute positioning is the caller's job. */
  className?: string;
  style?: React.CSSProperties;
}) {
  const { path, fill } = shapes[shape];
  const rendered = Math.min(size, MAX_SIZE);

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
      fill="none"
      focusable="false"
      height={rendered}
      role="presentation"
      style={{ opacity: Math.min(opacity, MAX_OPACITY), ...style }}
      viewBox="0 0 24 24"
      width={rendered}
    >
      <path d={path} fill={fill} />
    </svg>
  );
}
