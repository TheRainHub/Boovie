import type { Metadata, Viewport } from "next";
import { Golos_Text, Inter, JetBrains_Mono, Literata } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { BASE_PATH, withBase } from "@/lib/basePath";
import { THEME_STORAGE_KEY } from "@/lib/themeKey";
import "./globals.css";

// Interface: Golos Text (a Russian grotesque made for screens) at every size, from the big navigation words down.
const ui = Golos_Text({ subsets: ["latin", "cyrillic"], variable: "--nf-ui", display: "swap" });
// Reader typefaces offered in the typography drawer.
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains", display: "swap" });
const literata = Literata({ subsets: ["latin", "cyrillic"], variable: "--font-literata", display: "swap" });

// Absolute URLs for link previews: NEXT_PUBLIC_SITE_URL, else Vercel's production domain, else the current one.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://boovie-kappa.vercel.app")
).replace(/\/$/, "");
const TITLE = "Boowie — книги и аудиокниги";
const DESCRIPTION = "Читалка PDF, FB2 и EPUB и плеер аудиокниг MP3 и M4B. Книги хранятся в телефоне и открываются без интернета, а в магазине ждёт бесплатная классика.";

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}${BASE_PATH}/`),
  title: { default: TITLE, template: "%s · Boowie" },
  description: DESCRIPTION,
  applicationName: "Boowie",
  openGraph: {
    type: "website",
    siteName: "Boowie",
    locale: "ru_RU",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Boowie — книги и аудиокниги" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.jpg"] },
  manifest: withBase("/manifest.webmanifest"),
  appleWebApp: { capable: true, title: "Boowie", statusBarStyle: "black-translucent" },
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
