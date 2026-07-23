"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const RETURN_KEY = "sa_impersonation_return";
const LABEL_KEY = "sa_impersonation_label";

// Se auto-detecta 100% en el navegador: al impersonar una cuenta real, el
// auth.uid() del servidor pasa a ser el de esa persona, así que ningún query
// del servidor puede ya saber "hay un superadmin disfrazado" — solo esta
// pestaña, que guardó los tokens originales en sessionStorage, lo sabe.
export function ImpersonationBanner() {
  const [label, setLabel] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLabel(sessionStorage.getItem(LABEL_KEY));
  }, []);

  if (!label) return null;

  async function exit() {
    setPending(true);
    const raw = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    sessionStorage.removeItem(LABEL_KEY);
    if (raw) {
      await createClient().auth.setSession(JSON.parse(raw));
    }
    window.location.href = "/superadmin";
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-purple-600 px-4 py-2 text-sm font-medium text-white">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          Viendo como <span className="font-bold">{label}</span>
          <span className="ml-2 font-normal opacity-80">
            (no se registra en ningún lado)
          </span>
        </span>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={exit}
        className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 text-xs hover:bg-white/30 disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        {pending ? "Volviendo…" : "Salir"}
      </button>
    </div>
  );
}
