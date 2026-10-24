import type { Metadata, Viewport } from "next";
import { Golos_Text, Inter, JetBrains_Mono, Literata } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { withBase } from "@/lib/basePath";
import { THEME_STORAGE_KEY } from "@/lib/themeKey";
import "./globals.css";

// Interface: Golos Text (a Russian grotesque made for screens) at every size, from the big navigation words down.
const ui = Golos_Text({ subsets: ["latin", "cyrillic"], variable: "--nf-ui", display: "swap" });
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
    { media: "(prefers-color-scheme: light)", color: "#F6F1E9" },
    { media: "(prefers-color-scheme: dark)", color: "#100D0B" },
  ],
};

// Resolve the saved theme before first paint (no flash of the wrong colours).
const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"system";if(t==="system"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      data-theme="light"
      suppressHydrationWarning
      className={`${ui.variable} ${inter.variable} ${mono.variable} ${literata.variable}`}
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
