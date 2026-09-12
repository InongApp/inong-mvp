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
  relationship_mode text check (relationship_mode in ('romantic', 'soulmate', 'friendship')), -- one_on_one only; null = legacy room, treated as friendship
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
  type text not null check (type in ('know_me', 'bet_on_me', 'visuals_in_words', 'visuals_guess')),
  round_number int not null,
  round_type text check (round_type in ('discover', 'play', 'deepen', 'surprise', 'connection', 'memory')), -- null = legacy round predating round-type intelligence
  status text not null default 'active' check (status in ('active', 'complete')),
  tone text, -- emotional tone of the round's comment thread, classified once on completion
  avg_response_seconds numeric, -- average time-to-respond across the round's questions
  match_rate numeric, -- fraction matched/correct, for engagement signal
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (room_id, type, round_number)
);

create table experiences (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_id uuid references experience_rounds(id) on delete set null, -- null = legacy pre-round data
  type text not null check (type in ('know_me', 'bet_on_me', 'visuals_in_words', 'visuals_guess')),
  question text not null,
  options jsonb, -- nullable: null means an open-ended (free-text) custom question
  created_by uuid not null references profiles(id),
  ai_matched boolean, -- cached AI judgment for free-text rounds; null = not yet judged
  clue_1 text, -- visuals_guess only
  clue_2 text, -- visuals_guess only
  correct_answer text, -- visuals_guess only
  clues_revealed int not null default 1, -- visuals_guess only: 1 or 2
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
  reinforcement_count int not null default 1, -- how many times this same insight has resurfaced
  last_reinforced_at timestamptz not null default now(),
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

-- GUESS THE PICTURE mode: one player presents clues, the other guesses.
-- Correct on clue 1 = 3 points, correct on clue 2 = 1 point, wrong = 0.
create table guess_results (
  id uuid primary key default uuid_generate_v4(),
  experience_id uuid not null references experiences(id) on delete cascade unique,
  guesser_profile_id uuid not null references profiles(id) on delete cascade,
  guess_answer text not null,
  clues_used int not null check (clues_used in (1, 2)),
  correct boolean not null,
  points int not null,
  created_at timestamptz not null default now()
);

create table guess_scores (
  room_id uuid not null references rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  points int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, profile_id)
);

