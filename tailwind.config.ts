import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#FFFFFF",       // background — white, matches the logo's canvas
        paper: "#152B67",     // primary text — deep navy from the wordmark
        surface: "#F1F4FC",   // light card surface, cool-tinted
        coral: "#E8262A",     // primary accent (red heart) — CTAs, Know Me
        skyblue: "#1B5FCB",   // secondary accent (blue heart) — Bet on Me
        mute: "#6B7280",      // secondary text
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
      },
    },
  },
  plugins: [],
};
export default config;
