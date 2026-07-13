"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyModulePreset } from "@/app/(dashboard)/superadmin/actions";
import { MODULE_PRESET_LABELS, type ModulePreset } from "@/lib/features";
import { confirm } from "@/lib/confirm";

const PRESETS: ModulePreset[] = ["consultorio", "clinica"];

export function ModulePresetButtons({
  clinicId,
  active,
}: {
  clinicId: string;
  /** Preset detectado del estado actual, o null si es una combinación armada a mano. */
  active: ModulePreset | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function apply(preset: ModulePreset) {
    if (preset === active) return;
    const ok = await confirm({
      title: `Aplicar plan "${MODULE_PRESET_LABELS[preset]}"`,
      message:
        preset === "consultorio"
          ? "Apagará Inventario, Dashboard, Cuentas de pacientes y Auditoría. Los add-ons no se tocan."
          : "Encenderá todos los módulos (Inventario, Dashboard, Cuentas de pacientes y Auditoría).",
      confirmText: "Aplicar",
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("clinicId", clinicId);
    fd.set("preset", preset);
    startTransition(async () => {
      await applyModulePreset(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          disabled={pending}
          onClick={() => apply(p)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
            active === p
              ? "bg-clinic text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {MODULE_PRESET_LABELS[p]}
        </button>
      ))}
      {active === null && (
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:bg-amber-500/10">
          Personalizado
        </span>
      )}
    </div>
  );
}
