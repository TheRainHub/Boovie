import type { Metadata, Viewport } from "next";
import { Geologica, Inter, JetBrains_Mono, Literata, Martian_Mono, Old_Standard_TT } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { withBase } from "@/lib/basePath";
import { THEME_STORAGE_KEY } from "@/lib/themeKey";
import "./globals.css";

// Chrome: Old Standard TT (classic Russian book face) for titles, Geologica for UI, Martian Mono for readouts.
const display = Old_Standard_TT({ subsets: ["latin", "cyrillic"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--nf-display", display: "swap" });
const ui = Geologica({ subsets: ["latin", "cyrillic"], axes: ["SHRP"], variable: "--nf-ui", display: "swap" });
const numerals = Martian_Mono({ subsets: ["latin", "cyrillic"], axes: ["wdth"], variable: "--nf-num", display: "swap" });
// Reader typefaces offered in the typography drawer.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains", display: "swap" });
const literata = Literata({ subsets: ["latin", "cyrillic"], variable: "--font-literata", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Titan — книги и аудиокниги", template: "%s · Titan" },
  description: "Офлайн-читалка PDF, FB2, EPUB и плеер аудиокниг MP3/M4B с магазином классики.",
  applicationName: "Titan",
  manifest: withBase("/manifest.webmanifest"),
  appleWebApp: { capable: true, title: "Titan", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: withBase("/icons/favicon-64.png"), sizes: "64x64", type: "image/png" }],
    apple: [{ url: withBase("/icons/apple-touch-icon.png"), sizes: "180x180" }],
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
      className={`${display.variable} ${ui.variable} ${numerals.variable} ${inter.variable} ${mono.variable} ${literata.variable}`}
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
