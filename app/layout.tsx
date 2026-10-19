import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaSetup from "@/components/PwaSetup";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NFL Weekly Picks",
  description: "Make your weekly NFL picks before they lock.",
  applicationName: "NFL Picks",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "NFL Picks",
    // Draw under the iPhone status bar; the bar below keeps it steel blue
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  // Use the whole iPhone screen, including behind the notch and home bar
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Steel-blue strip behind the iPhone status bar (zero height elsewhere) */}
        <div aria-hidden className="fixed inset-x-0 top-0 z-[55] h-[env(safe-area-inset-top)] bg-ink" />
        {children}
        <BottomNav />
        <PwaSetup />
      </body>
    </html>
  );
}