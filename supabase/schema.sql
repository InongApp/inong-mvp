-- INONG schema — Rooms architecture (v2)
-- Run in the Supabase SQL Editor. Rebuilds all INONG tables (test data only,
-- no real users lost — auth.users is untouched, only profiles/rooms/etc.)

drop function if exists accept_invite(text);
drop function if exists get_invite_preview(text);
drop table if exists discoveries cascade;
drop table if exists responses cascade;
drop table if exists experience_comments cascade;
drop table if exists experiences cascade;
drop table if exists experience_rounds cascade;
drop table if exists push_subscriptions cascade;
drop table if exists room_invites cascade;
drop table if exists room_members cascade;
drop table if exists rooms cascade;
drop table if exists link_scores cascade;
drop table if exists inong_links cascade;
drop table if exists profiles cascade;

create extension if not exists "uuid-ossp";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- A Room is any space two or more people play INONG experiences in.
-- type determines its member cap:
--   one_on_one   -> exactly 2 members
--   inner_circle -> up to 13 members ("1 + 12")
--   family       -> unlimited members
create table rooms (
  id uuid primary key default uuid_generate_v4(),
  name text, -- null for one_on_one (display name is computed from the other member)
  type text not null check (type in ('one_on_one', 'inner_circle', 'family')),
  max_members int, -- 2, 13, or null (unlimited)
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

create table room_invites (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  invite_code text not null unique,
  created_by uuid not null references profiles(id),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now()
);

-- A Round is the finite competitive unit: 5 alternating turns per player
-- (10 total) for a given experience type. Finite by design — the round
-- ends deliberately (a "hanger"), while the Journey (all rounds over time)
-- stays open-ended.
create table experience_rounds (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null check (type in ('know_me', 'bet_on_me')),
  round_number int not null,
  round_type text check (round_type in ('discover', 'play', 'deepen', 'surprise', 'connection', 'memory')), -- null = legacy round predating round-type intelligence
  status text not null default 'active' check (status in ('active', 'complete')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (room_id, type, round_number)
);

create table experiences (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid references experience_rounds(id) on delete set null, -- null = legacy pre-round data
  type text not null check (type in ('know_me', 'bet_on_me')),
  question text not null,
  options jsonb, -- nullable: null means an open-ended (free-text) custom question
  created_by uuid not null references profiles(id),
  ai_matched boolean, -- cached AI judgment for free-text rounds; null = not yet judged
  created_at timestamptz not null default now()
);

-- A Discovery is a curated, meaningful insight extracted from one Q&A —
-- distinct from the raw interaction log. Always tagged is_ai_inferred so
-- inference is never silently presented as confirmed fact.
create table discoveries (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  source_experience_id uuid not null references experiences(id) on delete cascade unique, -- one discovery per round, enforced at the DB level
  profile_id uuid not null references profiles(id) on delete cascade, -- who the discovery is about
  summary text not null,
  category text,
  is_ai_inferred boolean not null default true,
  created_at timestamptz not null default now()
);

-- BET ON ME's points economy. Distinct from Know Me's match/no-match —
-- this is a wager mechanic: a Subject reveals a real choice, a Bettor
-- wagers points predicting it, win/loss resolves atomically.
create table bet_balances (
  room_id uuid not null references rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  points int not null default 500,
  updated_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

create table bets (
  id uuid primary key default uuid_generate_v4(),
  experience_id uuid not null references experiences(id) on delete cascade unique, -- one bet per scenario
  profile_id uuid not null references profiles(id) on delete cascade, -- the bettor
  chosen_option text not null,
  points_wagered int not null check (points_wagered > 0),
  resolved boolean not null default false,
  won boolean,
  points_delta int,
  created_at timestamptz not null default now()
);

create table responses (
  id uuid primary key default uuid_generate_v4(),
  experience_id uuid not null references experiences(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  answer text not null,
  is_prediction boolean not null,
  created_at timestamptz not null default now(),
  unique (experience_id, profile_id, is_prediction)
);

create table experience_comments (
  id uuid primary key default uuid_generate_v4(),
  experience_id uuid not null references experiences(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index idx_room_members_profile on room_members(profile_id);
create index idx_experiences_room on experiences(room_id);
create index idx_responses_experience on responses(experience_id);
create index idx_comments_experience on experience_comments(experience_id);
create index idx_bets_profile on bets(profile_id);
create index idx_bet_balances_profile on bet_balances(profile_id);

-- =========================================================
-- Row Level Security
-- =========================================================

alter table profiles enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_invites enable row level security;
alter table experiences enable row level security;
alter table experience_rounds enable row level security;
alter table discoveries enable row level security;
alter table bet_balances enable row level security;
alter table bets enable row level security;
alter table responses enable row level security;
alter table experience_comments enable row level security;
alter table push_subscriptions enable row level security;

-- PROFILES: read your own row, or any co-member's row (anyone sharing a room with you)
create policy "profiles: read own or co-member" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from room_members m1
      join room_members m2 on m1.room_id = m2.room_id
      where m1.profile_id = auth.uid() and m2.profile_id = profiles.id
    )
  );

create policy "profiles: insert own" on profiles
  for insert with check (id = auth.uid());

create policy "profiles: update own" on profiles
  for update using (id = auth.uid());

-- Helper used below to check room membership without the checking
-- policy re-triggering itself (avoids "infinite recursion detected").
create or replace function is_room_member(p_room_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from room_members
    where room_id = p_room_id and profile_id = p_profile_id
  );
$$;

grant execute on function is_room_member(uuid, uuid) to authenticated;

-- ROOMS: the creator can always see a room they made (even before their
-- own membership row exists, which is the moment right after creating it),
-- or any room they're already a member of.
create policy "rooms: members read" on rooms
  for select using (
    created_by = auth.uid()
    or is_room_member(rooms.id, auth.uid())
  );

create policy "rooms: create as self" on rooms
  for insert with check (created_by = auth.uid());

-- ROOM_MEMBERS: read any row in a room you belong to; you can only ever insert yourself
create policy "room_members: co-members read" on room_members
  for select using (
    is_room_member(room_members.room_id, auth.uid())
  );

create policy "room_members: insert self" on room_members
  for insert with check (profile_id = auth.uid());

-- ROOM_INVITES: only the creator manages their own invites directly
-- (pre-join preview for an outsider goes through get_invite_preview() below)
create policy "room_invites: creator reads own" on room_invites
  for select using (created_by = auth.uid());

create policy "room_invites: create as member" on room_invites
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from room_members m where m.room_id = room_invites.room_id and m.profile_id = auth.uid())
  );

-- EXPERIENCES / RESPONSES: only visible/creatable by room members
create policy "experiences: members read" on experiences
  for select using (
    exists (select 1 from room_members m where m.room_id = experiences.room_id and m.profile_id = auth.uid())
  );

create policy "experiences: members create" on experiences
  for insert with check (
    exists (select 1 from room_members m where m.room_id = experiences.room_id and m.profile_id = auth.uid())
  );

-- Needed so either room member can cache the AI's free-text match judgment
-- onto the experience row the first time a round completes.
create policy "experiences: members update" on experiences
  for update using (
    exists (select 1 from room_members m where m.room_id = experiences.room_id and m.profile_id = auth.uid())
  );

-- EXPERIENCE_ROUNDS: members read/create/update their own room's rounds
create policy "experience_rounds: members read" on experience_rounds
  for select using (
    exists (select 1 from room_members m where m.room_id = experience_rounds.room_id and m.profile_id = auth.uid())
  );

create policy "experience_rounds: members create" on experience_rounds
  for insert with check (
    exists (select 1 from room_members m where m.room_id = experience_rounds.room_id and m.profile_id = auth.uid())
  );

create policy "experience_rounds: members update" on experience_rounds
  for update using (
    exists (select 1 from room_members m where m.room_id = experience_rounds.room_id and m.profile_id = auth.uid())
  );

-- DISCOVERIES: members can read; writes happen server-side via the service
-- role in /api/discoveries/extract, so no insert policy is needed for the
-- anon/authenticated roles.
create policy "discoveries: members read" on discoveries
  for select using (
    exists (select 1 from room_members m where m.room_id = discoveries.room_id and m.profile_id = auth.uid())
  );

-- BET_BALANCES: members can read; there is deliberately no insert/update
-- policy for authenticated users — balances are only ever changed inside
-- the resolve_bet() function below, which runs as definer. This prevents
-- anyone from crediting themselves points directly.
create policy "bet_balances: members read" on bet_balances
  for select using (
    exists (select 1 from room_members m where m.room_id = bet_balances.room_id and m.profile_id = auth.uid())
  );

-- BETS: members read; you can only ever place a bet as yourself. No update
-- policy — resolution happens only inside resolve_bet(), not directly.
create policy "bets: room members read" on bets
  for select using (
    exists (
      select 1 from experiences e
      join room_members m on m.room_id = e.room_id
      where e.id = bets.experience_id and m.profile_id = auth.uid()
    )
  );

create policy "bets: self insert" on bets
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from experiences e
      join room_members m on m.room_id = e.room_id
      where e.id = bets.experience_id and m.profile_id = auth.uid()
    )
  );

