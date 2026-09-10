export type Challenge = {
  prompt: string;
  category: "communication" | "taste" | "silly" | "vulnerability";
};

export const CHALLENGES: Challenge[] = [
  { prompt: "Call each other right now instead of texting.", category: "communication" },
  { prompt: "Both pick a restaurant for tonight — don't tell each other until you compare.", category: "silly" },
  { prompt: "Send the first GIF that describes how you're feeling right now.", category: "communication" },
  { prompt: "Ask each other a question you've never asked before.", category: "vulnerability" },
  { prompt: "Both send a voice note instead of typing for the next message.", category: "communication" },
  { prompt: "Share the most recent photo in your camera roll, no explanation.", category: "silly" },
  { prompt: "Tell each other one thing you're avoiding dealing with right now.", category: "vulnerability" },
  { prompt: "Both guess what song the other has stuck in their head — then check.", category: "silly" },
  { prompt: "Send a compliment you've been meaning to say but haven't.", category: "vulnerability" },
  { prompt: "Both describe your ideal weekend in exactly five words.", category: "silly" },
  { prompt: "Share your phone's screen time for today. No judgment.", category: "vulnerability" },
  { prompt: "Send each other a throwback photo of yourselves from years ago.", category: "silly" },
  { prompt: "Tell each other something you appreciate about them that you don't say enough.", category: "vulnerability" },
  { prompt: "Both pick a movie you'd want to watch together this week.", category: "silly" },
  { prompt: "Send a voice note singing (badly is fine) the first song that comes to mind.", category: "silly" },
  { prompt: "Ask 'what's on your mind right now?' and actually wait for the real answer.", category: "communication" },
  { prompt: "Share your current mood as an emoji, no words.", category: "communication" },
  { prompt: "Tell each other one small thing that made you smile today.", category: "vulnerability" },
  { prompt: "Both name a food you'd never share — then decide if that's true.", category: "taste" },
  { prompt: "Send a photo of exactly what's in front of you right now.", category: "silly" },
];

export function randomChallenge(usedPrompts: string[]): Challenge | null {
  const unused = CHALLENGES.filter((c) => !usedPrompts.includes(c.prompt));
  const pool = unused.length > 0 ? unused : CHALLENGES; // recycle once exhausted
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

