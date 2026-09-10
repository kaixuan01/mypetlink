import Image from "next/image";

/**
 * Linko, the MyPetLink mascot.
 *
 * Linko is a supporting visual, never a load-bearing one: the text beside her
 * always carries the full meaning on its own, so a blocked or slow image never
 * costs the reader anything. That rule comes from the transactional email
 * layout and applies equally here.
 *
 * She appears three times on the landing page and nowhere else — hero,
 * the reunion beat of the finder journey, and the closing call to action.
 * Adding a fourth makes her scenery rather than a character.
 */

type LinkoPose = "wave" | "celebrate";

/**
 * Source artwork is 440x440 (wave) and 240x240 (celebrate). Rendering wider
 * than half of that would upscale on a 2x display, so each pose declares the
 * largest size it still looks sharp at. Replacing these files with higher
 * resolution exports is the only change needed to lift the caps.
 */
const poses: Record<LinkoPose, { src: string; intrinsic: number; maxSharp: number }> = {
  wave: { src: "/brand/linko-hero.png", intrinsic: 440, maxSharp: 220 },
  celebrate: { src: "/brand/linko-celebrate.png", intrinsic: 240, maxSharp: 120 },
};

export function LinkoMascot({
  pose,
  size,
  alt,
  className = "",
  priority = false,
}: {
  pose: LinkoPose;
  /** Rendered CSS size. Clamped to the size this artwork stays sharp at. */
  size: number;
  /**
   * Describe what Linko is doing when she adds meaning, or pass "" when the
   * neighbouring text already says everything and she is pure decoration.
   */
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const { src, intrinsic, maxSharp } = poses[pose];
  const rendered = Math.min(size, maxSharp);

  return (
    <Image
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      className={className}
      height={intrinsic}
      priority={priority}
      src={src}
      style={{ width: rendered, height: "auto" }}
      width={intrinsic}
    />
  );
}
