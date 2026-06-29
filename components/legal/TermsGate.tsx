"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { acceptTerms } from "@/app/(dashboard)/terms-actions";

// Aviso bloqueante que ve el administrador de una clínica la primera vez que
// entra, hasta que acepta los Términos y la Política de Privacidad.
export function TermsGate({ clinicName }: { clinicName: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept() {
    setLoading(true);
    setError(null);
    const res = await acceptTerms();
    if (!res.ok) {
      setLoading(false);
      setError(res.error ?? "No se pudo registrar la aceptación.");
      return;
    }
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-lg rounded-xl bg-white p-8 shadow ring-1 ring-slate-200">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-clinic/10 text-clinic-fg">
          <ShieldCheck className="h-6 w-6" />
        </span>

        <h1 className="mt-5 text-xl font-bold text-slate-900">
          Antes de empezar
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Como administrador de{" "}
          <strong>{clinicName}</strong>, necesitamos que revises y aceptes los
          términos de uso de la plataforma. Esta aceptación aplica para toda tu
          clínica, así que tu personal no tendrá que hacerlo por separado.
        </p>

        <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
          <a
            href="/terminos"
            target="_blank"
            rel="noopener noreferrer"
            className="text-clinic hover:underline"
          >
            Leer Términos y Condiciones
          </a>
          <span className="text-slate-300">·</span>
          <a
            href="/privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="text-clinic hover:underline"
          >
            Leer Política de Privacidad
          </a>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-clinic focus:ring-clinic"
          />
          <span className="text-sm text-slate-700">
            He leído y acepto los Términos y Condiciones y la Política de
            Privacidad en nombre de mi clínica.
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <Button
          onClick={onAccept}
          disabled={!checked || loading}
          className="mt-6 w-full"
        >
          {loading ? "Guardando…" : "Aceptar y continuar"}
        </Button>
      </div>
    </main>
  );
}
