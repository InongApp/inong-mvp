# INONG — MVP

Two experiences (Know Me, Bet on Me) that prove the core reciprocal loop
before building the rest (Our Thing, Surprise Us, Friend Court, Remember
When, INONG 24).

## Setup

1. `npm install`
2. Create a Supabase project, then run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase project URL + anon key.
4. `npm run dev`

## How the MVP works

- **Pairing** (`/pair`): one person creates an Inong and gets a 6-character
  invite code; the other joins with that code. No email/password auth yet —
  each browser stores its `profile_id` and `link_id` in `localStorage`. Good
  enough to test the mechanic with real pairs; swap in Supabase Auth before
  any public launch.
- **Know Me** (`/know-me`) and **Bet on Me** (`/bet-on-me`): both pull from
  the same question bank shape (`lib/questions.ts`) and share one schema
  (`experiences` + `responses`). Whoever's browser first loads an unused
  question becomes the "subject" for that round; the other person predicts.
  Reveal fires once both responses exist. The two experiences are visually
  and mechanically the same loop, just framed differently — Know Me is
  "who am I", Bet on Me is "what will I choose right now."
- **The reciprocal prompt**: after every reveal, "Next question" pulls the
  next unused question and flips who's the subject naturally over time,
  since either person can trigger the next round.

## What's deliberately not in the MVP

- Real auth (Supabase Auth or similar) — needed before public launch
- Push notifications for "your Inong just answered"
- Our Thing, Surprise Us, Friend Court, Remember When, INONG 24 — same
  `experiences`/`responses` shape, just a new `type` and UI per experience
- Running score display (the `link_scores` table exists in the schema but
  isn't wired up yet — trivial to add once you want a score screen)

## Extending to the next experience

Add a new `type` value to the `experiences.type` check constraint, add
questions to `lib/questions.ts`, copy `app/know-me/page.tsx` as a starting
point, and add a tab in `components/ExperienceNav.tsx`.
