"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Filtro de mes del historial de pagos. El profesional se elige en el panel
// izquierdo y el paciente se filtra dentro de su detalle.
export function PagosFilter({ selectedMonth }: { selectedMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const isAllMonths = selectedMonth === "all";
  const todayMonth = new Date().toLocaleDateString("en-CA").slice(0, 7);

  function update(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="month-filter" className="text-sm font-medium text-slate-600 whitespace-nowrap">
        Mes:
      </label>
      {!isAllMonths && (
        <input
          id="month-filter"
          type="month"
          value={selectedMonth}
          onChange={(e) => update(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-clinic/40"
        />
      )}
      <button
        type="button"
        onClick={() => update(isAllMonths ? todayMonth : "all")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
          isAllMonths
            ? "bg-clinic text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        Todos los meses
      </button>
    </div>
  );
}
