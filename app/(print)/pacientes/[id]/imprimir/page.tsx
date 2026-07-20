import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { getClinicLogoUrl } from "@/lib/clinicLogo";
import { PrintBrand } from "@/components/print/PrintBrand";
import { AutoPrint, PrintButtons } from "./AutoPrint";
import {
  parseSelectedIds,
  filterBySelection,
  sumPaymentsForSelection,
} from "@/lib/print/budgetSelection";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const now = () =>
  new Date().toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export default async function ImprimirPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ items?: string }>;
}) {
  const { id } = await params;
  const { items } = await searchParams;
  const selectedIds = parseSelectedIds(items);
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, full_name, national_id, dob, phone")
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const [{ data: clinic }, { data: rawPlans }, { data: payments }] =
    await Promise.all([
      supabase
        .from("clinics")
        .select("name, currency")
        .eq("id", patient.clinic_id)
        .single(),
      supabase
        .from("treatment_plans")
        .select(
          "id, treatment_phases(treatment_items(id, price, status, custom_name, created_at, doctor_id, doctor:profiles!treatment_items_doctor_id_fkey(full_name), procedure:procedure_catalog(name)))",
        )
        .eq("patient_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select("amount, treatment_item_id")
        .eq("patient_id", id),
    ]);

  const allWorks = (rawPlans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .map((it) => ({
      id: it.id as string,
      name:
        ((it.procedure as { name?: string } | null)?.name ??
          (it.custom_name as string)) || "—",
      price: Number(it.price),
      done: it.status === "done",
      createdAt: it.created_at as string,
      dentistName:
        ((it.doctor as { full_name?: string } | null)?.full_name) ?? null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const works = filterBySelection(allWorks, selectedIds);

  const logoUrl = await getClinicLogoUrl(patient.clinic_id);
  const currency = (clinic?.currency as string | null) ?? "Bs";

  const totalQuoted = works.reduce((s, w) => s + w.price, 0);
  const totalPaid = sumPaymentsForSelection(payments ?? [], selectedIds);
  const saldo = totalQuoted - totalPaid;

  return (
    <>
      <AutoPrint />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-8 text-slate-800">
        {/* Botones de acción — se ocultan al imprimir */}
        <PrintButtons />

        {/* Encabezado */}
        <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <PrintBrand logoUrl={logoUrl}>
            <p className="text-xl font-bold uppercase tracking-wide">
              {clinic?.name ?? "Clínica Dental"}
            </p>
            <p className="mt-1 text-sm font-semibold uppercase text-slate-500">
              Presupuesto de Tratamiento
            </p>
          </PrintBrand>
          <div className="text-right text-sm text-slate-500">
            <p>Fecha de emisión:</p>
            <p className="font-medium text-slate-700">{now()}</p>
          </div>
        </div>

        {/* Datos del paciente */}
        <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-1 rounded-lg bg-slate-50 px-5 py-4 text-sm">
          <div>
            <span className="text-slate-500">Paciente: </span>
            <span className="font-semibold">{patient.full_name}</span>
          </div>
          <div>
            <span className="text-slate-500">CI: </span>
            <span className="font-semibold">{patient.national_id ?? "—"}</span>
          </div>
          {patient.dob && (
            <div>
              <span className="text-slate-500">Fecha de nac.: </span>
              <span>{fmtDate(patient.dob)}</span>
            </div>
          )}
          {patient.phone && (
            <div>
              <span className="text-slate-500">Teléfono: </span>
              <span>{patient.phone}</span>
            </div>
          )}
        </div>

        {/* Tabla de trabajos */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase text-slate-500">
              <th className="pb-2 pr-3">#</th>
              <th className="pb-2 pr-3">Fecha</th>
              <th className="pb-2 pr-3">Trabajo</th>
              <th className="pb-2 pr-3">Doctor</th>
              <th className="pb-2 pr-3 text-center">Estado</th>
              <th className="pb-2 text-right">Precio</th>
            </tr>
          </thead>
          <tbody>
            {works.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  Sin trabajos registrados en el plan.
                </td>
              </tr>
            )}
            {works.map((w, i) => (
              <tr
                key={w.id}
                className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-slate-50" : ""}`}
              >
                <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-3 tabular-nums text-slate-500">
                  {fmtDateTime(w.createdAt)}
                </td>
                <td className="py-2 pr-3 font-medium">{w.name}</td>
                <td className="py-2 pr-3 text-slate-600">
                  {w.dentistName ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="py-2 pr-3 text-center">
                  {w.done ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Realizado
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{money(w.price, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Resumen financiero */}
        {works.length > 0 && (
          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-1 rounded-lg border border-slate-200 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total cotizado</span>
                <span className="tabular-nums font-medium">{money(totalQuoted, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total pagado</span>
                <span className="tabular-nums font-medium text-emerald-700">
                  {money(totalPaid, currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <span>Saldo pendiente</span>
                <span
                  className={`tabular-nums ${saldo > 0 ? "text-red-600" : "text-emerald-700"}`}
                >
                  {money(saldo, currency)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Firmas */}
        <div className="mt-16 grid grid-cols-2 gap-12 text-sm text-slate-500">
          <div className="border-t border-slate-400 pt-2 text-center">
            Firma del Odontólogo
          </div>
          <div className="border-t border-slate-400 pt-2 text-center">
            Firma del Paciente
          </div>
        </div>
      </div>
    </>
  );
}