-- OUR INONG™ THING: a jointly-editable, persistent archive of shared
-- culture (inside jokes, nicknames, stories) — no rounds, no scoring.
create table inside_jokes (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  title text not null,
  story text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- SURPRISE ME: real-world dares drawn from a static bank (zero AI cost by
-- design). No rounds — a simple continuous stream with a streak count.
create table surprises (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  prompt text not null,
  category text,
  is_dare boolean not null default false,
  timer_minutes int,
  status text not null default 'active' check (status in ('active', 'done', 'skipped')),
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- INONG™ 24: one prompt per room per calendar day, generated lazily on
-- first visit that day, disappearing after 24 hours.
create table daily_prompts (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  prompt_date date not null,
  question text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (room_id, prompt_date)
);

create table daily_responses (
  id uuid primary key default uuid_generate_v4(),
  daily_prompt_id uuid not null references daily_prompts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  answer text not null,
  created_at timestamptz not null default now(),
  unique (daily_prompt_id, profile_id)
);

-- =========================================================
-- DIGITAL FRIEND: solo practice against an AI-simulated persona.
-- Deliberately isolated from experiences/rounds/discoveries — a
-- simulated answer must never be mistaken for, or blended with, real
-- truth about a real person. No shared tables with real gameplay.
-- =========================================================
create table digital_friend_personas (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  traits text not null,
  type text not null check (type in ('app', 'custom')),
  created_at timestamptz not null default now()
);

create table digital_friend_sessions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  persona_id uuid references digital_friend_personas(id) on delete set null, -- null for app presets
  persona_key text not null, -- app preset key, or the custom persona's id as text — stable across sessions for balance tracking
  persona_name text not null,   -- snapshot at session start
  persona_traits text not null, -- snapshot at session start
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  mode text not null check (mode in ('know_me', 'bet_on_me')),
  created_at timestamptz not null default now()
);

create table digital_friend_rounds (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references digital_friend_sessions(id) on delete cascade,
  question text not null,
  options jsonb,
  digital_answer text not null, -- the persona's simulated "true" answer
  player_answer text,
  points_wagered int, -- bet_on_me only
  resolved boolean not null default false,
  correct boolean,
  points_delta int,
  created_at timestamptz not null default now()
);

create table digital_friend_balances (
  profile_id uuid not null references profiles(id) on delete cascade,
  persona_key text not null, -- custom persona id, or the app preset's key
  points int not null default 500,
  updated_at timestamptz not null default now(),
  primary key (profile_id, persona_key)
);

-- JUST BECAUSE: the one mechanic-free space in the whole app. No round, no
-- score, no AI, no turn-taking. A message can be empty — even a bare send
-- with no words is a valid, complete gesture.
create table just_because_notes (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now()
);

-- MILESTONES: tracks which milestones (round counts, room age) have already
-- been shown for a room, so a congratulatory moment fires exactly once.
create table milestones_seen (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references rooms(id) on delete cascade,
  milestone_key text not null,
  seen_at timestamptz not null default now(),
  unique (room_id, milestone_key)
);

-- ROOM ACTIVITY: lightweight presence signal so each person can see when
-- their Inong moves to a different experience, and jump there directly —
-- without this, experiences have no way to "talk to each other" at all.
-- COMMENT_READS: per-experience read tracking (room-level granularity, not
-- per-item) — enough to answer "does Know Me have anything new for me?"
-- without needing a row per individual comment.
create table comment_reads (
  room_id uuid not null references rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  experience_href text not null,
  last_read_at timestamptz not null default now(),
  primary key (room_id, profile_id, experience_href)
);

-- PREMIUM_INTEREST: tracks who's tapped "notify me" on a premium nudge.
-- No billing exists yet — this is purely a waitlist signal for launch.
create table premium_interest (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  feature text not null, -- which nudge they tapped from, e.g. 'visuals_images', 'digital_friend_custom', 'attachments'
  created_at timestamptz not null default now()
);

create table room_activity (
  room_id uuid not null references rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  experience_href text not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, profile_id)
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
  experience_id uuid references experiences(id) on delete cascade,
  surprise_id uuid references surprises(id) on delete cascade,
  inside_joke_id uuid references inside_jokes(id) on delete cascade,
  daily_prompt_id uuid references daily_prompts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  constraint exactly_one_subject check (
    (case when experience_id is not null then 1 else 0 end) +
    (case when surprise_id is not null then 1 else 0 end) +
    (case when inside_joke_id is not null then 1 else 0 end) +
    (case when daily_prompt_id is not null then 1 else 0 end) = 1
  )
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
create index idx_comments_surprise on experience_comments(surprise_id);
create index idx_comments_inside_joke on experience_comments(inside_joke_id);
create index idx_comments_daily_prompt on experience_comments(daily_prompt_id);
create index idx_bets_profile on bets(profile_id);
create index idx_bet_balances_profile on bet_balances(profile_id);
create index idx_guess_results_guesser on guess_results(guesser_profile_id);
create index idx_guess_scores_profile on guess_scores(profile_id);
create index idx_inside_jokes_room on inside_jokes(room_id);
create index idx_surprises_room on surprises(room_id);
create index idx_daily_prompts_room on daily_prompts(room_id);
create index idx_daily_responses_prompt on daily_responses(daily_prompt_id);

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
alter table guess_results enable row level security;
alter table guess_scores enable row level security;
alter table inside_jokes enable row level security;
alter table surprises enable row level security;
alter table daily_prompts enable row level security;
alter table daily_responses enable row level security;
alter table digital_friend_personas enable row level security;
alter table digital_friend_sessions enable row level security;
alter table digital_friend_rounds enable row level security;
alter table digital_friend_balances enable row level security;
alter table just_because_notes enable row level security;
alter table milestones_seen enable row level security;
alter table room_activity enable row level security;
alter table comment_reads enable row level security;
alter table premium_interest enable row level security;
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

-- GUESS_RESULTS / GUESS_SCORES: read-only for clients. All writes happen
-- server-side (in /api/resolve-guess, via the service role), since
-- correctness there is judged by AI and must not be trusted from the client.
create policy "guess_results: room members read" on guess_results
  for select using (
    exists (
      select 1 from experiences e
      join room_members m on m.room_id = e.room_id
      where e.id = guess_results.experience_id and m.profile_id = auth.uid()
    )
  );

create policy "guess_scores: members read" on guess_scores
  for select using (
    exists (select 1 from room_members m where m.room_id = guess_scores.room_id and m.profile_id = auth.uid())
  );

-- OUR INONG™ THING: any room member can read or add — shared culture,
-- jointly owned. No update/delete for now (entries are permanent by design).
create policy "inside_jokes: members read" on inside_jokes
  for select using (
    exists (select 1 from room_members m where m.room_id = inside_jokes.room_id and m.profile_id = auth.uid())
  );

create policy "inside_jokes: members create" on inside_jokes
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from room_members m where m.room_id = inside_jokes.room_id and m.profile_id = auth.uid())
  );

