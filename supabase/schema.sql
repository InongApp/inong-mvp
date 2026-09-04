-- INONG schema — Rooms architecture (v2)
-- Run in the Supabase SQL Editor. Rebuilds all INONG tables (test data only,
-- no real users lost — auth.users is untouched, only profiles/rooms/etc.)

drop function if exists accept_invite(text);
drop function if exists get_invite_preview(text);
drop table if exists responses cascade;
drop table if exists experiences cascade;
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

create table experiences (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null check (type in ('know_me', 'bet_on_me')),
  question text not null,
  options jsonb, -- nullable: null means an open-ended (free-text) custom question
  created_by uuid not null references profiles(id),
  ai_matched boolean, -- cached AI judgment for free-text rounds; null = not yet judged
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

-- =========================================================
-- Row Level Security
-- =========================================================

alter table profiles enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_invites enable row level security;
alter table experiences enable row level security;
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

