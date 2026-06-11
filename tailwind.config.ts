import type { Config } from "tailwindcss";

// Helper: color respaldado por variable CSS para que soporte opacidad (`/10`)
// y, sobre todo, para que pueda invertirse en modo oscuro sin tocar las clases.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        // `white` y la escala `slate` se respaldan en variables CSS. En modo
        // claro mantienen sus valores de siempre; en `.dark` se invierten (ver
        // globals.css), así toda la app cambia de tema sin reescribir clases.
        white: v("--white"),
        slate: {
          50: v("--slate-50"),
          100: v("--slate-100"),
          200: v("--slate-200"),
          300: v("--slate-300"),
          400: v("--slate-400"),
          500: v("--slate-500"),
          600: v("--slate-600"),
          700: v("--slate-700"),
          800: v("--slate-800"),
          900: v("--slate-900"),
          950: v("--slate-950"),
        },
        // Superficie oscura fija (no se invierte): botones "dark", toasts info.
        night: {
          DEFAULT: "#0f172a",
          soft: "#1e293b",
        },
        clinic: {
          DEFAULT: "#0ea5a4",
          fg: "#0f766e",
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
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
