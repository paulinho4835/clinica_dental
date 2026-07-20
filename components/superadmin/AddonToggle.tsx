"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFeature } from "@/app/(dashboard)/superadmin/actions";
import { FOTOS_DEFAULT_QUOTA, type FeatureKey } from "@/lib/features";
import { confirm } from "@/lib/confirm";

const ICONS: Partial<Record<FeatureKey, string>> = {
  whatsapp: "💬",
  recetas: "📄",
  consentimientos: "📝",
};

export function AddonToggle({
  clinicId,
  featureKey,
  label,
  enabled,
}: {
  clinicId: string;
  featureKey: FeatureKey;
  label: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticEnabled, setOptimistic] = useOptimistic(enabled);

  async function flip() {
    const next = !optimisticEnabled;

    // Al activar el addon de fotos, se pregunta el cupo en el momento en vez
    // de dejarlo en el default hasta que alguien lo edite aparte. Ese prompt
    // ya cumple el rol de "¿estás seguro?" para fotos — no se le suma un
    // segundo diálogo.
    let fotosMax: number | null = null;
    if (featureKey === "fotos" && next) {
      const input = window.prompt(
        "¿Cuántas fotos incluye este plan?",
        String(FOTOS_DEFAULT_QUOTA),
      );
      if (input === null) return; // canceló: no se activa el addon
      const n = Number(input);
      if (!Number.isInteger(n) || n <= 0) {
        window.alert("Número inválido. El addon no se activó.");
        return;
      }
      fotosMax = n;
    } else if (next) {
      // Resto de los add-ons: confirmación explícita al activar, para que
      // no se "escape de las manos" un clic accidental. Desactivar sigue
      // siendo instantáneo (reversible, bajo riesgo).
      const ok = await confirm({
        title: "Activar add-on",
        message: `¿Activar "${label}" para esta clínica?`,
        confirmText: "Activar",
        cancelText: "Cancelar",
        tone: "default",
      });
      if (!ok) return;
    }

    startTransition(async () => {
      setOptimistic(next);
      const fd = new FormData();
      fd.set("clinicId", clinicId);
      fd.set("key", featureKey);
      fd.set("enabled", String(next));
      if (fotosMax !== null) fd.set("fotosMax", String(fotosMax));
      await toggleFeature(fd);
    });
  }

  const icon = ICONS[featureKey];

  return (
    <button
      type="button"
      onClick={flip}
      disabled={pending}
      title={
        optimisticEnabled
          ? "Add-on activo — clic para desactivar"
          : "Add-on inactivo — clic para activar"
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all disabled:cursor-wait disabled:opacity-60 ${
        optimisticEnabled
          ? "bg-green-500 text-white ring-green-600 hover:bg-green-600"
          : "bg-slate-100 text-slate-500 ring-slate-300 hover:bg-slate-200"
      }`}
    >
      {pending ? (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <span aria-hidden>{optimisticEnabled ? "✓" : "○"}</span>
      )}
      {icon && <span aria-hidden>{icon}</span>}
      {label}
    </button>
  );
}
