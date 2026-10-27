import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "./phase3.css";
import "./phase31.css";
import "./familiarShift.css";
import "./historyPresentation.css";
import "./proShift.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Domino’s Shift Tracker",
  description: "Local shift, mileage, wage and fuel reimbursement tracking for delivery work.",
  applicationName: "Domino’s Shift Tracker",
  appleWebApp: {
    capable: true,
    title: "Shift Tracker",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-512.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#11100f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <Script src="/pwa-register.js" strategy="beforeInteractive" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