create policy "responses: room members read" on responses
  for select using (
    exists (
      select 1 from experiences e
      join room_members m on m.room_id = e.room_id
      where e.id = responses.experience_id and m.profile_id = auth.uid()
    )
  );

create policy "responses: self insert" on responses
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from experiences e
      join room_members m on m.room_id = e.room_id
      where e.id = responses.experience_id and m.profile_id = auth.uid()
    )
  );

create policy "experience_comments: room members read" on experience_comments
  for select using (
    exists (
      select 1 from experiences e
      join room_members m on m.room_id = e.room_id
      where e.id = experience_comments.experience_id and m.profile_id = auth.uid()
    )
  );

create policy "experience_comments: self insert" on experience_comments
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from experiences e
      join room_members m on m.room_id = e.room_id
      where e.id = experience_comments.experience_id and m.profile_id = auth.uid()
    )
  );

-- PUSH_SUBSCRIPTIONS: strictly your own. The server-side send route uses the
-- service role key and bypasses these policies entirely (it needs to read
-- the OTHER person's subscriptions to notify them).
create policy "push_subscriptions: own read" on push_subscriptions
  for select using (profile_id = auth.uid());

create policy "push_subscriptions: own insert" on push_subscriptions
  for insert with check (profile_id = auth.uid());

create policy "push_subscriptions: own update" on push_subscriptions
  for update using (profile_id = auth.uid());

create policy "push_subscriptions: own delete" on push_subscriptions
  for delete using (profile_id = auth.uid());

-- =========================================================
-- Invite preview — shows an outsider WHO invited them and to WHAT KIND
-- of room, before they sign up. Runs as definer so it can bypass RLS,
-- but only ever exposes inviter name + room type/name + validity.
-- =========================================================
create or replace function get_invite_preview(p_code text)
returns table (
  valid boolean,
  inviter_name text,
  room_type text,
  room_name text
)
language sql
security definer
set search_path = public
as $$
  select
    (
      i.status = 'active'
      and (
        r.max_members is null
        or (select count(*) from room_members m where m.room_id = r.id) < r.max_members
      )
    ) as valid,
    p.display_name as inviter_name,
    r.type as room_type,
    r.name as room_name
  from room_invites i
  join rooms r on r.id = i.room_id
  join profiles p on p.id = i.created_by
  where i.invite_code = upper(p_code)
  limit 1;
$$;

grant execute on function get_invite_preview(text) to anon, authenticated;

-- =========================================================
-- Accept an invite atomically — validates status + capacity and adds the
-- caller to the room in one locked transaction, so two people racing to
-- grab the last spot in a room can't both succeed.
-- =========================================================
create or replace function accept_invite(p_code text)
returns uuid -- the room_id on success
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite room_invites%rowtype;
  v_room rooms%rowtype;
  v_count int;
begin
  select * into v_invite from room_invites where invite_code = upper(p_code) for update;
  if not found then
    raise exception 'This invite link isn''t valid.';
  end if;
  if v_invite.status <> 'active' then
    raise exception 'This invite is no longer active.';
  end if;

  select * into v_room from rooms where id = v_invite.room_id;

  select count(*) into v_count from room_members where room_id = v_room.id;
  if v_room.max_members is not null and v_count >= v_room.max_members then
    raise exception 'This room is already full.';
  end if;

  if exists (select 1 from room_members where room_id = v_room.id and profile_id = auth.uid()) then
    return v_room.id; -- already a member — idempotent
  end if;

  insert into room_members (room_id, profile_id) values (v_room.id, auth.uid());

  return v_room.id;
end;
$$;

grant execute on function accept_invite(text) to authenticated;

-- =========================================================
-- Resolve a bet atomically — checks the subject's revealed answer against
-- the bet, applies the points delta, and marks it resolved, all in one
-- locked transaction. Idempotent: calling it again on an already-resolved
-- bet is a safe no-op. Either client can call this safely; only the first
-- call actually applies anything.
-- =========================================================
create or replace function resolve_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet bets%rowtype;
  v_experience experiences%rowtype;
  v_true_answer text;
  v_won boolean;
  v_delta int;
begin
  select * into v_bet from bets where id = p_bet_id for update;
  if not found or v_bet.resolved then
    return; -- already resolved, or doesn't exist — safe no-op
  end if;

  select * into v_experience from experiences where id = v_bet.experience_id;

  select answer into v_true_answer from responses
    where experience_id = v_bet.experience_id and is_prediction = false
    limit 1;

  if v_true_answer is null then
    return; -- the subject hasn't revealed their true choice yet
  end if;

  v_won := (v_true_answer = v_bet.chosen_option);
  v_delta := case when v_won then v_bet.points_wagered else -v_bet.points_wagered end;

  update bets set resolved = true, won = v_won, points_delta = v_delta where id = v_bet.id;

  insert into bet_balances (room_id, profile_id, points)
  values (v_experience.room_id, v_bet.profile_id, 500 + v_delta)
  on conflict (room_id, profile_id)
  do update set points = bet_balances.points + v_delta, updated_at = now();
end;
$$;

grant execute on function resolve_bet(uuid) to authenticated;

