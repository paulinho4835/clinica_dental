"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser } from "lucide-react";
import { saveOdontogram } from "@/app/(dashboard)/pacientes/odontogram-actions";
import { Odontogram } from "./Odontogram";
import {
  CONDITION_COLORS,
  CONDITION_LABELS,
  MARK_COLORS,
  MARK_LABELS,
  SURFACE_CONDITIONS,
  WHOLE_CONDITIONS,
  markWhole,
  type MarkColor,
  type Surface,
  type TeethMap,
  type ToothState,
} from "@/lib/odontogram/types";

const DEFAULT_TOOTH: ToothState = { present: true, whole: null, surfaces: {} };

// Herramienta activa de la paleta. Define qué pasa al clicar el diente.
type Tool =
  | { kind: "surface"; code: string } // se pinta en una cara
  | { kind: "whole"; code: string } // afecta al diente completo
  | { kind: "mark"; code: MarkColor } // X de color sobre el diente
  | { kind: "erase" }; // borra cara/diente

// Firma compartida con saveOdontogram/savePediatricOdontogram: ambas devuelven
// el mismo shape de ActionState sin acoplar este componente a un archivo de
// acciones específico.
type SaveAction = (
  patientId: string,
  prevTeeth: TeethMap,
  nextTeeth: TeethMap,
) => Promise<{ error?: string; ok?: boolean }>;

export function OdontogramEditor({
  patientId,
  initialTeeth,
  canWrite,
  quadrants,
  quadrantNumbers,
  saveAction = saveOdontogram,
}: {
  patientId: string;
  initialTeeth: TeethMap;
  /** Solo admin y doctores pueden editar; el resto ve el odontograma en solo lectura. */
  canWrite: boolean;
  /** Cuadrantes a dibujar; por defecto la dentición permanente (adultos). */
  quadrants?: string[][];
  /** Números FDI de cuadrante a mostrar; ver Odontogram.tsx. */
  quadrantNumbers?: [number, number, number, number];
  /** Server action de guardado; por defecto saveOdontogram (adultos). */
  saveAction?: SaveAction;
}) {
  const router = useRouter();
  const [teeth, setTeeth] = useState<TeethMap>(initialTeeth);
  // Baseline = último estado guardado; sirve para calcular el diff en cada save.
  const [baseline, setBaseline] = useState<TeethMap>(initialTeeth);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>({ kind: "surface", code: "caries" });

  // Aplica la herramienta whole/mark a un diente (toggle si ya la tiene).
  function applyWhole(fdi: string, code: string | null) {
    setTeeth((prev) => {
      const tooth = prev[fdi] ?? DEFAULT_TOOTH;
      const updated = tooth.whole === code ? null : code;
      return { ...prev, [fdi]: { ...tooth, whole: updated } };
    });
    setDirty(true);
  }

  // Click en una cara: depende de la herramienta activa.
  function onSurfaceClick(fdi: string, surface: Surface) {
    if (tool.kind === "whole") return applyWhole(fdi, tool.code);
    if (tool.kind === "mark") return applyWhole(fdi, markWhole(tool.code));

    setTeeth((prev) => {
      const tooth = prev[fdi] ?? DEFAULT_TOOTH;
      const surfaces = { ...tooth.surfaces };
      if (tool.kind === "erase") delete surfaces[surface];
      else surfaces[surface] = tool.code; // surface
      return { ...prev, [fdi]: { ...tooth, surfaces } };
    });
    setDirty(true);
  }

  // Click en el número FDI: aplica la herramienta de diente completo.
  function onWholeClick(fdi: string) {
    if (tool.kind === "surface") return; // las caras se pintan en el diente
    if (tool.kind === "erase") return applyWhole(fdi, null);
    if (tool.kind === "mark") return applyWhole(fdi, markWhole(tool.code));
    applyWhole(fdi, tool.code); // whole
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveAction(patientId, baseline, teeth);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setBaseline(teeth); // nuevo baseline para el próximo diff
    setDirty(false);
    router.refresh();
  }

  const isActive = (t: Tool): boolean => {
    if (t.kind !== tool.kind) return false;
    if (t.kind === "erase" || tool.kind === "erase") return true;
    return t.code === tool.code;
  };

  const swatchBtn = (t: Extract<Tool, { code: string }>, color: string, label: string) => (
    <button
      key={`${t.kind}-${t.code}`}
      type="button"
      onClick={() => setTool(t)}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${
        isActive(t)
          ? "bg-clinic/10 text-clinic-fg ring-clinic"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
      }`}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-sm ring-1 ring-slate-300"
        style={{ background: color }}
      />
      {label}
    </button>
  );

  if (!canWrite) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Vista de solo lectura. Solo los doctores y el administrador pueden modificar el
          odontograma.
        </p>
        <Odontogram
          teeth={teeth}
          onSurfaceClick={() => {}}
          onWholeClick={() => {}}
          quadrants={quadrants}
          quadrantNumbers={quadrantNumbers}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Elige una condición y haz clic en la <strong>cara</strong> del diente. Para
        condiciones de <strong>diente completo</strong> y <strong>marcas X</strong>, haz
        clic en el número o sobre el diente.
      </p>

      {/* ── Paleta ────────────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Caras
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SURFACE_CONDITIONS.map((code) =>
              swatchBtn({ kind: "surface", code }, CONDITION_COLORS[code], CONDITION_LABELS[code]),
            )}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Diente completo
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WHOLE_CONDITIONS.map((code) =>
              swatchBtn({ kind: "whole", code }, CONDITION_COLORS[code], CONDITION_LABELS[code]),
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Marcas X
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["rojo", "azul"] as MarkColor[]).map((m) => {
                const t: Tool = { kind: "mark", code: m };
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTool(t)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${
                      isActive(t)
                        ? "bg-clinic/10 text-clinic-fg ring-clinic"
                        : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                    }`}
                  >
                    <span className="text-sm font-bold" style={{ color: MARK_COLORS[m] }}>
                      ✕
                    </span>
                    {MARK_LABELS[m]}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setTool({ kind: "erase" })}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${
              tool.kind === "erase"
                ? "bg-clinic/10 text-clinic-fg ring-clinic"
                : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
            }`}
          >
            <Eraser className="h-3.5 w-3.5" />
            Borrar
          </button>
        </div>
      </div>

      <Odontogram
        teeth={teeth}
        onSurfaceClick={onSurfaceClick}
        onWholeClick={onWholeClick}
        quadrants={quadrants}
        quadrantNumbers={quadrantNumbers}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={save}
        disabled={!dirty || saving}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
      >
        {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Sin cambios"}
      </button>
    </div>
  );
}
