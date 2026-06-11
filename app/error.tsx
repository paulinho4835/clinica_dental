"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-semibold text-slate-800">
            Algo salió mal
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            Ocurrió un error inesperado. Si el problema persiste, contacta al soporte.
          </p>
          <button
            onClick={reset}
            className="rounded-md bg-night px-4 py-2 text-sm font-medium text-white hover:bg-night-soft"
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
