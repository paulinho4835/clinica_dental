"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
  clinicId,
  patientId,
  initialTeeth,
}: {
  clinicId: string;
  patientId: string;
  initialTeeth: TeethMap;
}) {
  const [teeth, setTeeth] = useState<TeethMap>(initialTeeth);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

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
    const supabase = createClient();
    await supabase
      .from("odontograms")
      .upsert(
        { clinic_id: clinicId, patient_id: patientId, teeth },
        { onConflict: "patient_id" },
      );
    setSaving(false);
    setDirty(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Click en una cara cicla su estado; click en el número FDI cicla el estado del diente completo.
        Todo se guarda como datos (JSONB) — sin imágenes.
      </p>
      <Odontogram teeth={teeth} onSurfaceClick={onSurfaceClick} onWholeClick={onWholeClick} />
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
