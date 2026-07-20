import { createClient } from "@/lib/supabase/server";
import { requireNavAccess } from "@/lib/guard";
import { getProfile } from "@/lib/auth";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { BOLIVIA_TZ, money } from "@/lib/format";
import { ShieldCheck, Pencil, Trash2 } from "lucide-react";
import { getClinicCurrency } from "@/lib/superadmin";

// Auditoría: historial inmutable de acciones sensibles.
// - Pagos: cada edición o eliminación (solo admin) queda en audit_log con la
//   foto del antes/después. RLS bloquea update/delete sobre esa tabla.
// - Notas de evolución: cada edición o borrado guarda la versión anterior
//   (trigger log_evolution_note_change).
// Solo el admin de la clínica ve esta pantalla.

type HistoryRow = {
  id: string;
  action: "edited" | "deleted";
  author_id: string | null;
  author_name: string;
  body: string;
  version_created_at: string | null;
  changed_at: string;
  patient_id: string;
};

type PaymentSnapshot = {
  amount?: number;
  method?: string;
  note?: string | null;
  received_at?: string;
};

type PaymentAuditRow = {
  id: string;
  action: "payment_deleted" | "payment_updated";
  created_at: string;
  diff: {
    actor_name?: string;
    patient_name?: string;
    before?: PaymentSnapshot;
    after?: PaymentSnapshot;
  } | null;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transferencia",
};

// "15/06/2026, 14:30" en hora Bolivia.
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-BO", {
    timeZone: BOLIVIA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function AuditoriaPage() {
  await requireNavAccess("auditoria");

  const supabase = await createClient();
  const [profile, platformAdminIds] = await Promise.all([
    getProfile(),
    getPlatformAdminIds(),
  ]);
  const platformAdminIdSet = new Set(platformAdminIds);
  const currency = await getClinicCurrency();

  // RLS ya restringe por clínica; el filtro explícito es defensa en profundidad.
  // El historial es un log inmutable SIN foreign key a patients (para no perder
  // registros si se borra el paciente), así que resolvemos los nombres aparte.
  const [{ data }, { data: paymentAudit }] = await Promise.all([
    supabase
      .from("patient_evolution_note_history")
      .select(
        "id, action, author_id, author_name, body, version_created_at, changed_at, patient_id",
      )
      .eq("clinic_id", profile!.clinicId)
      .order("changed_at", { ascending: false })
      .limit(200),
    // Ediciones/eliminaciones de pagos: los nombres van dentro del diff, así
    // que no dependen de que el paciente o el perfil sigan existiendo.
    supabase
      .from("audit_log")
      .select("id, action, created_at, diff")
      .eq("clinic_id", profile!.clinicId)
      .eq("entity", "payment")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const paymentRows = (paymentAudit ?? []) as PaymentAuditRow[];

  const rows = (data ?? []).map((r) => ({
    ...(r as HistoryRow),
    author_name: platformAdminIdSet.has((r as { author_id?: string | null }).author_id ?? "")
      ? "Sistema"
      : (r as { author_name: string }).author_name,
  })) as HistoryRow[];

  // Mapa patient_id → nombre, con una sola consulta para los pacientes citados.
  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const nameById = new Map<string, string>();
  if (patientIds.length > 0) {
    const { data: patients } = await supabase
      .from("patients")
      .select("id, full_name")
      .in("id", patientIds);
    for (const p of patients ?? []) nameById.set(p.id, p.full_name);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        subtitle="Historial inmutable de acciones sensibles: correcciones de pagos y cambios en notas de evolución."
      />

      {rows.length === 0 && paymentRows.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Sin cambios registrados"
          description="Cuando se corrija un pago o se edite/borre una nota de evolución, quedará registrado aquí."
        />
      )}

      {paymentRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pagos corregidos
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha del cambio</th>
                    <th className="px-4 py-3 font-medium">Acción</th>
                    <th className="px-4 py-3 font-medium">Paciente</th>
                    <th className="px-4 py-3 font-medium">Autor</th>
                    <th className="px-4 py-3 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentRows.map((r) => {
                    const before = r.diff?.before;
                    const after = r.diff?.after;
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {fmtDateTime(r.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {r.action === "payment_deleted" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-500/10">
                              <Trash2 className="h-3.5 w-3.5" /> Eliminado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-500/10">
                              <Pencil className="h-3.5 w-3.5" /> Editado
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {r.diff?.patient_name ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {r.diff?.actor_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {r.action === "payment_deleted" ? (
                            <span>
                              {money(before?.amount ?? 0, currency)}
                              {before?.method && (
                                <span className="text-slate-400"> · {METHOD_LABEL[before.method] ?? before.method}</span>
                              )}
                              {before?.note && (
                                <span className="text-slate-400"> · {before.note}</span>
                              )}
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              {before?.amount !== after?.amount && (
                                <p>
                                  Monto: <span className="text-slate-400 line-through">{money(before?.amount ?? 0, currency)}</span>{" "}
                                  → <span className="font-medium text-slate-800">{money(after?.amount ?? 0, currency)}</span>
                                </p>
                              )}
                              {before?.method !== after?.method && (
                                <p>
                                  Método: <span className="text-slate-400">{METHOD_LABEL[before?.method ?? ""] ?? before?.method}</span>{" "}
                                  → {METHOD_LABEL[after?.method ?? ""] ?? after?.method}
                                </p>
                              )}
                              {(before?.note ?? null) !== (after?.note ?? null) && (
                                <p>
                                  Concepto: <span className="text-slate-400">{before?.note ?? "—"}</span> → {after?.note ?? "—"}
                                </p>
                              )}
                              {before?.received_at !== after?.received_at && (
                                <p>
                                  Fecha: <span className="text-slate-400">{before?.received_at ? fmtDateTime(before.received_at) : "—"}</span>{" "}
                                  → {after?.received_at ? fmtDateTime(after.received_at) : "—"}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Notas de evolución
          </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha del cambio</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Autor</th>
                <th className="px-4 py-3 font-medium">Contenido anterior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {fmtDateTime(r.changed_at)}
                  </td>
                  <td className="px-4 py-3">
                    {r.action === "deleted" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" /> Borrada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-500/10">
                        <Pencil className="h-3.5 w-3.5" /> Editada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {nameById.get(r.patient_id) ?? "Paciente eliminado"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {r.author_name}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    <p className="whitespace-pre-wrap">{r.body}</p>
                    {r.version_created_at && (
                      <p className="mt-1 text-xs text-slate-400">
                        Versión del {fmtDateTime(r.version_created_at)}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </section>
      )}
    </div>
  );
}
