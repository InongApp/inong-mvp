export type Difficulty = "easy" | "medium" | "hard";

export type AppPersona = {
  key: string;
  name: string;
  traits: string;
};

export const APP_PERSONAS: AppPersona[] = [
  {
    key: "open_book",
    name: "The Open Book",
    traits:
      "Very direct — says what they think without much filtering. Values honesty over tact. Decisive, doesn't overthink choices.",
  },
  {
    key: "deep_thinker",
    name: "The Deep Thinker",
    traits:
      "Reflective and a little private about emotions. Values meaning and purpose over material things. Takes time to answer big questions properly.",
  },
  {
    key: "adventurer",
    name: "The Adventurer",
    traits:
      "Spontaneous, optimistic, dislikes over-planning. Values new experiences over routine and comfort.",
  },
  {
    key: "loyalist",
    name: "The Loyalist",
    traits:
      "Deeply values family and long-standing friendships. Traditional, sentimental, cautious about big changes.",
  },
  {
    key: "wildcard",
    name: "The Wildcard",
    traits:
      "Unpredictable with a contrarian sense of humor. Hard to pin down, genuinely enjoys surprising people.",
  },
];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy — answers line up obviously with the stated traits",
  medium: "Medium — normal human nuance",
  hard: "Hard — occasionally surprising, like a real complex person",
};

