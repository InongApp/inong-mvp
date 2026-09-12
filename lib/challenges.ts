import { RelationshipMode } from "@/lib/relationshipMode";

export type Challenge = {
  prompt: string;
  category: "communication" | "taste" | "silly" | "vulnerability";
  isDare: boolean;
  timerMinutes?: number; // only set for dares
  modes?: RelationshipMode[]; // omitted = works for every relationship mode
};

const ALL_MODES: RelationshipMode[] = ["romantic", "soulmate", "friendship"];

// IMPORTANT: every prompt here must be fully answerable in plain text
// through the comment thread. No prompt should require sending a photo,
// GIF, or voice note — attachments are a premium feature that doesn't
// exist yet. A prompt that implies "send a picture" but gives no way to
// actually send one is a broken experience, not a fun one. Where a photo
// or voice note felt like the natural version of an idea, it's rewritten
// here as a described/spoken equivalent instead of dropped entirely.

export const CHALLENGES: Challenge[] = [
  // ---------- Surprises: light, ambient, no time pressure (universal) ----------
  { prompt: "Both pick a restaurant for tonight — don't tell each other until you compare.", category: "silly", isDare: false },
  { prompt: "Describe, in words, the GIF you'd send right now to show how you're feeling.", category: "communication", isDare: false },
  { prompt: "Call each other for one minute instead of texting — just to hear their voice.", category: "communication", isDare: false },
  { prompt: "Describe, without explanation, the most recent photo in your camera roll.", category: "silly", isDare: false },
  { prompt: "Both guess what song the other has stuck in their head — then check.", category: "silly", isDare: false },
  { prompt: "Both describe your ideal weekend in exactly five words.", category: "silly", isDare: false },
  { prompt: "Describe a favorite throwback memory of you two from years ago — what was happening?", category: "silly", isDare: false },
  { prompt: "Type out (badly is fine) the lyrics of the first song that comes to mind.", category: "silly", isDare: false },
  { prompt: "Share your current mood as an emoji, no words.", category: "communication", isDare: false },
  { prompt: "Tell each other one small thing that made you smile today.", category: "communication", isDare: false },
  { prompt: "Both name a food you'd never share — then decide if that's true.", category: "taste", isDare: false },
  { prompt: "Describe exactly what's in front of you right now, in detail.", category: "silly", isDare: false },

  // ---------- Dares: bolder, time-boxed, a little more vulnerable (universal) ----------
  { prompt: "Tell each other one thing you appreciate about them — and why.", category: "vulnerability", isDare: true, timerMinutes: 15 },
  { prompt: "Call each other right now instead of texting.", category: "communication", isDare: true, timerMinutes: 10 },
  { prompt: "Ask each other a question you've never asked before.", category: "vulnerability", isDare: true, timerMinutes: 10 },
  { prompt: "Tell each other one thing you're avoiding dealing with right now.", category: "vulnerability", isDare: true, timerMinutes: 15 },
  { prompt: "Send a compliment you've been meaning to say but haven't.", category: "vulnerability", isDare: true, timerMinutes: 5 },
  { prompt: "Tell them your phone's screen time for today, in a sentence. No judgment.", category: "vulnerability", isDare: true, timerMinutes: 5 },
  { prompt: "Ask 'what's on your mind right now?' and actually wait for the real answer.", category: "communication", isDare: true, timerMinutes: 15 },
  { prompt: "Put your phones down and look at each other for 30 seconds without talking.", category: "vulnerability", isDare: true, timerMinutes: 5 },
  { prompt: "Tell each other about the last time they made you proud.", category: "vulnerability", isDare: true, timerMinutes: 10 },
  { prompt: "Say the words you don't say to each other often enough.", category: "vulnerability", isDare: true, timerMinutes: 5 },

  // ---------- Romantic-specific dares ----------
  { prompt: "Recreate your first date, right now, in whatever way you can manage tonight.", category: "vulnerability", isDare: true, timerMinutes: 15, modes: ["romantic"] },
  { prompt: "Tell them one thing you find more attractive about them now than when you met.", category: "vulnerability", isDare: true, timerMinutes: 10, modes: ["romantic"] },
  { prompt: "Slow dance to one song, phones down, right now — then tell them how it felt.", category: "silly", isDare: true, timerMinutes: 5, modes: ["romantic"] },

  // ---------- Soulmate-specific dares ----------
  { prompt: "Tell them a belief about life you hold today that you didn't a few years ago.", category: "vulnerability", isDare: true, timerMinutes: 15, modes: ["soulmate"] },
  { prompt: "Ask them what they think your purpose is — then tell them what you think theirs is.", category: "vulnerability", isDare: true, timerMinutes: 15, modes: ["soulmate"] },
  { prompt: "Share a fear you've never said out loud to them before.", category: "vulnerability", isDare: true, timerMinutes: 10, modes: ["soulmate"] },

  // ---------- Friendship-specific dares ----------
  { prompt: "Tell the story of how you two actually became close — from their point of view first.", category: "vulnerability", isDare: true, timerMinutes: 15, modes: ["friendship"] },
  { prompt: "Text a third friend right now and ask them to describe your friendship in one word.", category: "silly", isDare: true, timerMinutes: 10, modes: ["friendship"] },
  { prompt: "Tell them the moment you knew this friendship was going to last.", category: "vulnerability", isDare: true, timerMinutes: 10, modes: ["friendship"] },
];

export function randomChallenge(
  usedPrompts: string[],
  wantDare: boolean,
  mode: RelationshipMode = null
): Challenge | null {
  const byDareType = CHALLENGES.filter((c) => c.isDare === wantDare);
  // A challenge with no "modes" tag works for everyone; one with a tag only
  // shows up for rooms actually in that mode.
  const byMode = byDareType.filter((c) => !c.modes || (mode && c.modes.includes(mode)));
  const pool = byMode.length > 0 ? byMode : byDareType; // safety net, should rarely trigger
  const unused = pool.filter((c) => !usedPrompts.includes(c.prompt));
  const finalPool = unused.length > 0 ? unused : pool; // recycle once exhausted
  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? null;
}
