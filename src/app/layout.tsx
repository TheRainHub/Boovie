import type { Metadata, Viewport } from "next";
import { Golos_Text, Inter, JetBrains_Mono, Literata } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { BASE_PATH, PAGE_BASE, SITE_LANG, withBase } from "@/lib/basePath";
import { LANG_KEY, RUSSIAN_READERS } from "@/lib/i18n/detect";
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
// The page and its link preview in the language this copy of the site was built in.
const EN = SITE_LANG === "en";
const TITLE = EN ? "Boowie — books and audiobooks" : "Boowie — книги и аудиокниги"; // i18n-ignore
const DESCRIPTION = EN
  ? "A reader for PDF, FB2 and EPUB and a player for MP3 and M4B audiobooks. Books live on your phone and open offline, and the store has free classics."
  : /* i18n-ignore */ "Читалка PDF, FB2 и EPUB и плеер аудиокниг MP3 и M4B. Книги хранятся в телефоне и открываются без интернета, а в магазине ждёт бесплатная классика.";

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}${BASE_PATH}/`),
  title: { default: TITLE, template: "%s · Boowie" },
  description: DESCRIPTION,
  applicationName: "Boowie",
  openGraph: {
    type: "website",
    siteName: "Boowie",
    locale: EN ? "en_US" : "ru_RU",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.jpg"] },
  // Each language has its manifest (the English one opens the English site); the icons are shared.
  manifest: `${PAGE_BASE}/manifest.webmanifest`,
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

/**
 * The right language's site before anything shows: the one chosen in the settings, or else the browser's (only
 * from the Russian site — an English address opened on purpose stays English). Not in the apps (they choose on the
 * device) and not for search engines' robots (each site is indexed as it is).
 */
const langScript = `(function(){try{var w=window,C=w.Capacitor;if(C&&C.isNativePlatform&&C.isNativePlatform())return;if(/bot|crawl|spider|slurp|preview|lighthouse/i.test(navigator.userAgent))return;var here=${JSON.stringify(SITE_LANG)},want=null;try{want=localStorage.getItem(${JSON.stringify(LANG_KEY)})}catch(e){}if(want!=="ru"&&want!=="en"){if(here==="en")return;var l=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""];want=!l.length||l.some(function(x){return ${RUSSIAN_READERS.toString()}.test(x)})?"ru":"en"}if(want===here)return;var b=${JSON.stringify(BASE_PATH)},e=b+"/en",p=location.pathname,r;if(here==="en"){r=p===e||p.indexOf(e+"/")===0?p.slice(e.length):p;location.replace(b+(r||"/")+location.search+location.hash)}else{r=b&&(p===b||p.indexOf(b+"/")===0)?p.slice(b.length):p;location.replace(e+(r||"/")+location.search+location.hash)}}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={SITE_LANG}
      data-theme="light"
      suppressHydrationWarning
      className={`${ui.variable} ${inter.variable} ${mono.variable} ${literata.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: langScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
