"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/lib/confirm";
import { deletePatient } from "@/app/(dashboard)/pacientes/actions";
import { Button } from "@/components/ui/Button";

export function DeletePatientButton({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const ok = await confirm({
      title: "Eliminar paciente",
      message: `¿Estás seguro de que deseas eliminar a "${patientName}"? Esta acción es permanente y no se puede deshacer.`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      tone: "danger",
    });
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      const result = await deletePatient(patientId);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/pacientes");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && (
        <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
      )}
      <Button variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
        {isPending ? "Eliminando…" : "Eliminar paciente"}
      </Button>
    </div>
  );
}
