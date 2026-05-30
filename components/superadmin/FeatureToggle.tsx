"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFeature } from "@/app/(dashboard)/superadmin/actions";
import type { FeatureKey } from "@/lib/features";

export function FeatureToggle({
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
  const router = useRouter();

  function flip() {
    const fd = new FormData();
    fd.set("clinicId", clinicId);
    fd.set("key", featureKey);
    fd.set("enabled", String(!enabled));
    startTransition(async () => {
      await toggleFeature(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={pending}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition disabled:opacity-50 ${
        enabled
          ? "bg-clinic text-white ring-clinic"
          : "bg-slate-100 text-slate-500 ring-slate-300"
      }`}
      title={enabled ? "Encendido — clic para apagar" : "Apagado — clic para encender"}
    >
      {enabled ? "● " : "○ "}
      {label}
    </button>
  );
}
