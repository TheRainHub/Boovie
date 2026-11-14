# Boowie — offline e-book reader & audiobook player

An installable iOS/Android PWA and native iOS/Android apps (Next.js App Router · TypeScript · Tailwind CSS v4 ·
Capacitor) that reads
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
- **Russian and English** — the interface speaks either (Settings → «Язык · Language»; the first choice follows the
  phone's language). Strings are written in Russian where they are used and looked up in `src/lib/i18n/en.ts`;
  `npm test` fails if one has no English. The store has English descriptions, titles and cover credits too, and
  finds books by their names in both languages.
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
  into one MP3 per chapter and saved as the book's companion edition, so «Читать / Слушать» works with it. Every
  voiced piece is saved as it arrives: stop at any time, «Послушать готовое» puts what is voiced so far together as
  an audiobook, and «Продолжить озвучку» picks up from the next piece; the full audiobook later replaces the partial
  one at the same listening position. Standard Ebooks licence pages are not voiced. It runs while the app is open.
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
  signing in on a device moves into the account. See *Accounts* below.
- **Library across devices** — with an account, the books, the place in each (page, chapter, minute), bookmarks,
  finished chapters and the user's renames are in the account. Another device lists the account's books under
  *В аккаунте*: store and Librarr books download from there and open at the same place; the user's own files are
  matched by content (the same file added on two devices is one book) and go to the account's cloud (below). A
  paused player moves to a newer place from another device; an open reader asks first. Deleting asks: from this
  device only, or everywhere. Everything is written on the device as it happens; the server is asked only when
  the app leaves the screen, when playback pauses (and every 10 minutes of uninterrupted playback), and when the
  app opens — uploads carry only what changed, downloads only what the server got since the last time
  (`src/lib/library/cloud.ts`, `src/lib/account/librarySync.ts`).
- **Итоги года** — the year's reading and listening as full-screen stories in the spirit of Spotify Wrapped:
  time with books (and how it split between reading and listening), days with books, the longest streak and the
  biggest day, month by month, the book of the year in its cover's colour, the top five, finished books, pages
  (as a stack) and the time playback speed saved, the author of the year, a reader type; then a summary picture
  (1080 × 1920) to share — the system share sheet in the apps, Web Share or a download in the browser. Tap to go
  on or back, hold to pause. Counted on the device from the profile's statistics (`src/lib/stats/wrapped.ts`);
  offered in the profile all year and on the home screen in December and January.
- **Dictionary in the reader** — select a word (a long press on a phone, a double click on a computer) and its
  meaning opens in a card in the page's colours: Russian words explained in Russian with usage labels («устар.»,
  «разг.»), the stress and an example; English words with Russian translations for each of their meanings (with a
  short English note saying which meaning), labels («устар.», «брит.») and the transcription — or the English
  definition where no Russian one is known. Inflected forms and other spellings lead to their word
  («кавалеристом» → «кавалерист», «went» → «go», «colour» → «color»); when the text's word is several words' form,
  all of them are offered, those with Russian meanings first. The data is Wiktionary (CC BY-SA 4.0, via
  wiktextract): from Russian Wiktionary 429 000 Russian words with 2.6 million forms; for English, the translation
  tables of English Wiktionary merged with Russian Wiktionary's English words, 572 000 words in all, packed
  by `scripts/dictionary/build_dict.py` into small compressed shards served by the files Worker
  (`/dict/v1/…`, Range requests). A lookup reads one shard of 10–50 KB and keeps it on the device, so words looked
  up before work offline (`src/lib/dictionary/lookup.ts`, `src/components/reader/DictionaryCard.tsx`).
- **Bookshelf** — the library can also be a bookshelf (the shelf button next to the filters, remembered on the
  device): every book a spine in its cover's colour (or a cloth colour of the store's palette when the cover has
  little colour), as thick as the book is long, with the title along it (Russian spines read from the bottom up,
  English ones from the top down) and the author on thick ones, a headphones mark on audiobooks, a ribbon over the
  top of a book being read and a tick on a finished one; rows of spines stand on wooden shelves with a bookend. A
  tap opens the book, a long press (or a right click) its menu (`src/components/library/Bookshelf.tsx`).
- **Reading map** — in the profile, the year as twelve small month calendars, each day shaded by the time spent
  with books (from under 15 minutes to over two hours); a tap on a day tells its time and books, and the arrows go
  through the years (`src/lib/stats/yearMap.ts`, `src/components/profile/YearMap.tsx`).
