"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { setClinicActive } from "@/app/(dashboard)/superadmin/actions";

export function SuspendClinicButton({
  clinicId,
  clinicName,
  active,
}: {
  clinicId: string;
  clinicName: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick() {
    if (active) {
      const ok = await confirm({
        title: "Dar de baja clínica",
        message: `¿Suspender "${clinicName}"? Sus usuarios no podrán acceder hasta reactivarla. Los datos se conservan.`,
        confirmText: "Dar de baja",
        tone: "danger",
      });
      if (!ok) return;
    }
    const fd = new FormData();
    fd.set("clinicId", clinicId);
    fd.set("active", String(!active));
    startTransition(async () => {
      await setClinicActive(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        active
          ? "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
          : "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
      }
      title={active ? "Dar de baja" : "Reactivar"}
    >
      {active ? (
        <Ban className="h-3.5 w-3.5" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      {pending ? "…" : active ? "Dar de baja" : "Reactivar"}
    </button>
  );
}
