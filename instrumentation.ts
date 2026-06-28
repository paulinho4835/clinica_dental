// Punto de entrada de instrumentación de Next.js. Carga la config de Sentry según
// el runtime y expone onRequestError, que captura automáticamente los errores no
// manejados en server components, API routes y server actions.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Validación de entorno al arrancar el servidor. Las advertencias (p. ej.
    // CRON_SECRET faltante) se reportan a Sentry; los errores cortan el arranque
    // con un mensaje claro en vez de fallar en silencio más tarde.
    const { validateEnv } = await import("./lib/env");
    const { errors, warnings } = validateEnv();

    for (const w of warnings) {
      console.warn(`[env] ${w}`);
      Sentry.captureMessage(`[env] ${w}`, "warning");
    }

    if (errors.length > 0) {
      const message = `Configuración de entorno inválida:\n- ${errors.join("\n- ")}`;
      console.error(message);
      Sentry.captureException(new Error(message));
      throw new Error(message);
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
