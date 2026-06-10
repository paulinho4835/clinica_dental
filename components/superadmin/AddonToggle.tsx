"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFeature } from "@/app/(dashboard)/superadmin/actions";
import type { FeatureKey } from "@/lib/features";

const ICONS: Partial<Record<FeatureKey, string>> = {
  whatsapp: "💬",
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

  function flip() {
    const next = !optimisticEnabled;
    startTransition(async () => {
      setOptimistic(next);
      const fd = new FormData();
      fd.set("clinicId", clinicId);
      fd.set("key", featureKey);
      fd.set("enabled", String(next));
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
