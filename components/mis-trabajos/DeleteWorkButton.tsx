"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteDoctorWork } from "@/app/(dashboard)/mis-trabajos/actions";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";

export function DeleteWorkButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  async function handle() {
    const ok = await confirm({
      title: "Eliminar trabajo",
      message: "¿Eliminar este registro? No se puede deshacer.",
      confirmText: "Sí, eliminar",
      cancelText: "Volver",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteDoctorWork(id);
      if (res.error) toast(res.error, "error");
      else {
        router.refresh();
        toast("Trabajo eliminado", "success");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-label="Eliminar trabajo"
      className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
