import { money } from "@/lib/format";
import { TreatmentProgressBar } from "@/components/treatments/TreatmentProgressBar";

// Estado de cuenta ACOTADO al doctor que mira la ficha.
//
// Antes los doctores no veían nada en la pestaña "Cuenta" (solo admin y
// recepción tienen billing:write) y tenían que preguntarle a recepción si el
// paciente iba al día. Ahora ven el avance de pago, pero SOLO de los
// tratamientos que les corresponden — nunca el total del paciente ni lo que
// cobran los demás doctores. Así el doctor puede decirle al paciente "te falta
// una cuota" sin exponerle la cuenta completa de la clínica.
export type DoctorAccountRow = {
  id: string;
  name: string;
  price: number;
  paid: number;
  /** Nº de pagos registrados contra este tratamiento. null = no rastreable
   *  (trabajo suelto sin ítem de plan: el cobro va en el propio registro). */
  paymentsCount: number | null;
  lastPaymentAt: string | null;
  done: boolean;
  /** Trabajo registrado desde "Mis trabajos", sin ítem del plan vinculado. */
  adHoc: boolean;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(row: DoctorAccountRow, currency: string) {
  const remaining = Math.round((row.price - row.paid) * 100) / 100;
  if (remaining <= 0.005) {
    return { text: "Pagado por completo", cls: "text-emerald-600" };
  }
  if (row.paid <= 0.005) {
    return { text: "Sin pagos aún", cls: "text-slate-500" };
  }
  return { text: `Falta ${money(remaining, currency)}`, cls: "text-amber-600" };
}

export function DoctorAccountPanel({
  rows,
  currency,
}: {
  rows: DoctorAccountRow[];
  currency: string;
}) {
  const total = rows.reduce((s, r) => s + r.price, 0);
  const paid = rows.reduce((s, r) => s + r.paid, 0);
  const pending = Math.round((total - paid) * 100) / 100;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Cuenta de mis tratamientos</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Solo se muestran los tratamientos asignados a ti o en los que
          registraste una sesión. No incluye el resto de la cuenta del paciente.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          No tienes tratamientos asignados a este paciente.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 rounded-lg bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200 sm:grid-cols-3">
            <div>
              <div className="text-xs text-slate-500">Total de mis tratamientos</div>
              <div className="mt-0.5 font-semibold tabular-nums">
                {money(total, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Pagado</div>
              <div className="mt-0.5 font-semibold tabular-nums text-emerald-600">
                {money(paid, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Saldo pendiente</div>
              <div
                className={`mt-0.5 font-semibold tabular-nums ${
                  pending > 0 ? "text-red-600" : "text-slate-800"
                }`}
              >
                {money(pending, currency)}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            {rows.map((r) => {
              const status = statusLabel(r, currency);
              return (
                <div
                  key={r.id}
                  className="border-b border-slate-100 px-4 py-3 last:border-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-medium text-slate-700">
                      {r.name}
                      {r.adHoc && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
                          sin plan
                        </span>
                      )}
                    </span>
                    <span className={`text-xs font-medium ${status.cls}`}>
                      {status.text}
                    </span>
                  </div>

                  <div className="mt-2">
                    <TreatmentProgressBar
                      paid={r.paid}
                      total={r.price}
                      currency={currency}
                    />
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-slate-400">
                    {r.paymentsCount !== null && (
                      <span>
                        {r.paymentsCount} pago{r.paymentsCount === 1 ? "" : "s"}{" "}
                        registrado{r.paymentsCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {r.lastPaymentAt && (
                      <span>Último: {fmtDate(r.lastPaymentAt)}</span>
                    )}
                    {r.done && <span className="text-emerald-600">Trabajo terminado</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
