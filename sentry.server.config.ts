// Inicialización de Sentry para el runtime Node.js (server actions, API routes,
// crons, webhook de Vapi). Es donde vivían los bugs invisibles que costaron horas
// ("el webhook miente con ok"): aquí quedan capturados con stack trace.
//
// Todo está GUARDADO por la presencia del DSN: sin SENTRY_DSN configurado
// (local, CI, tests) esto es un no-op y la app funciona igual.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Entorno separado por deploy (production / preview) para no mezclar ruido.
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Muestreo de performance bajo para no agotar el free tier; el objetivo son
    // los errores, no las métricas. Subir si se quiere más trazado.
    tracesSampleRate: 0.1,
    // Datos de pacientes: NO enviar PII por defecto (IPs, headers sensibles).
    sendDefaultPii: false,
  });
}
