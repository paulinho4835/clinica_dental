import { enterClinic } from "@/app/(dashboard)/superadmin/actions";
import { LogIn } from "lucide-react";

// Formulario server-action: no abre nueva pestaña — transiciona en la misma sesión.
// El superadmin conserva sus cookies; solo el JWT cambia temporalmente.
export function EnterClinicButton({ clinicId }: { clinicId: string }) {
  return (
    <form action={enterClinic.bind(null, clinicId)}>
      <button
        type="submit"
        title="Ingresar a esta clínica como superadmin"
        className="flex items-center gap-1 rounded-md border border-clinic/30 bg-clinic/5 px-2 py-1 text-xs font-medium text-clinic hover:bg-clinic/10"
      >
        <LogIn className="h-3.5 w-3.5" />
        Ingresar
      </button>
    </form>
  );
}