-- SURPRISE ME: members read/create, and can update status (mark done/skipped)
create policy "surprises: members read" on surprises
  for select using (
    exists (select 1 from room_members m where m.room_id = surprises.room_id and m.profile_id = auth.uid())
  );

create policy "surprises: members create" on surprises
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from room_members m where m.room_id = surprises.room_id and m.profile_id = auth.uid())
  );

create policy "surprises: members update" on surprises
  for update using (
    exists (select 1 from room_members m where m.room_id = surprises.room_id and m.profile_id = auth.uid())
  );

-- INONG™ 24: members read/create the daily prompt and their own response
create policy "daily_prompts: members read" on daily_prompts
  for select using (
    exists (select 1 from room_members m where m.room_id = daily_prompts.room_id and m.profile_id = auth.uid())
  );

create policy "daily_prompts: members create" on daily_prompts
  for insert with check (
    exists (select 1 from room_members m where m.room_id = daily_prompts.room_id and m.profile_id = auth.uid())
  );

create policy "daily_responses: room members read" on daily_responses
  for select using (
    exists (
      select 1 from daily_prompts p
      join room_members m on m.room_id = p.room_id
      where p.id = daily_responses.daily_prompt_id and m.profile_id = auth.uid()
    )
  );

create policy "daily_responses: self insert" on daily_responses
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from daily_prompts p
      join room_members m on m.room_id = p.room_id
      where p.id = daily_responses.daily_prompt_id and m.profile_id = auth.uid()
    )
  );

-- DIGITAL FRIEND: solo practice, owner-only throughout. No room_members
-- join needed — it's one real person and an AI, not two real people.
create policy "df_personas: owner select" on digital_friend_personas
  for select using (profile_id = auth.uid());
create policy "df_personas: owner insert" on digital_friend_personas
  for insert with check (profile_id = auth.uid());

create policy "df_sessions: owner select" on digital_friend_sessions
  for select using (profile_id = auth.uid());
create policy "df_sessions: owner insert" on digital_friend_sessions
  for insert with check (profile_id = auth.uid());

create policy "df_rounds: owner select" on digital_friend_rounds
  for select using (
    exists (select 1 from digital_friend_sessions s where s.id = digital_friend_rounds.session_id and s.profile_id = auth.uid())
  );
create policy "df_rounds: owner insert" on digital_friend_rounds
  for insert with check (
    exists (select 1 from digital_friend_sessions s where s.id = digital_friend_rounds.session_id and s.profile_id = auth.uid())
  );
create policy "df_rounds: owner update" on digital_friend_rounds
  for update using (
    exists (select 1 from digital_friend_sessions s where s.id = digital_friend_rounds.session_id and s.profile_id = auth.uid())
  );

create policy "df_balances: owner select" on digital_friend_balances
  for select using (profile_id = auth.uid());
create policy "df_balances: owner insert" on digital_friend_balances
  for insert with check (profile_id = auth.uid());
create policy "df_balances: owner update" on digital_friend_balances
  for update using (profile_id = auth.uid());

-- JUST BECAUSE: any room member can read or send. No update/delete —
-- these are permanent, tiny, and honest.
create policy "just_because: members read" on just_because_notes
  for select using (
    exists (select 1 from room_members m where m.room_id = just_because_notes.room_id and m.profile_id = auth.uid())
  );

create policy "just_because: members send" on just_because_notes
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from room_members m where m.room_id = just_because_notes.room_id and m.profile_id = auth.uid())
  );

-- MILESTONES: any room member can read or mark seen
create policy "milestones: members read" on milestones_seen
  for select using (
    exists (select 1 from room_members m where m.room_id = milestones_seen.room_id and m.profile_id = auth.uid())
  );

