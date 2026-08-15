"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCuentaTabData } from "@/app/(dashboard)/pacientes/[id]/tab-data-actions";
import { DoctorAccountPanel } from "@/components/patients/DoctorAccountPanel";
import { TabSkeleton } from "@/components/patients/lazy-tabs/TabSkeleton";
import { money } from "@/lib/format";

type Data = Awaited<ReturnType<typeof getCuentaTabData>>;

export function CuentaTab({ patientId, canSeeCuentas }: { patientId: string; canSeeCuentas: boolean }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCuentaTabData(patientId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (!data) return <TabSkeleton />;

  if (data.view === "billing") {
    const pending = data.totalQuoted - data.totalPaid;
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold">Cuenta del paciente</h2>
        <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex gap-8 text-sm">
            <div>
              <div className="text-xs text-slate-500">Total tratamiento</div>
              <div className="mt-0.5 font-semibold tabular-nums">{money(data.totalQuoted, data.currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total pagado</div>
              <div className="mt-0.5 font-semibold tabular-nums text-emerald-600">
                {money(data.totalPaid, data.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{data.isProvisional ? "Saldo provisional" : "Saldo pendiente"}</div>
              <div className={`mt-0.5 font-semibold tabular-nums ${pending > 0 ? "text-red-600" : "text-slate-800"}`}>
                {money(pending, data.currency)}
              </div>
            </div>
          </div>
          {canSeeCuentas && (
            <Link
              href={`/cuentas?p=${patientId}`}
              className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg transition-colors"
            >
              Gestionar cuenta →
            </Link>
          )}
        </div>
        {data.isProvisional && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Hay <strong>{data.historicalCount}</strong> trabajo(s) historico(s) sin plan por un importe de referencia de <strong>{money(data.historicalReferenceTotal, data.currency)}</strong>. Ese importe no se suma al saldo hasta que un administrador revise cada registro.
            {data.canRegularize && <Link href="/auditoria" className="ml-2 font-semibold underline">Regularizar ahora</Link>}
          </div>
        )}
      </section>
    );
  }

  if (data.view === "doctor") {
    return <DoctorAccountPanel rows={data.doctorAccountRows} currency={data.currency} />;
  }

  return null;
}
