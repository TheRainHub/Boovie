-- Boowie accounts: run once in Supabase → SQL Editor → New query → Run.
--
-- Sign-up, sign-in and password reset are Supabase Auth (nothing to create for them). This table holds the
-- reading and listening statistics: one row per account, device, day, book and kind ("read" / "listen"). Each
-- device uploads its own rows as absolute daily totals, so repeating an upload is harmless and the profile
-- adds the rows of all devices up.

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

-- Every account sees and changes only its own rows.
alter table public.activity enable row level security;

drop policy if exists "activity: own rows" on public.activity;
create policy "activity: own rows" on public.activity
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.activity to authenticated;
