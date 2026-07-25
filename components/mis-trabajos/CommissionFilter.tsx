"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Filtro por estado de la comisión del doctor: "lo que ya me pagaron" vs.
// "lo que me falta cobrar". Antes ese dato solo se veía trabajo por trabajo
// (badge "Pagada ✓" / "Abono Bs X" en cada fila), así que para saber qué le
// debían el doctor tenía que leer la tabla entera a ojo.
//
// Los trabajos con abono parcial cuentan como PENDIENTES: todavía se les debe
// algo. El badge de la fila muestra cuánto se les abonó ya.
const OPTIONS = [
  { value: "", label: "Todas" },
  { value: "pending", label: "Por cobrar" },
  { value: "paid", label: "Ya pagadas" },
];

export function CommissionFilter({ selected }: { selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onClick(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("comision", value);
    else next.delete("comision");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-sm font-medium text-slate-600">
        Comisión:
      </span>
      <div className="flex gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onClick(o.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selected === o.value
                ? "bg-clinic text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
