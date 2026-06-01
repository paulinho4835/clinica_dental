"use client";

import { Tooth } from "./Tooth";
import {
  CONDITION_COLORS,
  MARK_COLORS,
  MARK_LABELS,
  QUADRANTS,
  type Surface,
  type TeethMap,
} from "@/lib/odontogram/types";

interface Props {
  teeth: TeethMap;
  onSurfaceClick?: (fdi: string, surface: Surface) => void;
  onWholeClick?: (fdi: string) => void;
}

// Odontograma completo dibujado 100% en SVG desde el JSONB. Ninguna imagen.
export function Odontogram({ teeth, onSurfaceClick, onWholeClick }: Props) {
  const row = (fdis: string[]) => (
    <div className="flex gap-1">
      {fdis.map((fdi) => (
        <Tooth
          key={fdi}
          fdi={fdi}
          state={teeth[fdi]}
          onSurfaceClick={onSurfaceClick}
          onWholeClick={onWholeClick}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="inline-block rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex gap-6 border-b border-dashed border-slate-300 pb-3">
          {row(QUADRANTS[0])}
          {row(QUADRANTS[1])}
        </div>
        <div className="flex gap-6 pt-3">
          {row(QUADRANTS[2])}
          {row(QUADRANTS[3])}
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {/* Marcas X de diente completo (las que pone el número FDI). */}
      <span className="flex items-center gap-1 font-medium">
        <span style={{ color: MARK_COLORS.rojo }}>✕</span>
        {MARK_LABELS.rojo}
      </span>
      <span className="flex items-center gap-1 font-medium">
        <span style={{ color: MARK_COLORS.azul }}>✕</span>
        {MARK_LABELS.azul}
      </span>
      <span className="mx-1 text-slate-300">|</span>
      {Object.entries(CONDITION_COLORS)
        .filter(([k]) => k !== "sano")
        .map(([code, color]) => (
          <span key={code} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-sm ring-1 ring-slate-300"
              style={{ background: color }}
            />
            {code}
          </span>
        ))}
    </div>
  );
}
