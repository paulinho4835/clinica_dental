"use client";

import {
  colorFor,
  isAnterior,
  markColorOf,
  type Surface,
  type ToothState,
} from "@/lib/odontogram/types";

interface Props {
  fdi: string;
  state?: ToothState;
  size?: number;
  onSurfaceClick?: (fdi: string, surface: Surface) => void;
  onWholeClick?: (fdi: string) => void;
}

const EMPTY: ToothState = { present: true, whole: null, surfaces: {} };

// Un diente = 5 zonas SVG (centro O + 4 trapecios M/D/V/L). Cero imágenes.
// Anteriores (incisivos/caninos) se recortan en círculo; posteriores en
// cuadrado redondeado. Los colores se adaptan a claro/oscuro vía variables.
export function Tooth({ fdi, state = EMPTY, size = 46, onSurfaceClick, onWholeClick }: Props) {
  const s = state.surfaces ?? {};
  const noteCount = state.notes?.length ?? 0;
  const absent = !state.present || state.whole === "ausente";
  const extract = state.whole === "extraccion_indicada";
  const markColor = markColorOf(state.whole); // X completa (rojo/azul) o null
  const anterior = isAnterior(fdi);
  const c = size; // lado del cuadro
  const t = size / 3; // grosor de banda externa
  const clipId = `odo-clip-${fdi}`;
  const stroke = "var(--tooth-stroke)";

  const zone = (surface: Surface, points: string) => (
    <polygon
      points={points}
      fill={colorFor(s[surface])}
      stroke={stroke}
      strokeWidth={0.7}
      className={onSurfaceClick ? "odo-surface" : undefined}
      onClick={() => onSurfaceClick?.(fdi, surface)}
      style={{ cursor: onSurfaceClick ? "pointer" : "default" }}
    />
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={c}
        height={c}
        viewBox={`0 0 ${c} ${c}`}
        role="img"
        aria-label={`Diente ${fdi}${noteCount ? `, ${noteCount} nota${noteCount === 1 ? "" : "s"} personalizada${noteCount === 1 ? "" : "s"}` : ""}`}
        className="drop-shadow-sm"
      >
        <defs>
          <clipPath id={clipId}>
            {anterior ? (
              <circle cx={c / 2} cy={c / 2} r={c / 2 - 1} />
            ) : (
              <rect x={1} y={1} width={c - 2} height={c - 2} rx={6} ry={6} />
            )}
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* Vestibular (arriba) */}
          {zone("V", `0,0 ${c},0 ${c - t},${t} ${t},${t}`)}
          {/* Lingual/Palatino (abajo) */}
          {zone("L", `${t},${c - t} ${c - t},${c - t} ${c},${c} 0,${c}`)}
          {/* Mesial (izquierda) */}
          {zone("M", `0,0 ${t},${t} ${t},${c - t} 0,${c}`)}
          {/* Distal (derecha) */}
          {zone("D", `${c},0 ${c},${c} ${c - t},${c - t} ${c - t},${t}`)}
          {/* Oclusal / Incisal (centro) */}
          <rect
            x={t}
            y={t}
            width={c - 2 * t}
            height={c - 2 * t}
            fill={colorFor(s.O)}
            stroke={stroke}
            strokeWidth={0.7}
            className={onSurfaceClick ? "odo-surface" : undefined}
            onClick={() => onSurfaceClick?.(fdi, "O")}
            style={{ cursor: onSurfaceClick ? "pointer" : "default" }}
          />
        </g>

        {/* Contorno del diente (sobre las zonas, sin recibir clicks). */}
        {anterior ? (
          <circle
            cx={c / 2}
            cy={c / 2}
            r={c / 2 - 1}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            pointerEvents="none"
          />
        ) : (
          <rect
            x={1}
            y={1}
            width={c - 2}
            height={c - 2}
            rx={6}
            ry={6}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            pointerEvents="none"
          />
        )}

        {/* ── Overlays de estado del diente completo ──────────────────────── */}
        <g pointerEvents="none">
          {/* Ausente: X gris. Extracción indicada: X roja. */}
          {(absent || extract) && (
            <g stroke={extract ? "#dc2626" : "#94a3b8"} strokeWidth={2.5} strokeLinecap="round">
              <line x1={5} y1={5} x2={c - 5} y2={c - 5} />
              <line x1={c - 5} y1={5} x2={5} y2={c - 5} />
            </g>
          )}
          {state.whole === "corona" && (
            <circle cx={c / 2} cy={c / 2} r={c / 2 - 4} fill="none" stroke="#eab308" strokeWidth={2.5} />
          )}
          {state.whole === "endodoncia" && (
            <line x1={c / 2} y1={5} x2={c / 2} y2={c - 5} stroke="#a855f7" strokeWidth={2.5} strokeLinecap="round" />
          )}
          {state.whole === "implante" && (
            <text x={c / 2} y={c / 2 + 5} textAnchor="middle" fontSize={15} fontWeight="bold" fill="#06b6d4">
              ⊕
            </text>
          )}
          {state.whole === "protesis" && (
            <rect
              x={5}
              y={c / 2 - 6}
              width={c - 10}
              height={12}
              rx={3}
              fill="none"
              stroke="#d946ef"
              strokeWidth={2}
              strokeDasharray="3 2"
            />
          )}
          {state.whole === "perno" && (
            <rect
              x={c / 2 - 2.5}
              y={c / 2 - 10}
              width={5}
              height={20}
              rx={1.5}
              fill="#6366f1"
            />
          )}
          {state.whole === "movilidad" && (
            <text x={c / 2} y={c / 2 + 5} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#ec4899">
              ↔
            </text>
          )}
          {state.whole === "en_erupcion" && (
            <text x={c / 2} y={c / 2 + 5} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#0d9488">
              ↑
            </text>
          )}
          {/* Marca X completa: tratamiento requerido (rojo) / existente (azul). */}
          {markColor && (
            <g stroke={markColor} strokeWidth={3} strokeLinecap="round">
              <line x1={4} y1={4} x2={c - 4} y2={c - 4} />
              <line x1={c - 4} y1={4} x2={4} y2={c - 4} />
            </g>
          )}
          {noteCount > 0 && (
            <g>
              <circle cx={c - 6} cy={6} r={5} fill="#7c3aed" />
              <text x={c - 6} y={8.5} textAnchor="middle" fontSize={8} fontWeight="bold" fill="white">
                {noteCount > 9 ? "9+" : noteCount}
              </text>
            </g>
          )}
        </g>
      </svg>

      <button
        type="button"
        onClick={() => onWholeClick?.(fdi)}
        title={`Diente ${fdi}`}
        className="rounded px-1 text-[10px] font-semibold tabular-nums text-slate-500 transition hover:bg-slate-100 hover:text-clinic-fg"
        style={{ cursor: onWholeClick ? "pointer" : "default" }}
      >
        {fdi}
      </button>
    </div>
  );
}
