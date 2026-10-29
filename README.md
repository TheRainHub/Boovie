# Boowie — offline e-book reader & audiobook player

An installable iOS/Android PWA (Next.js App Router · TypeScript · Tailwind CSS v4, Capacitor-ready) that reads
**EPUB, FB2 and PDF**, plays **MP3 / M4B / M4A audiobooks**, and ships with a built-in store of 82 public-domain
books and audiobooks that work out of the box — fully offline once downloaded.

Design: **every book in its own colour.** Navigation is three big words at the top («Слушаю/Читаю · Книги ·
Магазин»), the home screen, player and store details are painted in the colour of the current cover (with the cover
blurred behind), controls are pills, type is Golos Text. Light theme: warm paper with a terracotta accent; dark
theme: a warm near-black with cream. Layouts adapt from phones (iPhone 14 Pro Max) to 8″ and 11″ tablets; in
landscape the player and the store details go two-column and the reader shows a two-page spread.

## Features

- **Слушаю / Читаю (home)** — the book you are on: a full player for audiobooks, the reading position and a
  «continue» button for texts, plus the other books you have started.
- **Книги (library)** — filters Все / Читаю / Слушаю / Файлы, a «continue» card in the book's colour, a cover grid
  with progress, «Добавить»: files (PDF/FB2/EPUB/MP3/M4B/ZIP, any mix) or a whole folder (one audiobook per
  folder, one file per chapter, CD/Disc subfolders merged, cover from the folder or found by name). An audiobook
  series tagged as one album («Ведьмак») takes each book's name from the file, folder or title tag when that name
  says more; «…» → «Название и главы» renames the book, author, narrator and chapters (statistics follow the book).
- **Real parsers** (`src/lib/parsers/`), no mocks:
  - FB2 — `DOMParser` + `TextDecoder` (UTF-8, windows-1251, koi8-r, mislabelled files), `.fb2.zip`, base64 cover,
    annotation, nested `<section>` → chapters with part groups, footnotes body.
  - EPUB 2/3 — JSZip, `container.xml` → OPF manifest/spine, `nav.xhtml` or `toc.ncx`, split at TOC fragments,
    images extracted as stored assets, internal links rewritten to chapter jumps, allowlist sanitizer.
  - PDF — pdf.js outline → chapters; without an outline, heading-size detection; last resort 15-page sections.
  - Audio — ID3v2.2–2.4 (TIT2/TPE1/TALB/TRCK/APIC, CHAP/CTOC chapters), MPEG Xing/Info/VBRI duration,
    MP4 `ilst` tags, QuickTime chapter track and Nero `chpl`; FairPlay DRM detection; long chapterless files get
    20-minute markers; streaming ZIP reader (ZIP64, CP866 names).
- **Storage** — Dexie (IndexedDB) tables `books`, `chapters`, `progress`, `files`; binaries in the Origin Private
  File System when main-thread writes are supported, otherwise as IndexedDB Blobs. Persistent-storage request.
- **Reader** — CSS-columns pagination (two-page spread on landscape tablets) or continuous scroll, tap zones,
  swipe, keyboard, TOC with completion marks, bookmarks, typography sheet (Inter / Georgia / JetBrains Mono, size,
  leading, margins, paper: Бумага, Сепия, Ночь, Чёрная). Position is saved on every page turn.
- **PDF viewer** — page-by-page or continuous, zoom, dark-mode invert, outline TOC.
- **Audio player** — persistent engine outside React, floating mini player, full-screen player, chapters and
  audio bookmarks with notes, speeds 0.75–2×, −15 s / +30 s, sleep timer (15/30/45/60 min, end of chapter),
  Media Session (lock screen, Control Center, AirPods).
- **Read ↔ Listen** — books with a companion edition get a «Читать / Слушать» toggle; the last-used edition wins
  and the position is mapped by chapter title and fraction.
- **Store** — sections and categories, search, featured cards in each cover's colour, rails, top chart, details
  with a sample stream and «Скачать в библиотеку» (the download runs through the same parsers as local files).
- **Covers** — embedded, from the folder, from the store, found online by title (Apple Books, Google Books, Open
  Library) or generated; the colour of every cover tints its screens (`src/lib/covers/tone.ts`).
