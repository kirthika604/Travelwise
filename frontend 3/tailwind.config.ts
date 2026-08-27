import type { Config } from "tailwindcss";

// TravelWise theme — calm night-sky navy base with a single cool accent
// family: "lagoon" teal/blue, which nods to sustainable transit and keeps
// the whole UI free of warm/orange tones.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        night: {
          950: "#060912",
          900: "#0A0F1E",
          850: "#0E1528",
          800: "#131C34",
          700: "#1C2A4A",
          600: "#294066",
        },
        lagoon: {
          200: "#9DF3E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0E9488",
        },
        sky: {
          300: "#7DD3FC",
          400: "#38BDF8",
          500: "#0EA5E9",
        },
        coral: {
          400: "#FF7A6B",
          500: "#F65C6B",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 20px 60px -15px rgba(0,0,0,0.6)",
        "glow-lagoon": "0 8px 40px -8px rgba(20,184,166,0.45)",
      },
      backgroundImage: {
        "lagoon-gradient": "linear-gradient(120deg, #5EEAD4 0%, #2DD4BF 50%, #38BDF8 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        // Cards/content on Discover fade+rise in once the transition clears.
        "reveal-content": {
          "0%": { opacity: "0", transform: "translateY(18px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "card-reveal": {
          "0%": { opacity: "0", transform: "translateY(24px) scale(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-ring": "pulse-ring 2.4s ease-out infinite",
        "spin-slow": "spin-slow 6s linear infinite",
        "reveal-content": "reveal-content 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 1.1s ease-out both",
        "card-reveal": "card-reveal 0.6s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
