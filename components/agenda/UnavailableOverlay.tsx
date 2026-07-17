"use client";

import { blockGeometry, assignLanes } from "@/lib/agenda";
import {
  blocksForDay,
  blockRange,
  type AvailabilityBlock,
} from "@/lib/availability";

// Franjas grises "no disponible" dentro de un carril de la agenda.
// pointer-events-none: el gris informa pero no impide clicar la franja para
// agendar (la advertencia al agendar es la que avisa; decisión de diseño:
// advertir, no bloquear). z-[5]: sobre los slots clicables (z-0) y las líneas
// de hora, debajo de las citas (z-10).
export function UnavailableOverlay({
  day,
  dentistName,
  blocks,
  axisH,
  allDoctors,
}: {
  day: string;
  dentistName: string | null;
  blocks: AvailabilityBlock[];
  axisH: number;
  /** Sin doctor filtrado (dentistName=null): si se pasa esta lista de nombres
      (admin/odontólogo/colega/especialista), se pintan los bloques de TODOS
      esos doctores lado a lado con su nombre, en vez de no pintar nada. */
  allDoctors?: string[];
}) {
  const relevant = dentistName
    ? blocksForDay(day, blocks).filter(
        (b) => b.dentist_name.trim() === dentistName.trim(),
      )
    : allDoctors && allDoctors.length > 0
      ? blocksForDay(day, blocks).filter((b) =>
          allDoctors.some((n) => n.trim() === b.dentist_name.trim()),
        )
      : [];
  if (relevant.length === 0) return null;

  // Con un solo doctor filtrado (caso original) no hace falta rotular el
  // nombre; con "Todos" cada franja debe decir de quién es.
  const labelWithName = !dentistName;

  const laid = assignLanes(
    relevant.map((b) => {
      const r = blockRange(day, b);
      return { ...b, starts_at: r.start.toISOString(), ends_at: r.end.toISOString() };
    }),
  );

  return (
    <>
      {laid.map(({ appt: b, lane, lanes }) => {
        const r = blockRange(day, b);
        const g = blockGeometry(r.start, r.end);
        const h = g.height * axisH;
        const label = labelWithName
          ? `${b.dentist_name}${b.reason ? ` · ${b.reason}` : ""}`
          : `No disponible${b.reason ? ` · ${b.reason}` : ""}`;
        return (
          <div
            key={b.id}
            className="pointer-events-none absolute z-[5] overflow-hidden rounded-sm bg-slate-300/40 ring-1 ring-inset ring-slate-300/60 dark:bg-slate-500/20"
            style={{
              top: g.top * axisH,
              height: h,
              left: `${(lane / lanes) * 100}%`,
              width: `${(1 / lanes) * 100}%`,
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(100,116,139,0.12) 6px, rgba(100,116,139,0.12) 12px)",
            }}
            title={label}
          >
            {h >= 24 && (
              <span className="block truncate px-1.5 pt-0.5 text-[10px] font-medium text-slate-500">
                {label}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
