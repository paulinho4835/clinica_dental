import { exitClinic } from "@/app/(dashboard)/superadmin/actions";
import { Eye, X } from "lucide-react";

export function ExitPreviewBanner({ clinicName }: { clinicName: string }) {
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
      <form action={exitClinic}>
        <button
          type="submit"
          className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 text-xs hover:bg-white/30"
        >
          <X className="h-3 w-3" />
          Volver al panel
        </button>
      </form>
    </div>
  );
}
