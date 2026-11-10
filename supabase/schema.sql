-- Boowie accounts: run in Supabase → SQL Editor → New query → Run. Safe to run again after an update: it only
-- adds what is missing.
--
-- Sign-up, sign-in and password reset are Supabase Auth (nothing to create for them). The tables:
--  - activity — the reading and listening statistics: one row per account, device, day, book and kind
--    ("read" / "listen"). Each device uploads its own rows as absolute daily totals, so repeating an upload is
--    harmless and the profile adds the rows of all devices up.
--  - library  — the account's books (one row per book; a deleted book stays as `deleted`, so every device
--    learns of it). Store and Librarr books are downloaded again from there; files stay on the devices.
--  - progress — the place in each book, bookmarks and finished chapters.
--
-- `synced_at` is set by the server on every write: a device downloads only the rows written since its last visit.

create or replace function public.boowie_touch_synced_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

-- ── Statistics ─────────────────────────────────────────────────────────────────────────

create table if not exists public.activity (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id text not null,
  day date not null,
  book_key text not null,
  kind text not null check (kind in ('read', 'listen')),
  title text not null default '',
  author text not null default '',
  seconds integer not null default 0 check (seconds >= 0),
  pages integer not null default 0 check (pages >= 0),
  audio_seconds integer not null default 0 check (audio_seconds >= 0),
  finished boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, day, book_key, kind)
);
alter table public.activity add column if not exists synced_at timestamptz not null default now();
create index if not exists activity_user_synced on public.activity (user_id, synced_at);
drop trigger if exists activity_synced_at on public.activity;
create trigger activity_synced_at before insert or update on public.activity
  for each row execute function public.boowie_touch_synced_at();

-- ── Library ────────────────────────────────────────────────────────────────────────────

create table if not exists public.library (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- store:<id> · librarr:<entry id> · voice:<key of the text> · file:<format>:<size>:<hash>
  book_key text not null,
  kind text not null check (kind in ('store', 'librarr', 'file')),
  format text not null check (format in ('epub', 'fb2', 'pdf', 'audio')),
  title text not null default '',
  author text not null default '',
  narrator text,
  store_id text,
  cover_url text,
  duration double precision,
  file_size bigint,
  -- Librarr books: { kind, entryId, href, type } to download them again.
  source jsonb,
  -- Chapter titles changed by the user: { "<index>": "<title>" }.
  edited_chapters jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (user_id, book_key)
);
create index if not exists library_user_synced on public.library (user_id, synced_at);
drop trigger if exists library_synced_at on public.library;
create trigger library_synced_at before insert or update on public.library
  for each row execute function public.boowie_touch_synced_at();

create table if not exists public.progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_key text not null,
  chapter_index integer not null default 0,
  -- Text: the fraction of the chapter (0..1); PDF: the page.
  position double precision not null default 0,
  -- Audio: seconds from the start of the book.
  audio_timestamp double precision not null default 0,
  percentage double precision not null default 0,
  completed_chapters jsonb not null default '[]'::jsonb,
  bookmarks jsonb not null default '[]'::jsonb,
  removed_bookmarks jsonb not null default '[]'::jsonb,
  device_id text not null default '',
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (user_id, book_key)
);
create index if not exists progress_user_synced on public.progress (user_id, synced_at);
drop trigger if exists progress_synced_at on public.progress;
create trigger progress_synced_at before insert or update on public.progress
  for each row execute function public.boowie_touch_synced_at();

-- ── Access: every account sees and changes only its own rows ──────────────────────────────

alter table public.activity enable row level security;
alter table public.library enable row level security;
alter table public.progress enable row level security;

drop policy if exists "activity: own rows" on public.activity;
create policy "activity: own rows" on public.activity
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "library: own rows" on public.library;
create policy "library: own rows" on public.library
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "progress: own rows" on public.progress;
create policy "progress: own rows" on public.progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.activity to authenticated;
grant select, insert, update, delete on public.library to authenticated;
grant select, insert, update, delete on public.progress to authenticated;