- **Achievements** — 17 badges with levels (bronze, silver, gold, then emerald and ruby for the long ones): books
  finished, hours with books, days in a row, a marathon day, pages, listening hours, time saved by speed, reading and
  listening on one day, bookish weekends, classics from the store, authors, days with books, the size of the
  library, bookmarks, and two secret ones. They are worked out on the device from the same statistics, library and
  bookmarks (so every device of an account agrees, with nothing extra stored or synced), with the day each level was
  reached; a level reached today or yesterday is announced once with its badge (`src/lib/stats/achievements.ts`,
  `src/components/profile/Achievements.tsx`, `Badge.tsx`).
- **Daily goal** — minutes a day with books (5 to 90, 20 until changed, or none), reading and listening together
  and from all of an account's devices: a ring with today's minutes on the home screen and in the profile, this
  week's days with the goal reached and the days in a row; reaching it is announced once a day
  (`src/lib/stats/goal.ts`, `src/components/home/GoalCard.tsx`).
- **Quotes** — select a passage in the text (more than one word; a single word still opens the dictionary) and
  keep it as a quote or share it as a picture (1080 × 1350: the passage in the reader's serif on the cover's colour,
  the book and its author underneath; the system share sheet in the apps, Web Share or a download in the browser).
  Kept quotes are marked in the text, listed in the contents under *Закладки*, open with a tap (share, copy,
  delete) and travel with the book's bookmarks to the account's other devices — no new tables: a quote is a
  bookmark with the passage and its place in the chapter's text (`src/lib/reader/quotes.ts`,
  `src/lib/reader/quoteImage.ts`, `src/components/reader/Quotes.tsx`).
- **Sounds for reading** — rain, a storm, a fireplace, the sea, a forest, a summer night and a train while a book is
  open (the button in the reader's bar), as a mixer: each sound is a tall pill like the phone's own volume control,
  filling from the bottom — drag it up or down for its level, tap to switch it on or off, arrow keys work too — so
  rain can go with the fireplace; «Тишина» stops them all. They are synthesised on the device with no files or
  network: filtered noise and small events (drops, crackles, waves, birds, crickets, wheels over rail joints)
  rendered into a 20–40 s loop whose end fades into its start, levelled to one loudness and played through Web Audio,
  each through its own gain, with a gentle limiter after the mix. The levels are remembered; the sounds stop when
  the book is closed and come back in the next one at the first touch (`src/lib/audio/ambientSynth.ts`,
  `src/lib/audio/ambient.ts`, `src/components/reader/AmbientSheet.tsx`).
- **Own files in the cloud** — books the user added (and voiced editions) are uploaded in the background to
  Cloudflare R2 through a small Worker (`workers/files`), one at a time while the app is open, in 50 MB parts that
  survive a restart, not over mobile data where the system tells; a book already there (uploaded from another
  device) isn't sent again. Another device downloads it from *В аккаунте*. The Worker checks the Supabase session
  and keeps each account in its own folder, with a 20 GB limit; deleting a book everywhere deletes its files.
  It can be turned off in Settings → *Облако* (`src/lib/account/cloudFiles.ts`).
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
npm run cap:sync     # build, then copy the export and the plugins into android/ and ios/
```

## Apps (iOS and Android)

The same static export runs in Capacitor shells (`android/`, `ios/`, `capacitor.config.ts`). What differs in the
apps:

- **Native book player** — `native/boowie-player`, a local Capacitor plugin: Media3/ExoPlayer in a
  `MediaSessionService` on Android, AVPlayer with `MPNowPlayingInfoCenter` / `MPRemoteCommandCenter` on iOS. It
  plays the book's files as one timeline and keeps going with the screen locked or the app in the background:
  moving on to the next file, lock-screen and notification controls (−15 s, play/pause, +30 s, chapters on iOS),
  pausing for calls and unplugged headphones, the sleep timer with its fade-out, the saved place and the counters
  for the statistics. `src/lib/audio/player.ts` drives it in place of the `<audio>` element; the UI is the same.
- **Files** — audio and other large files go to the app's own files (`src/lib/storage/nativeFiles.ts`), where the
  native player can read them; the WebView loads them through Capacitor's local server.
- No service worker; Android's back button closes sheets, goes back, and on the first page sends the app to the
  background (a playing book goes on). Confirmation and password-reset mails link to the website.

Build: `npm run cap:sync`, then `cd android && ./gradlew assembleDebug` (JDK 21, Android SDK 36) or open
`ios/App/App.xcodeproj` in Xcode. The **Apps** workflow (`.github/workflows/apps.yml`) builds both on every push that
touches the app: an Android debug APK in the run's artifacts, and an iOS simulator build that checks the native
code compiles (running on an iPhone needs an Apple developer account for signing). The apps are built with the
accounts' Supabase project (its URL and publishable key are in the workflow; repository *variables* of the same
names, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, take precedence).

## Deploy

**Vercel** (primary): import the repository at https://vercel.com/new — `vercel.json` sets the build
(`npm ci` → `npm run build`) and serves `out/` as a static site, with no-cache for the service worker and
immutable caching for hashed chunks. Every push to `main` redeploys; pull requests get preview URLs.

**Accounts** (optional — without them the profile and statistics work on each device alone):

1. Create a project at https://supabase.com (free plan is enough), or in Vercel → the project → *Storage* →
   *Supabase* (it creates one and adds the env vars below for you).
2. Supabase → *SQL Editor* → paste `supabase/schema.sql` → *Run* (the `activity`, `library` and `progress` tables
   with row-level security). Run it again after an update that changes it: it only adds what is missing.
3. Supabase → *Authentication* → *URL Configuration*: *Site URL* = the site's address (e.g.
   `https://boovie-kappa.vercel.app`), and add `https://boovie-kappa.vercel.app/profile/` to *Redirect URLs*
   (confirmation and password-reset links land there). To let people in without confirming their email,
   turn off *Authentication* → *Sign In / Providers* → *Email* → *Confirm email*.
4. Vercel → the project → *Settings* → *Environment Variables*: `NEXT_PUBLIC_SUPABASE_URL` (Project URL) and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon / publishable key — it is public by design; access is limited by the
   row-level security above). Redeploy.

