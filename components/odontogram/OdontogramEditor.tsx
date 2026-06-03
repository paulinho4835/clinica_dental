"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOdontogram } from "@/app/(dashboard)/pacientes/odontogram-actions";
import { Odontogram } from "./Odontogram";
import {
  MARK_COLORS,
  MARK_LABELS,
  markWhole,
  type MarkColor,
  type Surface,
  type TeethMap,
  type ToothState,
} from "@/lib/odontogram/types";

const SURFACE_CYCLE = [
  "sano", "caries", "resina", "amalgama", "sellante", "fractura",
  "corona", "endodoncia", "implante", "ausente", "extraccion_indicada", "protesis",
];

const DEFAULT_TOOTH: ToothState = { present: true, whole: null, surfaces: {} };

const MARK_ORDER: MarkColor[] = ["rojo", "azul"];

function next<T>(cycle: T[], current: T): T {
  const i = cycle.indexOf(current);
  return cycle[(i + 1) % cycle.length];
}

export function OdontogramEditor({
  patientId,
  initialTeeth,
}: {
  patientId: string;
  initialTeeth: TeethMap;
}) {
  const router = useRouter();
  const [teeth, setTeeth] = useState<TeethMap>(initialTeeth);
  // Baseline = último estado guardado; sirve para calcular el diff en cada save.
  const [baseline, setBaseline] = useState<TeethMap>(initialTeeth);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Color activo de la barra: el que toma la X al clicar el número FDI.
  const [activeMark, setActiveMark] = useState<MarkColor>("rojo");

  function onSurfaceClick(fdi: string, surface: Surface) {
    setTeeth((prev) => {
      const tooth = prev[fdi] ?? DEFAULT_TOOTH;
      const cur = tooth.surfaces[surface] ?? "sano";
      const updated = next(SURFACE_CYCLE, cur);
      return {
        ...prev,
        [fdi]: { ...tooth, surfaces: { ...tooth.surfaces, [surface]: updated } },
      };
    });
    setDirty(true);
  }

  // Clic en el número FDI: marca la X del color activo sobre todo el diente.
  // Si ya tiene esa misma marca, la quita (toggle). Si tiene la otra, la cambia.
  function onWholeClick(fdi: string) {
    const target = markWhole(activeMark);
    setTeeth((prev) => {
      const tooth = prev[fdi] ?? DEFAULT_TOOTH;
      const updated = tooth.whole === target ? null : target;
      return { ...prev, [fdi]: { ...tooth, whole: updated } };
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveOdontogram(patientId, baseline, teeth);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setBaseline(teeth); // nuevo baseline para el próximo diff
    setDirty(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Click en una cara cicla su estado. Click en el <strong>número FDI</strong> marca
        una <strong>X</strong> sobre todo el diente con el color activo.
      </p>

      {/* Barra de color activo (convención odontológica). */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Color activo:</span>
        {MARK_ORDER.map((m) => {
          const on = activeMark === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setActiveMark(m)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-2 transition ${
                on ? "ring-slate-800" : "ring-transparent hover:ring-slate-300"
              }`}
              style={{
                background: MARK_COLORS[m],
                color: "#fff",
              }}
            >
              {on ? "● " : "○ "}
              {MARK_LABELS[m]}
            </button>
          );
        })}
      </div>

      <Odontogram teeth={teeth} onSurfaceClick={onSurfaceClick} onWholeClick={onWholeClick} />
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
