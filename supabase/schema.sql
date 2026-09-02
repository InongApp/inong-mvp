-- INONG schema — Supabase Auth version
-- Run this in the Supabase SQL Editor. Safe to run on a fresh project.
-- NOTE: this drops any existing INONG tables first (test data only, no real users yet).

drop table if exists link_scores cascade;
drop table if exists responses cascade;
drop table if exists experiences cascade;
drop table if exists inong_links cascade;
drop table if exists profiles cascade;

create extension if not exists "uuid-ossp";

-- Profiles are keyed 1:1 to Supabase Auth users. Created by the app right
-- after sign-up (see app/login/page.tsx).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- A Me&U pairing: two profiles connected as an "Inong"
create table inong_links (
  id uuid primary key default uuid_generate_v4(),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade, -- null until invite accepted
  invite_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now()
);

-- A single experience round: one question, posed to a link, of a given type
create table experiences (
  id uuid primary key default uuid_generate_v4(),
  link_id uuid not null references inong_links(id) on delete cascade,
  type text not null check (type in ('know_me', 'bet_on_me')),
  question text not null,
  options jsonb not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- Each person's answer to an experience
create table responses (
  id uuid primary key default uuid_generate_v4(),
  experience_id uuid not null references experiences(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  answer text not null,
  is_prediction boolean not null,
  created_at timestamptz not null default now(),
  unique (experience_id, profile_id, is_prediction)
);

-- Running score per link (not wired up in the UI yet)
create table link_scores (
  link_id uuid primary key references inong_links(id) on delete cascade,
  matches int not null default 0,
  total int not null default 0,
  updated_at timestamptz not null default now()
);

create index idx_experiences_link on experiences(link_id);
create index idx_responses_experience on responses(experience_id);

-- =========================================================
-- Row Level Security — every table is locked to auth.uid()
-- =========================================================

alter table profiles enable row level security;
alter table inong_links enable row level security;
alter table experiences enable row level security;
alter table responses enable row level security;
alter table link_scores enable row level security;

-- PROFILES: read your own row, or your paired partner's row. Insert/update only your own.
create policy "profiles: read own or paired" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from inong_links l
      where (l.user_a = auth.uid() or l.user_b = auth.uid())
        and (l.user_a = profiles.id or l.user_b = profiles.id)
    )
  );

create policy "profiles: insert own" on profiles
  for insert with check (id = auth.uid());

create policy "profiles: update own" on profiles
  for update using (id = auth.uid());

-- INONG_LINKS: read/create/update only if you're a participant, or joining a pending invite
create policy "links: read own" on inong_links
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create policy "links: create as user_a" on inong_links
  for insert with check (user_a = auth.uid());

create policy "links: owner or joiner update" on inong_links
  for update
  using (auth.uid() = user_a or (status = 'pending' and user_b is null))
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- EXPERIENCES: only visible/creatable by the two people in the link
create policy "experiences: participants read" on experiences
  for select using (
    exists (
      select 1 from inong_links l
      where l.id = experiences.link_id
        and (l.user_a = auth.uid() or l.user_b = auth.uid())
    )
  );

create policy "experiences: participants create" on experiences
  for insert with check (
    exists (
      select 1 from inong_links l
      where l.id = experiences.link_id
        and (l.user_a = auth.uid() or l.user_b = auth.uid())
    )
  );

-- RESPONSES: read any response within your own link; only ever insert as yourself
create policy "responses: participants read" on responses
  for select using (
    exists (
      select 1 from experiences e
      join inong_links l on l.id = e.link_id
      where e.id = responses.experience_id
        and (l.user_a = auth.uid() or l.user_b = auth.uid())
    )
  );

create policy "responses: self insert" on responses
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from experiences e
      join inong_links l on l.id = e.link_id
      where e.id = responses.experience_id
        and (l.user_a = auth.uid() or l.user_b = auth.uid())
    )
  );

-- LINK_SCORES: read-only for now (not written to by the client yet)
create policy "link_scores: participants read" on link_scores
  for select using (
    exists (
      select 1 from inong_links l
      where l.id = link_scores.link_id
        and (l.user_a = auth.uid() or l.user_b = auth.uid())
    )
  );