- **ElevenLabs voiceover** — any FB2/EPUB in the library can be turned into an audiobook with your own ElevenLabs
  API key (Settings → Сервисы; the key stays in this device's storage and is sent only to api.elevenlabs.io).
  Pick a voice and a model (Multilingual v2 or the cheaper Flash v2.5); the sheet shows the characters and credits
  before you start. Chapters are synthesised in ~2 400-character pieces with neighbouring text as context, joined
  into one MP3 per chapter and saved as the book's companion edition, so «Читать / Слушать» works with it. Stop at
  any time: finished chapters are kept and «Продолжить озвучку» picks up from there. It runs while the app is open.
- **Librarr** — connect a [Librarr](https://github.com/JeremiahM37/librarr) server (HTTPS address + `API_KEY`) and
  its library appears as a store tab, read from its OPDS feed (`/opds/books`). Any EPUB/FB2/PDF/MP3/M4B there can be
  downloaded into Boowie and then works offline like a local file. Boowie only reads the library; searching and
  grabbing new books stays in Librarr. The browser blocks an https page from talking to an http server, so a home
  server needs an HTTPS address (Tailscale, Cloudflare Tunnel, a reverse proxy).
- **Profile & statistics** (`/profile/`, the avatar at the end of the top navigation) — time spent listening
  and reading, pages read, books finished, days in a row, a per-day (per-month) chart and the books you spent
  the most time with, for a week, a month or all time. Listening counts playback that actually ran forward (seeks
  don't count); reading counts time the book is on screen and was touched in the last few minutes; pages count
  forward page turns. Rows are kept per day and book in IndexedDB (`activity`), so it all works without an account.
- **Accounts** (Supabase Auth: email + password, name, password reset) — statistics are saved to the account and
  add up across devices: each device uploads its own daily rows and downloads the others'. Time recorded before
  signing in on a device moves into the account. Books and their files stay on each device. See *Accounts* below.
- **PWA** — static export, generated service worker (precached shell, cache-first chunks, offline navigation),
  `manifest.webmanifest`, Apple status-bar meta, safe-area insets everywhere.

## Scripts

```bash
npm install          # also copies the pdf.js worker into public/
npm run dev          # development server
npm run build        # static export to out/ + service worker generation
npm start            # serve out/ locally
npm test             # parser tests against the bundled store files (Node + linkedom)
npm run lint && npm run typecheck
npm run cap:sync     # after `npx cap add ios|android`
```

## Deploy

**Vercel** (primary): import the repository at https://vercel.com/new — `vercel.json` sets the build
(`npm ci` → `npm run build`) and serves `out/` as a static site, with no-cache for the service worker and
immutable caching for hashed chunks. Every push to `main` redeploys; pull requests get preview URLs.

**Accounts** (optional — without them the profile and statistics work on each device alone):

1. Create a project at https://supabase.com (free plan is enough), or in Vercel → the project → *Storage* →
   *Supabase* (it creates one and adds the env vars below for you).
2. Supabase → *SQL Editor* → paste `supabase/schema.sql` → *Run* (the `activity` table with row-level security).
3. Supabase → *Authentication* → *URL Configuration*: *Site URL* = the site's address (e.g.
   `https://boovie-kappa.vercel.app`), and add `https://boovie-kappa.vercel.app/profile/` to *Redirect URLs*
   (confirmation and password-reset links land there). To let people in without confirming their email,
   turn off *Authentication* → *Sign In / Providers* → *Email* → *Confirm email*.
4. Vercel → the project → *Settings* → *Environment Variables*: `NEXT_PUBLIC_SUPABASE_URL` (Project URL) and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon / publishable key — it is public by design; access is limited by the
   row-level security above). Redeploy.

**GitHub Pages** (optional): `.github/workflows/deploy-pages.yml`, run manually, builds with
`NEXT_PUBLIC_BASE_PATH=/Boovie` for https://therainhub.github.io/Boovie/. Any other static host:
`npm run build` and upload `out/` (set `NEXT_PUBLIC_BASE_PATH` when serving from a sub-path).

## Layout

```
src/app/                 routes: / (Слушаю/Читаю), /library, /store, /book?id=…&mode=read|listen, /profile, /settings
src/components/profile   ProfileView, ActivityChart, AuthSheet, Avatar
src/lib/stats            activity tracking (daily rows), reading-time hook, profile summary
src/lib/account          device identity, Supabase session and statistics sync
supabase/schema.sql      the accounts' statistics table and its row-level security
src/components/ui        Button, IconButton, Slider, Segmented, ChipTabs, Sheet, BookCover, CoverBackdrop, Toaster
src/components/shell     AppShell, TopNav, ImportTray
src/components/home      HomeView
src/components/library   LibraryView, ImportPicker, CoverPicker
src/components/store     StoreView, BookDetailsSheet, StoreCard
src/components/reader    TextReader, PdfReader, TocDrawer, TypographyDrawer, ReaderChrome
src/components/player    MiniPlayer, FullPlayer, PlayerPanel
src/components/book      BookScreen (dual mode)
src/lib/parsers          fb2Parser, epubParser, pdfParser, audioParser, audioMetadata, sanitize
src/lib/storage          Dexie schema, OPFS/IndexedDB blob store
src/lib/library          repository (books, progress, bookmarks), importer, folder grouping, live-query hooks
src/lib/covers           cover tone (colour), online lookup, generated covers
src/lib/audio            player engine, Media Session, store previews
src/lib/integrations     ElevenLabs API, speech chunking, voiceover jobs, OPDS parser, Librarr client
src/components/integrations  ElevenLabsSettings, VoiceoverSheet, LibrarrSettings, LibrarrShelf
scripts/content          store content pipeline (see its README for sources and licenses)
```

## Store content

Everything in `public/store/` is generated from public-domain sources by `scripts/content/` — Russian classics
from the RussianNovels corpus, English titles from Standard Ebooks (CC0), narration by the RHVoice speech
synthesizer, covers made from public-domain paintings (credited on each book's store page). A book goes in only if it is in
the public domain in Russia, the EU and the US alike: its author and translator died more than 70 years ago and it
was published before 1931. See
[`scripts/content/README.md`](scripts/content/README.md).

Note: headless Chromium builds without proprietary codecs cannot decode AAC, so the M4B sample plays on
Safari/Chrome/Android but not in a stock Playwright Chromium; the MP3 audiobooks play everywhere.
