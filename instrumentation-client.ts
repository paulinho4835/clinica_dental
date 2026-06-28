// Inicialización de Sentry en el navegador. Los eventos del cliente se enrutan por
// tunnelRoute (/monitoring, mismo origen) para esquivar ad-blockers y no tener que
// abrir la CSP estricta hacia sentry.io.
//
// NO se activa Session Replay: capturaría pantallas con datos de pacientes (PHI).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

// Necesario para instrumentar las transiciones de navegación del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
