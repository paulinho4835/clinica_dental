"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteStaffPayment } from "@/app/(dashboard)/pagos/actions";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";

export function DeletePaymentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  async function handle() {
    const ok = await confirm({
      title: "Eliminar pago",
      message: "¿Eliminar este registro de pago? No se puede deshacer.",
      confirmText: "Sí, eliminar",
      cancelText: "Volver",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteStaffPayment(id);
      if (res.error) toast(res.error, "error");
      else {
        router.refresh();
        toast("Pago eliminado", "success");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-label="Eliminar pago"
      className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