**Own files in the cloud** (optional — without it own files stay on their device): a Cloudflare account with an
R2 bucket `boowie`, then `cd workers/files && npx wrangler deploy` (set `SUPABASE_URL` in `wrangler.toml` to the
project's URL). The app expects the Worker at `NEXT_PUBLIC_FILES_URL` (default
`https://boowie-files.theraintv94.workers.dev`); the Worker's `ALLOWED_ORIGINS` lists the site's and the apps'
origins.

**Dictionary data** (once, or for a new build): download the Russian and English extracts of Russian Wiktionary
from https://kaikki.org/ruwiktionary/ (`Русский`, `Английский` → JSONL) and English Wiktionary's English words from
https://kaikki.org/dictionary/English/ (3 GB), run
`python3 scripts/dictionary/build_dict.py ru.jsonl en.jsonl out/ English.jsonl` and upload the four files to the R2 bucket
under `dict/<version>/`; a new build takes a new version (and `VERSION` in `src/lib/dictionary/lookup.ts`).

**GitHub Pages** (optional): `.github/workflows/deploy-pages.yml`, run manually, builds with
`NEXT_PUBLIC_BASE_PATH=/Boovie` for https://therainhub.github.io/Boovie/. Any other static host:
`npm run build` and upload `out/` (set `NEXT_PUBLIC_BASE_PATH` when serving from a sub-path).

## Layout

```
src/app/                 routes: / (Слушаю/Читаю), /library, /store, /book?id=…&mode=read|listen, /profile, /settings
src/components/profile   ProfileView, ActivityChart, YearMap, Achievements, Badge, AuthSheet, Avatar
src/lib/stats            activity tracking (daily rows), reading-time hook, profile summary, year map, achievements, Итоги года
src/lib/account          device identity, Supabase session and statistics sync
supabase/schema.sql      the accounts' tables (statistics, library, places) and their row-level security
src/components/ui        Button, IconButton, Slider, Segmented, ChipTabs, Sheet, BookCover, CoverBackdrop, Toaster
src/components/shell     AppShell, TopNav, ImportTray
src/components/home      HomeView
src/components/library   LibraryView, Bookshelf, ImportPicker, CoverPicker
src/components/store     StoreView, BookDetailsSheet, StoreCard
src/components/reader    TextReader, PdfReader, TocDrawer, TypographyDrawer, ReaderChrome, DictionaryCard, AmbientSheet
src/components/player    MiniPlayer, FullPlayer, PlayerPanel
src/components/book      BookScreen (dual mode)
src/lib/parsers          fb2Parser, epubParser, pdfParser, audioParser, audioMetadata, sanitize
src/lib/storage          Dexie schema, OPFS/IndexedDB blob store, app files (nativeFiles)
native/boowie-player     the apps' native book player (Capacitor plugin: Android Java, iOS Swift)
workers/files            Cloudflare Worker: the accounts' own files in R2, and the dictionary data
scripts/dictionary       the reader's dictionary, built from Russian Wiktionary
android/, ios/           Capacitor shells
src/lib/library          repository (books, progress, bookmarks), importer, folder grouping, live-query hooks
src/lib/covers           cover tone (colour), online lookup, generated covers
src/lib/audio            player engine (web <audio> or the native plugin), Media Session, store previews, sounds for reading
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
