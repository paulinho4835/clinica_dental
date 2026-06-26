"use client";

import { useEffect } from "react";

// Auto-dispara el diálogo de impresión al cargar la hoja de agenda.
export function AutoPrint() {
  useEffect(() => {
    window.print();
  }, []);
  return null;
}

export function PrintButtons() {
  return (
    <div className="no-print mb-6 flex gap-3">
      <button
        onClick={() => window.print()}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
      >
        Imprimir / Guardar PDF
      </button>
      <button
        onClick={() => window.close()}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
      >
        Cerrar
      </button>
    </div>
  );
}
