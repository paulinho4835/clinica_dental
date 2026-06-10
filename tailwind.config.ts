import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        clinic: {
          DEFAULT: "#0ea5a4",
          fg: "#0f766e",
        },
      },
      // Resaltado "flash": pulsa un anillo teal 3 veces para ubicar una cita.
      keyframes: {
        flash: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(14,165,164,0)" },
          "50%": { boxShadow: "0 0 0 4px rgba(14,165,164,0.75)" },
        },
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 2px currentColor, 0 0 8px rgba(0,0,0,.2)" },
          "50%": { boxShadow: "0 0 0 4px currentColor, 0 0 16px rgba(0,0,0,.35)" },
        },
        "ghost-pulse": {
          "0%, 100%": { opacity: "0.35" },
          "50%":       { opacity: "0.65" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":       { transform: "translateX(-4px)" },
          "40%":       { transform: "translateX(4px)" },
          "60%":       { transform: "translateX(-4px)" },
          "80%":       { transform: "translateX(4px)" },
        },
      },
      animation: {
        flash: "flash 0.9s ease-in-out 3",
        "pulse-ring": "pulse-ring 1.5s ease-in-out infinite",
        "ghost-pulse": "ghost-pulse 1.2s ease-in-out infinite",
        shake: "shake 0.4s ease-in-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
