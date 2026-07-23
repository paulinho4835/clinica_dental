"use client";

import { useTransition } from "react";
import { LogIn } from "lucide-react";
import { impersonateUser } from "@/app/(dashboard)/superadmin/actions";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { ROLE_LABEL, type Role } from "@/lib/rbac";

// Entra como un usuario real de una clínica (no un rol genérico) vía magic
// link server-side — su contraseña real nunca se toca. Guardamos la sesión
// actual de superadmin en sessionStorage (vive solo en esta pestaña) para que
// ImpersonationBanner pueda restaurarla al salir.
export function ImpersonateUserButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Entrar como este usuario"
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await impersonateUser(userId);
            sessionStorage.setItem(
              "sa_impersonation_return",
              JSON.stringify(result.original),
            );
            sessionStorage.setItem(
              "sa_impersonation_label",
              `${result.targetName} (${ROLE_LABEL[result.targetRole as Role] ?? result.targetRole})`,
            );
            await createClient().auth.setSession(result.impersonated);
            window.location.href = "/agenda";
          } catch (err) {
            toast(
              err instanceof Error ? err.message : "No se pudo entrar como este usuario",
              "error",
            );
          }
        })
      }
      className="rounded p-1 text-slate-400 hover:bg-clinic/10 hover:text-clinic disabled:opacity-50"
    >
      <LogIn className="h-3.5 w-3.5" />
    </button>
  );
}
