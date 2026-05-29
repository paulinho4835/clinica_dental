"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createConsent, type ActionState } from "@/app/(dashboard)/pacientes/consent-actions";
import { CONSENT_TEMPLATES } from "@/lib/consents/templates";

export type ConsentRow = {
  id: string;
  template_code: string;
  signed_by_name: string;
  signed_at: string;
  content_hash: string;
};

const initial: ActionState = {};

export function ConsentPanel({
  patientId,
  canWrite,
  consents,
}: {
  patientId: string;
  canWrite: boolean;
  consents: ConsentRow[];
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("general");
  const [state, formAction, pending] = useActionState(createConsent, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <div className="space-y-4">
      {canWrite &&
        (open ? (
          <form
            ref={formRef}
            action={formAction}
            className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <input type="hidden" name="patient_id" value={patientId} />
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Plantilla</span>
              <select
                name="template_code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              >
                {Object.entries(CONSENT_TEMPLATES).map(([c, t]) => (
                  <option key={c} value={c}>{t.label}</option>
                ))}
              </select>
            </label>
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {CONSENT_TEMPLATES[code]?.body}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Firma (nombre de quien consiente) *</span>
              <input
                name="signed_by_name"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending}
                className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50">
                {pending ? "Registrando…" : "Registrar consentimiento"}
              </button>
              <button type="button" onClick={() => setOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setOpen(true)}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg">
            + Registrar consentimiento
          </button>
        ))}

      <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {consents.map((c) => (
          <div key={c.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {CONSENT_TEMPLATES[c.template_code]?.label ?? c.template_code}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(c.signed_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
            <div className="text-xs text-slate-500">Firmó: {c.signed_by_name}</div>
            <div className="mt-1 truncate font-mono text-[10px] text-slate-400" title={c.content_hash}>
              hash: {c.content_hash}
            </div>
          </div>
        ))}
        {consents.length === 0 && (
          <p className="px-4 py-3 text-sm text-slate-500">Sin consentimientos registrados.</p>
        )}
      </div>
    </div>
  );
}
