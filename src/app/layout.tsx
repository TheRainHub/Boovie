import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Literata } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { THEME_STORAGE_KEY } from "@/lib/themeKey";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains", display: "swap" });
const literata = Literata({ subsets: ["latin", "cyrillic"], variable: "--font-literata", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Titan — книги и аудиокниги", template: "%s · Titan" },
  description: "Офлайн-читалка PDF, FB2, EPUB и плеер аудиокниг MP3/M4B с магазином классики.",
  applicationName: "Titan",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Titan", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: {
    // Next emits `mobile-web-app-capable`; older iOS versions only honor the apple-prefixed tag.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ECEEF2" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0B0D" },
  ],
};

// Resolve the saved theme before first paint (no flash of the wrong theme).
const themeScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k)||"system";if(t==="system"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      data-theme="light"
      suppressHydrationWarning
      className={`${inter.variable} ${mono.variable} ${literata.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
