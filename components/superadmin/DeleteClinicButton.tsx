"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { deleteClinic } from "@/app/(dashboard)/superadmin/actions";

export function DeleteClinicButton({
  clinicId,
  clinicName,
}: {
  clinicId: string;
  clinicName: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleDelete() {
    const ok = await confirm({
      title: "Eliminar clínica",
      message: `¿Eliminar "${clinicName}" y todos sus datos? Esta acción elimina permanentemente todos los pacientes, citas y registros. NO se puede deshacer.`,
      confirmText: "Eliminar clínica",
      tone: "danger",
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("clinicId", clinicId);
    startTransition(async () => {
      await deleteClinic(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      title="Eliminar clínica"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
