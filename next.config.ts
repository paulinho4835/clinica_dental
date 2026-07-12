import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co";
// Realtime abre un WebSocket contra el mismo host de Supabase. En la nube lo
// cubre wss://*.supabase.co; en local (http://127.0.0.1:54321) hay que permitir
// el esquema ws:// equivalente o la CSP bloquea los módulos "en vivo".
const supabaseWs = supabaseUrl.startsWith("http") ? supabaseUrl.replace(/^http/, "ws") : "";
const supabaseConnect = `${supabaseUrl} wss://*.supabase.co ${supabaseWs}`.trim();

// Cloudflare R2: las URLs firmadas usan el subdominio del bucket
// ({bucket}.{account}.r2.cloudflarestorage.com), por eso el comodín. Se necesita
// en connect-src para que el navegador pueda subir (PUT) y ver (GET) las fotos.
const r2Connect = "https://*.r2.cloudflarestorage.com";

// ── CSP estricta (todo el sitio salvo /demo) ─────────────────────────────────
// 'unsafe-inline' en style-src: necesario para Tailwind. 'unsafe-inline' en
// script-src: script anti-flash de dark mode. 'unsafe-eval' solo en dev (HMR).
const cspStrict = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // R2: la galería muestra las fotos con <img src={urlFirmadaDeR2}>.
  `img-src 'self' data: blob: ${r2Connect}`,
  "font-src 'self'",
  // blob: para el web worker de compresión de imágenes (browser-image-compression).
  "worker-src 'self' blob:",
  `connect-src 'self' ${supabaseConnect} ${r2Connect}`,
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
  // Fija la raíz del workspace a este proyecto. Sin esto, Next 15.5 detecta otros
  // package-lock.json en carpetas superiores (p. ej. Felipillo) e infiere mal la
  // raíz, arrastrando archivos ajenos al file-tracing del build.
  outputFileTracingRoot: process.cwd(),
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

// withSentryConfig añade la subida de source maps en build y el tunnelRoute
// (/monitoring) para que los eventos del navegador salgan por nuestro dominio,
// esquivando ad-blockers sin abrir la CSP estricta hacia sentry.io. Sin
// SENTRY_AUTH_TOKEN no sube source maps (CI/local no fallan); en runtime, si no
// hay DSN, el SDK no hace nada.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Silencioso salvo en CI, donde sí queremos ver el log de la subida.
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  // Quita el logger de Sentry del bundle de cliente para ahorrar peso.
  webpack: { treeshake: { removeDebugLogging: true } },
  // No intentar subir source maps si no hay token (evita warnings/fallos en CI).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
