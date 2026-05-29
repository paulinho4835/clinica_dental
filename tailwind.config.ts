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
    },
  },
  plugins: [],
} satisfies Config;
