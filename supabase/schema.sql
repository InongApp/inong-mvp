-- INONG MVP schema
-- One shape covers all future experiences (Our Thing, Surprise Us, Friend Court, Remember When)
-- by extending the `type` enum and `payload` jsonb, not by adding new tables.

create extension if not exists "uuid-ossp";

-- A user's basic identity (MVP: no full auth system yet, just a lightweight profile)
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- A Me&U pairing: two profiles connected as an "Inong"
create table if not exists inong_links (
  id uuid primary key default uuid_generate_v4(),
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade, -- null until the invite is accepted
  invite_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now()
);

-- A single experience round: one question, posed to a link, of a given type
create table if not exists experiences (
  id uuid primary key default uuid_generate_v4(),
  link_id uuid not null references inong_links(id) on delete cascade,
  type text not null check (type in ('know_me', 'bet_on_me')),
  question text not null,
  options jsonb not null, -- e.g. ["Buy a house", "Start a business", "Travel", "Help my family"]
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- Each person's answer to an experience.
-- is_prediction = false: "what would I actually do/choose"
-- is_prediction = true:  "what I think my Inong would do/choose"
create table if not exists responses (
  id uuid primary key default uuid_generate_v4(),
  experience_id uuid not null references experiences(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  answer text not null,
  is_prediction boolean not null,
  created_at timestamptz not null default now(),
  unique (experience_id, profile_id, is_prediction)
);

-- Running score per link (denormalized for fast display; recompute via trigger or edge function later)
create table if not exists link_scores (
  link_id uuid primary key references inong_links(id) on delete cascade,
  matches int not null default 0,
  total int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_experiences_link on experiences(link_id);
create index if not exists idx_responses_experience on responses(experience_id);
