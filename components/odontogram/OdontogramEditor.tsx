"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOdontogram } from "@/app/(dashboard)/pacientes/odontogram-actions";
import { Odontogram } from "./Odontogram";
import type { Surface, TeethMap, ToothState } from "@/lib/odontogram/types";

const SURFACE_CYCLE = ["sano", "caries", "resina", "amalgama", "sellante", "fractura"];
const WHOLE_CYCLE = [null, "corona", "endodoncia", "implante", "ausente", "extraccion_indicada"];

const DEFAULT_TOOTH: ToothState = { present: true, whole: null, surfaces: {} };

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

  function onWholeClick(fdi: string) {
    setTeeth((prev) => {
      const tooth = prev[fdi] ?? DEFAULT_TOOTH;
      const updated = next(WHOLE_CYCLE, tooth.whole);
      return {
        ...prev,
        [fdi]: { ...tooth, whole: updated, present: updated !== "ausente" },
      };
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
        Click en una cara cicla su estado; click en el número FDI cicla el estado del diente completo.
        Todo se guarda como datos (JSONB) — sin imágenes.
      </p>
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
