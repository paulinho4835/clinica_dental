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
      },
      animation: {
        flash: "flash 0.9s ease-in-out 3",
      },
    },
  },
  plugins: [],
} satisfies Config;
