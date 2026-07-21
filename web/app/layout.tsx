import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://kornellvarga.github.io/manageMe/";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const siteOrigin = new URL(siteUrl).origin;
const socialImage = new URL(`${basePath}/og.png`, `${siteOrigin}/`).toString();

export const metadata: Metadata = {
  metadataBase: new URL(`${siteOrigin}/`),
  title: "ManageMe — Kornel's focus system",
  description: "Capture what matters, choose the next useful step, and keep progress moving across every device.",
  manifest: `${basePath}/manifest.webmanifest`,
  applicationName: "ManageMe",
  openGraph: {
    type: "website",
    title: "ManageMe",
    description: "What should I do now?",
    images: [{ url: socialImage, width: 1680, height: 910, alt: "ManageMe — What should I do now?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ManageMe",
    description: "What should I do now?",
    images: [socialImage],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ManageMe",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f1e9",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
