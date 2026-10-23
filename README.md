# Titan — offline e-book reader & audiobook player

An installable iOS/Android PWA (Next.js App Router · TypeScript · Tailwind CSS v4, Capacitor-ready) that reads
**EPUB, FB2 and PDF**, plays **MP3 / M4B / M4A audiobooks**, and ships with a built-in store of 20 public-domain
books and audiobooks that work out of the box — fully offline once downloaded.

Design language: **Cold Titanium & Glass** — two themes, *Brushed Silver* (light) and *Obsidian Graphite* (dark),
frosted glass panels, machined sliders with brushed pill thumbs and tabular numerals.

## Features

- **Library (Моя полка)** — filters Все / Читаю / Слушаю / Загружено, “continue” card, drag-and-drop or Files-app
  import. Selecting several MP3s at once builds one audiobook (sorted by ID3 track tags, else natural filename order).
- **Real parsers** (`src/lib/parsers/`), no mocks:
  - FB2 — `DOMParser` + `TextDecoder` (UTF-8, windows-1251, koi8-r, mislabelled files), `.fb2.zip`, base64 cover,
    annotation, nested `<section>` → chapters with part groups, footnotes body.
  - EPUB 2/3 — JSZip, `container.xml` → OPF manifest/spine, `nav.xhtml` or `toc.ncx`, split at TOC fragments,
    images extracted as stored assets, internal links rewritten to chapter jumps, allowlist sanitizer.
  - PDF — pdf.js outline → chapters; without an outline, heading-size detection; last resort 15-page sections.
  - Audio — ID3v2.2–2.4 (TIT2/TPE1/TALB/TRCK/APIC, CHAP/CTOC chapters), MPEG Xing/Info/VBRI duration,
    MP4 `ilst` tags, QuickTime chapter track and Nero `chpl`; long chapterless files get 20-minute markers.
- **Storage** — Dexie (IndexedDB) tables `books`, `chapters`, `progress`, `files`; binaries in the Origin Private
  File System when main-thread writes are supported, otherwise as IndexedDB Blobs. Persistent-storage request.
- **Reader** — CSS-columns pagination or continuous scroll, tap zones (25 % back · 50 % HUD · 25 % forward), swipe,
  keyboard, TOC with completion marks, bookmarks, typography drawer (Inter / Georgia / JetBrains Mono, size,
  leading, margins, paper: Silver, Sepia, Carbon, OLED). Position is saved on every page turn.
- **PDF viewer** — page-by-page or continuous, zoom, dark-mode invert, outline TOC.
- **Audio player** — persistent engine outside React, mini-player above the dock, full glass player sheet, chapter
  list with per-chapter progress, speeds 0.75–2×, −15 s / +30 s, sleep timer (15/30/45/60 min with fade-out,
  end of chapter), audio bookmarks with notes, Media Session (lock screen, Control Center, AirPods).
- **Read ↔ Listen** — books with a companion edition get a «Читать / Слушать» toggle; the last-used edition wins
  and the position is mapped by chapter title and fraction.
- **Store** — tabs Обзор / Аудиокниги / Электронные книги / Топ чарты / Новинки / Бесплатная классика, category
  chips, search, bento featured carousel, shelves, details sheet with 3D cover reflection, 90-second sample
  streaming and «Скачать в библиотеку» (the download runs through the same parsers as local files).
- **PWA** — static export, generated service worker (precached shell, cache-first chunks, offline navigation),
  `manifest.webmanifest` (standalone, portrait), Apple status-bar meta, safe-area insets everywhere.

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

## Layout

```
src/app/                 routes: / (library), /store, /book?id=…&mode=read|listen, /settings
src/components/ui        GlassPanel, MetallicButton, MetalSlider, Segmented, Sheet, BookCover, Toaster
src/components/shell     AppShell, BottomDock, ImportTray
src/components/library   LibraryView, UploadDropzone
src/components/store     StoreView, BookDetailsSheet, StoreCard
src/components/reader    TextReader, PdfReader, TocDrawer, TypographyDrawer, ReaderChrome
src/components/player    MiniPlayer, FullPlayer, PlayerPanel
src/components/book      BookScreen (dual mode)
src/lib/parsers          fb2Parser, epubParser, pdfParser, audioParser, audioMetadata, sanitize
src/lib/storage          Dexie schema, OPFS/IndexedDB blob store
src/lib/library          repository (books, progress, bookmarks), importer, live-query hooks
src/lib/audio            player engine, Media Session, store previews
scripts/content          store content pipeline (see its README for sources and licenses)
```

## Store content

Everything in `public/store/` is generated from public-domain sources by `scripts/content/` — Russian classics
from the RussianNovels corpus, English titles from Standard Ebooks (CC0), narration by the RHVoice speech
synthesizer, original typographic covers. See [`scripts/content/README.md`](scripts/content/README.md).

Note: headless Chromium builds without proprietary codecs cannot decode AAC, so the M4B sample plays on
Safari/Chrome/Android but not in a stock Playwright Chromium; the MP3 audiobooks play everywhere.
