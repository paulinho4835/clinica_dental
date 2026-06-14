"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { toggleDisbursed } from "@/app/(dashboard)/pagos/actions";
import { toast } from "@/lib/toast";

export function DisbursedToggle({
  id,
  disbursed: initial,
}: {
  id: string;
  disbursed: boolean;
}) {
  const [disbursed, setDisbursed] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  function handle() {
    const next = !disbursed;
    setDisbursed(next);
    start(async () => {
      const res = await toggleDisbursed(id, next);
      if (res.error) {
        setDisbursed(!next);
        toast(res.error, "error");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      title={
        disbursed
          ? "Desembolsado — clic para marcar como pendiente"
          : "Pendiente — clic para confirmar desembolso"
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
        disbursed
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-amber-100 text-amber-700 hover:bg-amber-200"
      }`}
    >
      {disbursed ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Desembolsado
        </>
      ) : (
        <>
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Pendiente
        </>
      )}
    </button>
  );
}
