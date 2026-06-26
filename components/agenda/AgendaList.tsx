"use client";

// Vista de lista para móvil: las grillas de columnas (día) y de 7 columnas
// (semana) son incómodas en pantallas chicas. Esta lista muestra las citas del
// día como tarjetas verticales tocables, con control de asistencia inline.

import { type MonthAppt, apptName, apptCI, isQuickConsult } from "./apptHelpers";
import { useDoctorColor } from "@/lib/agenda/doctorColor";
import { STEP_MIN } from "@/lib/agenda";
import { MiniStatus } from "./MiniStatus";
import { Pencil, Link } from "lucide-react";

const hhmm = (d: Date) =>
  d.toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AgendaList({
  appts,
  canWrite,
  onEdit,
  onLink,
}: {
  appts: MonthAppt[];
  canWrite: boolean;
  onEdit: (a: MonthAppt) => void;
  onLink: (a: MonthAppt) => void;
}) {
  const getDoctorColor = useDoctorColor();

  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        {canWrite ? "Día libre." : "Sin citas este día."}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {sorted.map((a) => {
        const s = new Date(a.starts_at);
        const e = a.ends_at
          ? new Date(a.ends_at)
          : new Date(s.getTime() + STEP_MIN * 60_000);
        const col = getDoctorColor(a.dentist_name ?? "");
        const noShow = a.status === "no_show";

        return (
          <li
            key={a.id}
            className={`flex gap-3 rounded-lg border-l-4 bg-white p-3 shadow-sm ring-1 ring-slate-200 ${col.border}`}
          >
            {/* Hora */}
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold tabular-nums text-slate-700">
                {hhmm(s)}
              </div>
              <div className="text-[11px] tabular-nums text-slate-400">{hhmm(e)}</div>
            </div>

            {/* Detalle */}
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-medium text-slate-800 ${
                  noShow ? "line-through opacity-60" : ""
                }`}
              >
                {apptName(a)}
              </p>
              {a.dentist_name && (
                <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
                  {a.dentist_name}
                </p>
              )}
              {a.reason && (
                <p className="truncate text-xs italic text-slate-400">{a.reason}</p>
              )}
              {apptCI(a) && (
                <p className="truncate text-[11px] text-slate-400">CI {apptCI(a)}</p>
              )}
              {isQuickConsult(a) && (
                <p className="text-[11px] text-amber-600">sin registrar</p>
              )}

              {canWrite && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <MiniStatus id={a.id} status={a.status} canWrite={canWrite} />
                  {isQuickConsult(a) && (
                    <button
                      type="button"
                      onClick={() => onLink(a)}
                      className="inline-flex items-center gap-1 rounded border border-clinic px-2 py-0.5 text-[11px] font-medium text-clinic hover:bg-clinic hover:text-white"
                    >
                      <Link className="h-3 w-3" /> Vincular
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(a)}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
