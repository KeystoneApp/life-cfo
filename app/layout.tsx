import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClientProviders } from "@/components/ClientProviders";

function resolveMetadataBase() {
  const candidate = (process.env.NEXT_PUBLIC_SITE_URL || "https://life-cfo.com").trim();
  try {
    return new URL(candidate);
  } catch {
    return new URL("https://life-cfo.com");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Life CFO",
  description: "Decision Intelligence.",
  icons: {
    icon: "/brand/lifecfo-logo-icon-only.svg",
    shortcut: "/brand/lifecfo-logo-icon-only.svg",
    apple: "/brand/lifecfo-social-icon.png",
  },
  openGraph: {
    title: "Life CFO",
    description: "Decision Intelligence.",
    images: ["/brand/lifecfo-social-cover.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Life CFO",
    description: "Decision Intelligence.",
    images: ["/brand/lifecfo-social-cover.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
