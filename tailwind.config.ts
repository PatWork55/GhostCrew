import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        foreground: "#f5f5f5",
        accent: "#6ee7b7",
        panel: "#111216",
        stroke: "#20232b",
        muted: "#9ca3af"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(110, 231, 183, 0.16), 0 18px 48px rgba(0, 0, 0, 0.36)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(110, 231, 183, 0.22), transparent 34%), radial-gradient(circle at 82% 18%, rgba(56, 189, 248, 0.16), transparent 30%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent)"
      }
    }
  },
  plugins: []
};

export default config;
