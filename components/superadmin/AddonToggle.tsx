"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleFeature } from "@/app/(dashboard)/superadmin/actions";
import { FOTOS_DEFAULT_QUOTA, type FeatureKey } from "@/lib/features";
import { confirm } from "@/lib/confirm";
import { Modal } from "@/components/ui/Modal";

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
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoInput, setPhotoInput] = useState(String(FOTOS_DEFAULT_QUOTA));
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Aplica el cambio (activar/desactivar) enviando el toggle al servidor.
  // fotosMax solo se manda al activar fotos con un cupo elegido.
  function apply(next: boolean, fotosMax: number | null) {
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

  async function flip() {
    const next = !optimisticEnabled;

    // Desactivar: instantáneo, sin fricción.
    if (!next) {
      apply(false, null);
      return;
    }

    // Activar fotos: modal con input de cupo (reemplaza window.prompt).
    if (featureKey === "fotos") {
      setPhotoInput(String(FOTOS_DEFAULT_QUOTA));
      setPhotoError(null);
      setPhotoModalOpen(true);
      return;
    }

    // Resto de add-ons: confirmación explícita al activar.
    const ok = await confirm({
      title: "Activar add-on",
      message: `¿Activar "${label}" para esta clínica?`,
      confirmText: "Activar",
      cancelText: "Cancelar",
      tone: "default",
    });
    if (ok) apply(true, null);
  }

  function confirmPhotos() {
    const n = Number(photoInput);
    if (!Number.isInteger(n) || n <= 0) {
      setPhotoError("Ingresa un número entero mayor a 0.");
      return;
    }
    setPhotoModalOpen(false);
    apply(true, n);
  }

  const icon = ICONS[featureKey];

  return (
    <>
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

      <Modal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        title="Cupo de fotos"
        subtitle="¿Cuántas fotos incluye este plan para la clínica?"
        size="sm"
      >
        <div className="space-y-3">
          <input
            type="number"
            min="1"
            value={photoInput}
            autoFocus
            onChange={(e) => {
              setPhotoInput(e.target.value);
              setPhotoError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmPhotos();
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
          {photoError && <p className="text-sm text-red-600">{photoError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhotoModalOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmPhotos}
              className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
            >
              Activar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
