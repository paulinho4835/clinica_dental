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
  CUSTOM_NOTE_COLOR,
  type Surface,
  type TeethMap,
} from "@/lib/odontogram/types";

interface Props {
  teeth: TeethMap;
  onSurfaceClick?: (fdi: string, surface: Surface) => void;
  onWholeClick?: (fdi: string) => void;
  /** Cuadrantes a dibujar; por defecto la dentición permanente (adultos). */
  quadrants?: string[][];
  /** Números FDI de cuadrante a mostrar, en orden [top-l, top-r, bottom-l, bottom-r]. */
  quadrantNumbers?: [number, number, number, number];
  /** El editor muestra una versión con acciones para las notas. */
  hideNotes?: boolean;
}

// Odontograma completo dibujado 100% en SVG desde el JSONB. Ninguna imagen.
export function Odontogram({
  teeth,
  onSurfaceClick,
  onWholeClick,
  quadrants = QUADRANTS,
  quadrantNumbers = [1, 2, 4, 3],
  hideNotes = false,
}: Props) {
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

  const [topLeft, topRight, bottomLeft, bottomRight] = quadrantNumbers;

  return (
    <div className="space-y-4">
      <div className="inline-block overflow-x-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="min-w-max">
          {/* Etiquetas de cuadrantes superiores */}
          <div className="mb-1 flex justify-between px-1">
            {qLabel(topLeft, "l")}
            {qLabel(topRight, "r")}
          </div>

          {/* Arcada superior */}
          <div className="flex items-start">
            {row(quadrants[0])}
            {midline}
            {row(quadrants[1])}
          </div>

          {/* Línea de oclusión (separa maxilar de mandíbula) */}
          <div className="my-3 border-t-2 border-dashed border-slate-300" />

          {/* Arcada inferior */}
          <div className="flex items-start">
            {row(quadrants[2])}
            {midline}
            {row(quadrants[3])}
          </div>

          {/* Etiquetas de cuadrantes inferiores */}
          <div className="mt-1 flex justify-between px-1">
            {qLabel(bottomLeft, "l")}
            {qLabel(bottomRight, "r")}
          </div>
        </div>
      </div>

      <Legend />
      {!hideNotes && <NotesSummary teeth={teeth} />}
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
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: CUSTOM_NOTE_COLOR }} />
        Nota personalizada (el número indica cuántas tiene el diente)
      </div>
    </div>
  );
}

export function NotesSummary({ teeth }: { teeth: TeethMap }) {
  const notes = Object.entries(teeth).flatMap(([fdi, tooth]) =>
    (tooth.notes ?? []).map((note) => ({ fdi, ...note })),
  );

  if (notes.length === 0) return null;

  return (
    <div className="rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
        Notas personalizadas
      </p>
      <ul className="space-y-1 text-sm text-slate-700">
        {notes.map((note) => (
          <li key={`${note.fdi}-${note.id}`}>
            <span className="font-medium">Diente {note.fdi}{note.surface ? ` · cara ${note.surface}` : " · diente completo"}:</span>{" "}
            {note.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
