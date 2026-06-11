"use client";

import { Tooth } from "./Tooth";
import {
  CONDITION_COLORS,
  CONDITION_LABELS,
  MARK_COLORS,
  MARK_LABELS,
  QUADRANTS,
  SURFACE_CONDITIONS,
  WHOLE_CONDITIONS,
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

  const midline = (
    <div
      className="mx-2 self-stretch border-l-2 border-dashed border-slate-300"
      aria-hidden
    />
  );

  const qLabel = (n: number, side: "l" | "r") => (
    <span
      className={`text-[10px] font-semibold text-slate-400 ${side === "l" ? "text-left" : "text-right"}`}
    >
      Cuadrante {n}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="inline-block overflow-x-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="min-w-max">
          {/* Etiquetas de cuadrantes superiores */}
          <div className="mb-1 flex justify-between px-1">
            {qLabel(1, "l")}
            {qLabel(2, "r")}
          </div>

          {/* Arcada superior */}
          <div className="flex items-start">
            {row(QUADRANTS[0])}
            {midline}
            {row(QUADRANTS[1])}
          </div>

          {/* Línea de oclusión (separa maxilar de mandíbula) */}
          <div className="my-3 border-t-2 border-dashed border-slate-300" />

          {/* Arcada inferior */}
          <div className="flex items-start">
            {row(QUADRANTS[2])}
            {midline}
            {row(QUADRANTS[3])}
          </div>

          {/* Etiquetas de cuadrantes inferiores */}
          <div className="mt-1 flex justify-between px-1">
            {qLabel(4, "l")}
            {qLabel(3, "r")}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Swatch({ code }: { code: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-600">
      <span
        className="inline-block h-3.5 w-3.5 rounded-sm ring-1 ring-slate-300"
        style={{ background: CONDITION_COLORS[code] }}
      />
      {CONDITION_LABELS[code] ?? code}
    </span>
  );
}

function Legend() {
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Caras
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {SURFACE_CONDITIONS.map((code) => (
            <Swatch key={code} code={code} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Diente completo
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {WHOLE_CONDITIONS.map((code) => (
            <Swatch key={code} code={code} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Marcas
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
            <span style={{ color: MARK_COLORS.rojo }}>✕</span>
            {MARK_LABELS.rojo}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
            <span style={{ color: MARK_COLORS.azul }}>✕</span>
            {MARK_LABELS.azul}
          </span>
        </div>
      </div>
    </div>
  );
}
