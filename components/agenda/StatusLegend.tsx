"use client";

import { AGENDA_STATUSES } from "./apptHelpers";

// Leyenda de estados que además funciona como filtro. Cada chip muestra el
// color, la etiqueta y el conteo del estado dentro del alcance visible.
// Sin selección = se muestran todos. Al activar uno o varios, la agenda
// muestra solo esos estados y el resto de los chips se atenúan.
export function StatusLegend({
  counts,
  active,
  onToggle,
  onReset,
}: {
  counts: Record<string, number>;
  active: Set<string>;
  onToggle: (status: string) => void;
  onReset: () => void;
}) {
  const hasFilter = active.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onReset}
        className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
          !hasFilter
            ? "bg-slate-800 text-white ring-slate-800"
            : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
        }`}
      >
        Todos
      </button>

      {AGENDA_STATUSES.map((s) => {
        const on = active.has(s.key);
        const count = counts[s.key] ?? 0;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onToggle(s.key)}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
              on
                ? "bg-slate-800 text-white ring-slate-800"
                : `bg-white ring-slate-200 hover:bg-slate-50 ${
                    hasFilter ? "text-slate-400" : "text-slate-600"
                  }`
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
            {s.label}
            <span
              className={`tabular-nums ${on ? "opacity-80" : "text-slate-400"}`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