create policy "milestones: members insert" on milestones_seen
  for insert with check (
    exists (select 1 from room_members m where m.room_id = milestones_seen.room_id and m.profile_id = auth.uid())
  );

-- ROOM ACTIVITY: members can read anyone's row in their room (needed to see
-- where their Inong currently is), but only ever write their own.
create policy "room_activity: members read" on room_activity
  for select using (
    exists (select 1 from room_members m where m.room_id = room_activity.room_id and m.profile_id = auth.uid())
  );

create policy "room_activity: self upsert" on room_activity
  for insert with check (profile_id = auth.uid());

create policy "room_activity: self update" on room_activity
  for update using (profile_id = auth.uid());

create policy "comment_reads: self read" on comment_reads
  for select using (profile_id = auth.uid());

create policy "comment_reads: self upsert" on comment_reads
  for insert with check (profile_id = auth.uid());

create policy "comment_reads: self update" on comment_reads
  for update using (profile_id = auth.uid());

create policy "premium_interest: self insert" on premium_interest
  for insert with check (profile_id = auth.uid());

create policy "premium_interest: self read" on premium_interest
  for select using (profile_id = auth.uid());

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
    or exists (
      select 1 from surprises s
      join room_members m on m.room_id = s.room_id
      where s.id = experience_comments.surprise_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from inside_jokes j
      join room_members m on m.room_id = j.room_id
      where j.id = experience_comments.inside_joke_id and m.profile_id = auth.uid()
    )
    or exists (
      select 1 from daily_prompts p
      join room_members m on m.room_id = p.room_id
      where p.id = experience_comments.daily_prompt_id and m.profile_id = auth.uid()
    )
  );

create policy "experience_comments: self insert" on experience_comments
  for insert with check (
    profile_id = auth.uid()
    and (
      exists (
        select 1 from experiences e
        join room_members m on m.room_id = e.room_id
        where e.id = experience_comments.experience_id and m.profile_id = auth.uid()
      )
      or exists (
        select 1 from surprises s
        join room_members m on m.room_id = s.room_id
        where s.id = experience_comments.surprise_id and m.profile_id = auth.uid()
      )
      or exists (
        select 1 from inside_jokes j
        join room_members m on m.room_id = j.room_id
        where j.id = experience_comments.inside_joke_id and m.profile_id = auth.uid()
      )
      or exists (
        select 1 from daily_prompts p
        join room_members m on m.room_id = p.room_id
        where p.id = experience_comments.daily_prompt_id and m.profile_id = auth.uid()
      )
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

-- =========================================================
-- Applies a bet result that's already been judged (by AI, leniently,
-- server-side in /api/resolve-bet) — trusts p_won as input rather than
-- doing exact string comparison itself. Replaces resolve_bet() for new
-- resolutions; resolve_bet() is left in place, unused, for compatibility.
-- =========================================================
create or replace function apply_bet_result(p_bet_id uuid, p_won boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet bets%rowtype;
  v_experience experiences%rowtype;
  v_delta int;
begin
  select * into v_bet from bets where id = p_bet_id for update;
  if not found or v_bet.resolved then
    return;
  end if;

  select * into v_experience from experiences where id = v_bet.experience_id;

  v_delta := case when p_won then v_bet.points_wagered else -v_bet.points_wagered end;

  update bets set resolved = true, won = p_won, points_delta = v_delta where id = v_bet.id;

  insert into bet_balances (room_id, profile_id, points)
  values (v_experience.room_id, v_bet.profile_id, 500 + v_delta)
  on conflict (room_id, profile_id)
  do update set points = bet_balances.points + v_delta, updated_at = now();
end;
$$;

grant execute on function apply_bet_result(uuid, boolean) to authenticated;

-- =========================================================
-- Applies Guess-mode points atomically. Called only from the server
-- (service role) in /api/resolve-guess, after AI has judged correctness —
-- never trust a client-submitted point value directly.
-- =========================================================
create or replace function apply_guess_points(p_room_id uuid, p_profile_id uuid, p_points int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into guess_scores (room_id, profile_id, points)
  values (p_room_id, p_profile_id, p_points)
  on conflict (room_id, profile_id)
  do update set points = guess_scores.points + p_points, updated_at = now();
end;
$$;

grant execute on function apply_guess_points(uuid, uuid, int) to authenticated;

