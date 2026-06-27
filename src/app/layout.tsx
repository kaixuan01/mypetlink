import type { Metadata } from "next";
import { Noto_Sans, Poppins } from "next/font/google";
import { siteConfig } from "@/config/site";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.productName,
  title: {
    default: "MyPetLink - A Safe and Shareable Profile for Your Pet",
    template: "%s | MyPetLink",
  },
  description:
    "Create a QR safety profile for your pet, manage care records, save precious memories, and order optional QR or QR + NFC smart tags.",
  openGraph: {
    title: "MyPetLink - A Safe and Shareable Profile for Your Pet",
    description:
      "Create a QR safety profile for your pet, manage care records, save precious memories, and order optional QR or QR + NFC smart tags.",
    siteName: siteConfig.productName,
    url: siteConfig.url,
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MyPetLink pet safety profile preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MyPetLink - A Safe and Shareable Profile for Your Pet",
    description:
      "Create a QR safety profile for your pet, manage care records, save precious memories, and order optional QR or QR + NFC smart tags.",
    images: ["/og-image.png"],
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${notoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-pet-cream text-pet-ink">{children}</body>
    </html>
  );
}
