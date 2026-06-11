"use client";
import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertCircle className="h-12 w-12 text-red-400" />
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">
          Error al cargar este módulo
        </h2>
        <p className="text-sm text-slate-500">
          {error.message || "Ocurrió un error inesperado."}
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-md bg-night px-4 py-2 text-sm font-medium text-white hover:bg-night-soft"
      >
        Reintentar
      </button>
    </div>
  );
}
