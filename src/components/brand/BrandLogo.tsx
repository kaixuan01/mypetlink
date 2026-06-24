import Image from "next/image";

type BrandLogoProps = {
  dark?: boolean;
  markOnly?: boolean;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  dark = false,
  markOnly = false,
  className = "",
  priority = false,
}: BrandLogoProps) {
  if (markOnly) {
    return (
      <Image
        alt="MyPetLink"
        className={className}
        height={64}
        priority={priority}
        src="/logo-mark.svg"
        width={64}
      />
    );
  }

  return (
    <Image
      alt="MyPetLink - A safe and shareable profile for your pet."
      className={className}
      height={140}
      priority={priority}
      src={dark ? "/logo-dark.svg" : "/logo-horizontal.svg"}
      width={540}
    />
  );
}
