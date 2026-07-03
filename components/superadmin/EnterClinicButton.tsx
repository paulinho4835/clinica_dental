"use client";

import { useTransition } from "react";
import { LogIn } from "lucide-react";
import { enterClinic } from "@/app/(dashboard)/superadmin/actions";
import { createClient } from "@/lib/supabase/client";

// Entra a una clínica como superadmin. El server action crea el perfil temporal
// y devuelve el JWT nuevo (con clinic_id). Fijamos la sesión en el NAVEGADOR con
// setSession() —igual que el login— porque las cookies escritas por refreshSession()
// dentro de un server action no llegan de forma fiable al navegador. Luego recargamos.
export function EnterClinicButton({ clinicId }: { clinicId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Ingresar a esta clínica como superadmin"
      onClick={() =>
        startTransition(async () => {
          const { access_token, refresh_token } = await enterClinic(clinicId);
          await createClient().auth.setSession({ access_token, refresh_token });
          window.location.href = "/agenda";
        })
      }
      className="flex items-center gap-1 rounded-md border border-clinic/30 bg-clinic/5 px-2 py-1 text-xs font-medium text-clinic hover:bg-clinic/10 disabled:opacity-50"
    >
      <LogIn className="h-3.5 w-3.5" />
      {pending ? "Ingresando…" : "Ingresar"}
    </button>
  );
}
