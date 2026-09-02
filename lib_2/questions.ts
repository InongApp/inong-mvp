export type Question = {
  id: string;
  type: "know_me" | "bet_on_me";
  prompt: string;
  options: string[];
};

// Starter bank — 20 questions, 10 per type. Expand freely; the schema
// doesn't care how many exist.
export const QUESTIONS: Question[] = [
  // KNOW ME — answer for yourself, friend predicts you
  { id: "km1", type: "know_me", prompt: "If I suddenly had R1 million, what would I do first?", options: ["Buy a house", "Start a business", "Travel", "Help my family"] },
  { id: "km2", type: "know_me", prompt: "What's my biggest fear?", options: ["Failure", "Being alone", "Losing someone", "Being forgotten"] },
  { id: "km3", type: "know_me", prompt: "How do I actually relax after a hard week?", options: ["Sleep", "Socialize", "Exercise", "Watch/scroll"] },
  { id: "km4", type: "know_me", prompt: "What would I never do for money?", options: ["Lie to family", "Quit on a promise", "Cheat someone", "Betray a friend"] },
  { id: "km5", type: "know_me", prompt: "What's the real reason I'm hard on myself?", options: ["Fear of failing others", "Past disappointment", "High personal standard", "Comparing to others"] },
  { id: "km6", type: "know_me", prompt: "If I could master one skill overnight, what would it be?", options: ["Public speaking", "A language", "An instrument", "A sport"] },
  { id: "km7", type: "know_me", prompt: "What do I actually want people to remember me for?", options: ["Kindness", "Achievement", "Humor", "Loyalty"] },
  { id: "km8", type: "know_me", prompt: "What's my go-to comfort food?", options: ["Something home-cooked", "Fast food", "Something sweet", "Something spicy"] },
  { id: "km9", type: "know_me", prompt: "What stresses me out the most?", options: ["Being late", "Money", "Conflict", "Uncertainty"] },
  { id: "km10", type: "know_me", prompt: "What's one thing I'd change about my past if I could?", options: ["A decision", "A relationship", "A missed chance", "Nothing"] },

  // BET ON ME — predict what the friend will choose right now
  { id: "bm1", type: "bet_on_me", prompt: "Beach, mountains, or city for a weekend away?", options: ["Beach", "Mountains", "City"] },
  { id: "bm2", type: "bet_on_me", prompt: "What will I order if we go for coffee right now?", options: ["Black coffee", "Latte/cappuccino", "Tea", "Something cold"] },
  { id: "bm3", type: "bet_on_me", prompt: "Which movie genre am I in the mood for tonight?", options: ["Comedy", "Action", "Drama", "Documentary"] },
  { id: "bm4", type: "bet_on_me", prompt: "If I had a free Saturday, what would I actually do?", options: ["Stay in", "See friends", "Work on a side project", "Get outdoors"] },
  { id: "bm5", type: "bet_on_me", prompt: "Which app am I opening most right now?", options: ["WhatsApp", "Instagram", "YouTube", "Something else"] },
  { id: "bm6", type: "bet_on_me", prompt: "What's my honest reaction if plans change last minute?", options: ["Annoyed but okay", "Genuinely fine", "Frustrated", "Relieved"] },
  { id: "bm7", type: "bet_on_me", prompt: "Which meal am I most likely to cook this week?", options: ["Something quick", "Something new", "An old favorite", "I'm not cooking"] },
  { id: "bm8", type: "bet_on_me", prompt: "What will I say if you ask 'how are you' right now?", options: ["\"I'm good\"", "\"Busy, but okay\"", "\"Honestly, tired\"", "The real answer"] },
  { id: "bm9", type: "bet_on_me", prompt: "First thing I check when I wake up?", options: ["Phone/messages", "Time", "Nothing, I lie there", "Get straight up"] },
  { id: "bm10", type: "bet_on_me", prompt: "What will I pick to unwind: music, silence, or a call?", options: ["Music", "Silence", "A call"] },
];

export function questionsByType(type: Question["type"]) {
  return QUESTIONS.filter((q) => q.type === type);
}
