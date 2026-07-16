"use client";

import { blockGeometry } from "@/lib/agenda";
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
}: {
  day: string;
  dentistName: string | null;
  blocks: AvailabilityBlock[];
  axisH: number;
}) {
  if (!dentistName) return null;
  const todays = blocksForDay(day, blocks).filter(
    (b) => b.dentist_name.trim() === dentistName.trim(),
  );
  if (todays.length === 0) return null;

  return (
    <>
      {todays.map((b) => {
        const r = blockRange(day, b);
        const g = blockGeometry(r.start, r.end);
        const h = g.height * axisH;
        return (
          <div
            key={b.id}
            className="pointer-events-none absolute inset-x-0 z-[5] overflow-hidden rounded-sm bg-slate-300/40 ring-1 ring-inset ring-slate-300/60 dark:bg-slate-500/20"
            style={{
              top: g.top * axisH,
              height: h,
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(100,116,139,0.12) 6px, rgba(100,116,139,0.12) 12px)",
            }}
            title={`No disponible${b.reason ? ` · ${b.reason}` : ""}`}
          >
            {h >= 24 && (
              <span className="block truncate px-1.5 pt-0.5 text-[10px] font-medium text-slate-500">
                No disponible{b.reason ? ` · ${b.reason}` : ""}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
