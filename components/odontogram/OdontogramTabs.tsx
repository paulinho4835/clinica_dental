"use client";

import { useState, type ReactNode } from "react";

// Selector Adulto / Pediátrico para la ficha del paciente (solo cuando el
// addon "odontograma_pediatrico" está activo). Ambos paneles quedan MONTADOS
// y se oculta el inactivo con CSS: así el doctor no pierde cambios sin
// guardar al alternar entre denticiones.
export function OdontogramTabs({
  adult,
  pediatric,
}: {
  adult: ReactNode;
  pediatric: ReactNode;
}) {
  const [tab, setTab] = useState<"adulto" | "pediatrico">("adulto");

  const btn = (value: "adulto" | "pediatrico", label: string) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
        tab === value
          ? "bg-white text-clinic-fg shadow-sm ring-1 ring-slate-200"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {btn("adulto", "Adulto")}
        {btn("pediatrico", "Pediátrico")}
      </div>
      <div className={tab === "adulto" ? "space-y-3" : "hidden"}>{adult}</div>
      <div className={tab === "pediatrico" ? "space-y-3" : "hidden"}>{pediatric}</div>
    </div>
  );
}
