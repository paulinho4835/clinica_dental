"use client";

import { colorFor, type Surface, type ToothState } from "@/lib/odontogram/types";

interface Props {
  fdi: string;
  state?: ToothState;
  size?: number;
  onSurfaceClick?: (fdi: string, surface: Surface) => void;
  onWholeClick?: (fdi: string) => void;
}

const EMPTY: ToothState = { present: true, whole: null, surfaces: {} };

// Un diente = 5 zonas SVG (centro O + 4 trapecios M/D/V/L). Cero imágenes.
export function Tooth({ fdi, state = EMPTY, size = 44, onSurfaceClick, onWholeClick }: Props) {
  const s = state.surfaces ?? {};
  const absent = !state.present || state.whole === "ausente";
  const c = size; // lado del cuadro
  const t = size / 3; // grosor de banda externa

  const zone = (surface: Surface, points: string) => (
    <polygon
      points={points}
      fill={colorFor(s[surface])}
      stroke="#334155"
      strokeWidth={0.6}
      onClick={() => onSurfaceClick?.(fdi, surface)}
      style={{ cursor: onSurfaceClick ? "pointer" : "default" }}
    />
  );

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={c} height={c} viewBox={`0 0 ${c} ${c}`} role="img" aria-label={`Diente ${fdi}`}>
        {/* Vestibular (arriba) */}
        {zone("V", `0,0 ${c},0 ${c - t},${t} ${t},${t}`)}
        {/* Lingual/Palatino (abajo) */}
        {zone("L", `${t},${c - t} ${c - t},${c - t} ${c},${c} 0,${c}`)}
        {/* Mesial (izquierda) */}
        {zone("M", `0,0 ${t},${t} ${t},${c - t} 0,${c}`)}
        {/* Distal (derecha) */}
        {zone("D", `${c},0 ${c},${c} ${c - t},${c - t} ${c - t},${t}`)}
        {/* Oclusal (centro) */}
        <rect
          x={t} y={t} width={c - 2 * t} height={c - 2 * t}
          fill={colorFor(s.O)} stroke="#334155" strokeWidth={0.6}
          onClick={() => onSurfaceClick?.(fdi, "O")}
          style={{ cursor: onSurfaceClick ? "pointer" : "default" }}
        />

        {/* Overlays de estado del diente completo */}
        {absent && (
          <g stroke="#dc2626" strokeWidth={2.5}>
            <line x1={2} y1={2} x2={c - 2} y2={c - 2} />
            <line x1={c - 2} y1={2} x2={2} y2={c - 2} />
          </g>
        )}
        {state.whole === "corona" && (
          <circle cx={c / 2} cy={c / 2} r={c / 2 - 3} fill="none" stroke="#eab308" strokeWidth={2.5} />
        )}
        {state.whole === "endodoncia" && (
          <line x1={c / 2} y1={3} x2={c / 2} y2={c - 3} stroke="#a855f7" strokeWidth={2.5} />
        )}
        {state.whole === "implante" && (
          <text x={c / 2} y={c / 2 + 4} textAnchor="middle" fontSize={12} fill="#06b6d4">⊕</text>
        )}
      </svg>
      <button
        type="button"
        onClick={() => onWholeClick?.(fdi)}
        className="text-[10px] tabular-nums text-slate-500 hover:text-clinic-fg"
      >
        {fdi}
      </button>
    </div>
  );
}
