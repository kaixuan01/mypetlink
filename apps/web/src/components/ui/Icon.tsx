import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "paw"
  | "tag"
  | "heart"
  | "shield"
  | "phone"
  | "pin"
  | "plus"
  | "record"
  | "settings"
  | "home"
  | "pets"
  | "qr"
  | "users"
  | "plans"
  | "logout"
  | "search"
  | "copy"
  | "more"
  | "calendar"
  | "chevron"
  | "close"
  | "menu";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

export function Icon({ name, ...props }: IconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      {...common}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

const paths: Record<IconName, ReactNode> = {
  paw: (
    <>
      <circle cx="7.5" cy="8" r="2.2" />
      <circle cx="16.5" cy="8" r="2.2" />
      <circle cx="11" cy="5.4" r="2" />
      <circle cx="13" cy="5.4" r="2" />
      <path d="M7.6 17.7c.3-3 2.2-5.1 4.4-5.1s4.1 2.1 4.4 5.1c.2 2-1.5 3.1-3.1 2.3l-.7-.3a1.6 1.6 0 0 0-1.2 0l-.7.3c-1.6.8-3.3-.3-3.1-2.3Z" />
    </>
  ),
  tag: (
    <>
      <path d="M4 12.2 12.2 4H20v7.8L11.8 20 4 12.2Z" />
      <circle cx="16.5" cy="7.5" r="1.2" />
    </>
  ),
  heart: (
    <path d="M20.4 6.8c-1.4-2.1-4.5-2.2-6.1-.3L12 9.1 9.7 6.5c-1.6-1.9-4.7-1.8-6.1.3-1.1 1.7-.8 4 .7 5.5L12 20l7.7-7.7c1.5-1.5 1.8-3.8.7-5.5Z" />
  ),
  shield: <path d="M12 3 20 6v5.5c0 4.2-2.7 7.7-8 9.5-5.3-1.8-8-5.3-8-9.5V6l8-3Z" />,
  phone: (
    <>
      <path d="M7.2 4.6 9.4 4l2 4.4-1.5 1.1a11 11 0 0 0 4.6 4.6l1.1-1.5 4.4 2-.6 2.2c-.3 1.1-1.3 1.8-2.4 1.7C9.8 18.2 5.8 14.2 5.5 7c-.1-1.1.6-2.1 1.7-2.4Z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  record: (
    <>
      <path d="M6 4h9l3 3v13H6V4Z" />
      <path d="M14 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7.8 7.8 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8L9.3 6a8 8 0 0 0-1.8 1l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.8 1l.3 3h4.8l.3-3a8 8 0 0 0 1.8-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" />
    </>
  ),
  home: (
    <>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  pets: (
    <>
      <path d="M5 19c1.8-4 4.1-6 7-6s5.2 2 7 6" />
      <circle cx="8" cy="8" r="2" />
      <circle cx="16" cy="8" r="2" />
      <path d="M12 11c1.7 0 3-1.3 3-3.2C15 5.7 13.8 4 12 4S9 5.7 9 7.8C9 9.7 10.3 11 12 11Z" />
    </>
  ),
  qr: (
    <>
      <path d="M4 4h6v6H4z" />
      <path d="M14 4h6v6h-6z" />
      <path d="M4 14h6v6H4z" />
      <path d="M14 14h2v2h-2z" />
      <path d="M18 14h2v6h-4v-2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c.8-3 2.6-4.5 5.5-4.5S13.7 17 14.5 20" />
      <path d="M16 11a3 3 0 1 0-.8-5.9" />
      <path d="M16.5 15.8c2.3.3 3.7 1.7 4 4.2" />
    </>
  ),
  plans: (
    <>
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h4" />
    </>
  ),
  logout: (
    <>
      <path d="M10 5H5v14h5" />
      <path d="m15 8 4 4-4 4" />
      <path d="M19 12H9" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4 4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="5" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>
  ),
};
