import type { Metadata } from "next";
import { Noto_Sans, Poppins } from "next/font/google";
import { siteConfig } from "@/config/site";
import { ServiceWakeUpState } from "@/components/ui/ServiceWakeUpState";
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
    default: "MyPetLink Malaysia | Smart Pet Profiles, QR & NFC Pet Tags",
    template: "%s | MyPetLink",
  },
  description:
    "Create a free shareable pet profile, keep important pet details together, and help lost pets get home faster with MyPetLink QR and NFC pet tags in Malaysia.",
  openGraph: {
    title: "MyPetLink Malaysia | Smart Pet Profiles, QR & NFC Pet Tags",
    description:
      "Create a free shareable pet profile and add an optional QR or QR + NFC pet tag for extra safety in Malaysia.",
    siteName: siteConfig.productName,
    url: siteConfig.url,
    locale: "en_MY",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MyPetLink pet safety and share profile",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MyPetLink Malaysia | Smart Pet Profiles, QR & NFC Pet Tags",
    description:
      "Create a free shareable pet profile and add an optional QR or QR + NFC pet tag for extra safety in Malaysia.",
    images: ["/og-image.png"],
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
      <body className="min-h-full bg-pet-cream text-pet-ink">
        {children}
        <ServiceWakeUpState />
      </body>
    </html>
  );
}
