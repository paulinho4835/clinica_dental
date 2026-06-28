"use client";
// Boundary de último recurso: captura errores lanzados en el propio layout raíz
// (que app/error.tsx no alcanza). Reemplaza por completo la UI, por eso trae su
// propio <html>/<body>. Reporta a Sentry (no-op sin DSN).
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-semibold text-slate-800">
            Algo salió mal
          </h1>
          <p className="text-sm text-slate-500">
            Ocurrió un error inesperado. Recarga la página; si el problema
            persiste, contacta al soporte.
          </p>
        </div>
      </body>
    </html>
  );
}
