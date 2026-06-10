import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoPrint, PrintButtons } from "../../imprimir/AutoPrint";
import type { Medication } from "@/app/(dashboard)/pacientes/prescription-actions";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export default async function RecetaPage({
  params,
}: {
  params: Promise<{ id: string; recetaId: string }>;
}) {
  const { id, recetaId } = await params;
  const supabase = await createClient();

  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, medications, notes, issued_at, doctor:profiles(full_name)")
    .eq("id", recetaId)
    .eq("patient_id", id)
    .single();
  if (!rx) notFound();

  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, national_id, clinic_id")
    .eq("id", id)
    .single();
  if (!patient) notFound();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", patient.clinic_id)
    .single();

  const medications = rx.medications as Medication[];
  const doctorName =
    (rx.doctor as { full_name?: string } | null)?.full_name ?? null;

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
        <PrintButtons />

        {/* Encabezado */}
        <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <p className="text-xl font-bold uppercase tracking-wide">
              {clinic?.name ?? "Clínica Dental"}
            </p>
            <p className="mt-1 text-sm font-semibold uppercase text-slate-500">
              Receta Médica
            </p>
            {doctorName && (
              <p className="mt-0.5 text-sm text-slate-600">
                Dr./Dra. {doctorName}
              </p>
            )}
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Fecha de emisión:</p>
            <p className="font-medium text-slate-700">{fmtDate(rx.issued_at as string)}</p>
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
        </div>

        {/* Tabla de medicamentos */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase text-slate-500">
              <th className="pb-2 pr-3">#</th>
              <th className="pb-2 pr-3">Medicamento</th>
              <th className="pb-2 pr-3">Dosis</th>
              <th className="pb-2">Indicaciones</th>
            </tr>
          </thead>
          <tbody>
            {medications.map((m, i) => (
              <tr
                key={i}
                className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-slate-50" : ""}`}
              >
                <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-3 font-medium">{m.name}</td>
                <td className="py-2 pr-3 text-slate-600">{m.dosage}</td>
                <td className="py-2 text-slate-600">{m.instructions || "—"}</td>
              </tr>
            ))}
            {medications.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  Sin medicamentos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Notas generales */}
        {rx.notes && (
          <div className="mt-4 rounded-lg border border-slate-200 px-4 py-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
              Notas / Indicaciones generales
            </p>
            <p className="text-slate-700">{rx.notes}</p>
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
