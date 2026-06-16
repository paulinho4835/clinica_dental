import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const supabaseConnect = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co"} wss://*.supabase.co`;

// ── CSP estricta (todo el sitio salvo /demo) ─────────────────────────────────
// 'unsafe-inline' en style-src: necesario para Tailwind. 'unsafe-inline' en
// script-src: script anti-flash de dark mode. 'unsafe-eval' solo en dev (HMR).
const cspStrict = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseConnect}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// ── CSP laxa SOLO para /demo ─────────────────────────────────────────────────
// El SDK web de Vapi usa Daily.co (WebRTC). Daily descarga y EVALÚA su "call
// object bundle" en runtime → requiere 'unsafe-eval' (no basta wasm-unsafe-eval).
// Aislamos esta política a /demo para no debilitar el resto de la app, que
// maneja datos de pacientes.
const cspDemo = [
  "default-src 'self'",
  // blob: es necesario: Daily.co y el filtro de ruido Krisp cargan scripts y
  // AudioWorklets desde URLs blob: generadas en runtime.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://*.daily.co",
  "script-src-elem 'self' 'unsafe-inline' blob: https://*.daily.co",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "child-src blob:",
  "media-src 'self' blob: https://*.daily.co",
  // Supabase + Vapi (API/señalización) + Daily.co (WebRTC) + Sentry (telemetría)
  `connect-src 'self' ${supabaseConnect} https://*.vapi.ai wss://*.vapi.ai https://*.daily.co wss://*.daily.co https://*.pluot.blue https://*.sentry.io`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Cabeceras de seguridad compartidas (sin CSP, que se asigna por ruta).
const baseSecurityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/demo",
        headers: [
          ...baseSecurityHeaders,
          { key: "Content-Security-Policy", value: cspDemo },
        ],
      },
      {
        source: "/demo/:path*",
        headers: [
          ...baseSecurityHeaders,
          { key: "Content-Security-Policy", value: cspDemo },
        ],
      },
      {
        // Todo menos /demo
        source: "/((?!demo).*)",
        headers: [
          ...baseSecurityHeaders,
          { key: "Content-Security-Policy", value: cspStrict },
        ],
      },
    ];
  },
};

export default nextConfig;
