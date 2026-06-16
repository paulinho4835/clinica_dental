import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP: permite solo orígenes explícitos. 'unsafe-inline' en style-src es necesario
// para Tailwind + emotion. 'unsafe-inline' en script-src es necesario para el
// script anti-flash de dark mode en el layout; el resto de JS viene como módulos.
// 'unsafe-eval' solo en desarrollo: Next.js HMR (React Refresh) lo requiere.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,  // anti-flash inline + HMR en dev
  "style-src 'self' 'unsafe-inline'",                // Tailwind utility classes
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Supabase REST, Auth y Realtime (WSS) + Vapi web SDK (audio y API)
  `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co"} wss://*.supabase.co https://*.vapi.ai wss://*.vapi.ai`,
  "frame-src 'none'",
  "frame-ancestors 'none'",                          // más fuerte que X-Frame-Options
  "object-src 'none'",                               // bloquea Flash y plugins
  "base-uri 'self'",                                 // evita inyección de <base>
  "form-action 'self'",                              // bloquea submit a terceros
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Previene que la app se cargue en un iframe (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Evita que el browser adivine el MIME type de respuestas.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Solo envía el origen en el Referer, nunca la ruta completa a terceros.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deshabilita permisos de hardware innecesarios.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  // HSTS: fuerza HTTPS por 1 año (solo aplica en producción con TLS).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
