"use client";

import { useTransition } from "react";
import { Eye, X } from "lucide-react";
import { exitClinic } from "@/app/(dashboard)/superadmin/actions";
import { createClient } from "@/lib/supabase/client";

export function ExitPreviewBanner({ clinicName }: { clinicName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          Modo vista —{" "}
          <span className="font-bold">{clinicName}</span>
          <span className="ml-2 font-normal opacity-80">
            (tu sesión de superadmin no se ve afectada)
          </span>
        </span>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { access_token, refresh_token } = await exitClinic();
            // Fijar en el navegador el JWT ya sin clinic_id (mismo patrón que login).
            await createClient().auth.setSession({ access_token, refresh_token });
            window.location.href = "/superadmin";
          })
        }
        className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 text-xs hover:bg-white/30 disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        {pending ? "Volviendo…" : "Volver al panel"}
      </button>
    </div>
  );
}
