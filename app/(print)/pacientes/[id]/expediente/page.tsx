import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditAnamnesis } from "@/lib/rbac";
import {
  parseAnamnesis,
  ANTECEDENTES_FIELDS,
  HABITOS_FIELDS,
} from "@/lib/schemas/anamnesis";
import type { TeethMap } from "@/lib/odontogram/types";
import { getClinicLogoUrl } from "@/lib/clinicLogo";
import { PrintBrand } from "@/components/print/PrintBrand";
import { Odontogram } from "@/components/odontogram/Odontogram";
import { money } from "@/lib/format";
import { AutoPrint, PrintButtons } from "../imprimir/AutoPrint";

const EMBARAZO_LABEL: Record<string, string> = {
  no_aplica: "No aplica",
  embarazada: "Embarazada",
  lactancia: "En lactancia",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/La_Paz",
  });
}

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select(
      "id, clinic_id, full_name, national_id, dob, sex, phone, email, address, allergies, medical_alerts, anamnesis_data",
    )
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const profile = await getProfile();
  if (!canEditAnamnesis(profile?.role)) notFound();

  const [{ data: clinicRow }, { data: odo }, { data: rawPlans }, { data: notes }] =
    await Promise.all([
      supabase
        .from("clinics")
        .select("name, address, phone, currency")
        .eq("id", patient.clinic_id)
        .single(),
      supabase
        .from("odontograms")
        .select("teeth")
        .eq("patient_id", id)
        .maybeSingle(),
      supabase
        .from("treatment_plans")
        .select(
          "treatment_phases(treatment_items(id, price, status, custom_name, created_at, doctor:profiles!treatment_items_doctor_id_fkey(full_name), procedure:procedure_catalog(name)))",
        )
        .eq("patient_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("patient_evolution_notes")
        .select(
          "id, author_name, body, note_type, subjective, objective, assessment, plan, created_at",
        )
        .eq("patient_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const clinic = clinicRow as { name?: string; address?: string; phone?: string; currency?: string } | null;
  const logoUrl = await getClinicLogoUrl(patient.clinic_id);
  const currency = clinic?.currency ?? "Bs";
  const a = parseAnamnesis((patient as { anamnesis_data?: unknown }).anamnesis_data);
  const teeth = ((odo?.teeth as TeethMap) ?? {}) as TeethMap;

  const works = (rawPlans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .filter((it) => (it.status as string) !== "cancelled")
    .map((it) => ({
      id: it.id as string,
      name:
        ((it.procedure as { name?: string } | null)?.name ??
          (it.custom_name as string)) || "—",
      price: Number(it.price),
      done: it.status === "done",
      dentistName: ((it.doctor as { full_name?: string } | null)?.full_name) ?? "—",
      createdAt: it.created_at as string,
    }))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  const totalPlan = works.reduce((s, w) => s + w.price, 0);

  const activos = ANTECEDENTES_FIELDS.filter(
    (f) => (a.antecedentes as unknown as Record<string, boolean>)[f.key],
  );
  const habitos = HABITOS_FIELDS.filter(
    (f) => (a.habitos as unknown as Record<string, boolean>)[f.key],
  );

  const today = new Date().toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/La_Paz",
  });

  return (
    <>
      <AutoPrint />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 12mm; }
          section { break-inside: avoid; }
          /* El odontograma (16 dientes/arcada) es más ancho que A4: lo encogemos
             para que entre completo. zoom refluye el layout en Chrome al imprimir. */
          .odo-fit { zoom: 0.74; }
        }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      <div className="mx-auto max-w-4xl px-8 py-8 text-sm text-slate-800">
        <PrintButtons />

        {/* Encabezado */}
        <div className="mb-6 border-b-2 border-slate-800 pb-4">
          <PrintBrand logoUrl={logoUrl}>
            <p className="text-xl font-bold uppercase tracking-wide">
              {clinic?.name ?? "Clínica Dental"}
            </p>
            {clinic?.address && <p className="text-xs text-slate-500">{clinic.address}</p>}
            {clinic?.phone && <p className="text-xs text-slate-500">Tel.: {clinic.phone}</p>}
            <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-slate-500">
              Expediente Clínico
            </p>
          </PrintBrand>
        </div>

        {/* Datos del paciente */}
        <section className="mb-6 rounded-lg bg-slate-50 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
            Datos del paciente
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <Info label="Nombre completo" value={patient.full_name} />
            <Info label="C.I." value={patient.national_id ?? "—"} />
            <Info label="Fecha de nacimiento" value={fmtDate(patient.dob)} />
            <Info label="Sexo" value={patient.sex ?? "—"} />
            <Info label="Teléfono" value={patient.phone ?? "—"} />
            <Info label="Correo" value={patient.email ?? "—"} />
            {patient.address && <Info label="Dirección" value={patient.address} />}
          </div>
        </section>

        {/* Alergias / alertas */}
        {((patient.allergies?.length ?? 0) > 0 ||
          (patient.medical_alerts?.length ?? 0) > 0) && (
          <section className="mb-6 rounded border border-red-400 bg-red-50 px-4 py-3">
            {(patient.allergies?.length ?? 0) > 0 && (
              <p className="font-semibold text-red-700">
                Alergias: {patient.allergies!.join(", ")}
              </p>
            )}
            {(patient.medical_alerts?.length ?? 0) > 0 && (
              <p className="font-semibold text-red-700">
                Alertas médicas: {patient.medical_alerts!.join(", ")}
              </p>
            )}
          </section>
        )}

        {/* Antecedentes médicos */}
        <section className="mb-6">
          <SectionTitle>Antecedentes médicos</SectionTitle>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <Info
              label="Condiciones"
              value={activos.length ? activos.map((f) => f.label).join(", ") : "Ninguna"}
            />
            <Info
              label="Hábitos"
              value={habitos.length ? habitos.map((f) => f.label).join(", ") : "Ninguno"}
            />
            <Info label="Medicación habitual" value={a.medicacion_habitual || "Ninguna"} />
            <Info label="Embarazo / lactancia" value={EMBARAZO_LABEL[a.embarazo]} />
            <Info
              label="Antecedentes familiares"
              value={a.antecedentes_familiares || "—"}
            />
            <Info
              label="Última visita odontológica"
              value={a.ultima_visita_odontologica || "—"}
            />
            <Info label="Motivo de consulta" value={a.motivo_consulta || "—"} wide />
            {a.antecedentes.otros && (
              <Info label="Otros antecedentes" value={a.antecedentes.otros} wide />
            )}
            {a.habitos.otros_detalle && (
              <Info label="Otros hábitos" value={a.habitos.otros_detalle} wide />
            )}
            {a.ultima_visita_motivo && (
              <Info label="Motivo de la última visita" value={a.ultima_visita_motivo} wide />
            )}
          </div>
        </section>

        {/* Odontograma */}
        <section className="mb-6">
          <SectionTitle>Odontograma</SectionTitle>
          <div className="odo-fit">
            <Odontogram teeth={teeth} />
          </div>
        </section>

        {/* Plan de tratamiento */}
        <section className="mb-6">
          <SectionTitle>Plan de tratamiento</SectionTitle>
          {works.length === 0 ? (
            <p className="text-sm text-slate-400">Sin tratamientos registrados.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-400">
                  <th className="py-1.5 pr-2">Tratamiento</th>
                  <th className="py-1.5 pr-2">Doctor</th>
                  <th className="py-1.5 pr-2">Estado</th>
                  <th className="py-1.5 text-right">Precio</th>
                </tr>
              </thead>
              <tbody>
                {works.map((w) => (
                  <tr key={w.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">{w.name}</td>
                    <td className="py-1.5 pr-2 text-slate-500">{w.dentistName}</td>
                    <td className="py-1.5 pr-2">
                      {w.done ? "Realizado" : "Pendiente"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{money(w.price, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-1.5" colSpan={3}>
                    Total
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{money(totalPlan, currency)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {/* Evolución clínica */}
        <section className="mb-6">
          <SectionTitle>Evolución clínica</SectionTitle>
          {(notes?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400">Sin notas de evolución.</p>
          ) : (
            <div className="space-y-3">
              {notes!.map((n) => (
                <div key={n.id} className="rounded border border-slate-200 px-3 py-2">
                  <p className="mb-1 text-xs text-slate-400">
                    {fmtDate(n.created_at)}
                    {n.author_name ? ` · ${n.author_name}` : ""}
                  </p>
                  {n.note_type === "soap" ? (
                    <div className="space-y-0.5 text-sm">
                      {n.subjective && (
                        <p>
                          <span className="font-semibold">S:</span> {n.subjective}
                        </p>
                      )}
                      {n.objective && (
                        <p>
                          <span className="font-semibold">O:</span> {n.objective}
                        </p>
                      )}
                      {n.assessment && (
                        <p>
                          <span className="font-semibold">A:</span> {n.assessment}
                        </p>
                      )}
                      {n.plan && (
                        <p>
                          <span className="font-semibold">P:</span> {n.plan}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Firma */}
        <div className="mt-10 grid grid-cols-2 gap-16 border-t border-slate-300 pt-8">
          <div>
            <div className="flex h-16 items-end justify-center border-b border-slate-800">
              {a.firma && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.firma} alt="Firma del paciente" className="max-h-16 object-contain" />
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">Firma del paciente</p>
            <p className="mt-0.5 text-xs text-slate-400">{patient.full_name}</p>
          </div>
          <div>
            <div className="h-16 border-b border-slate-800" />
            <p className="mt-1 text-xs text-slate-600">Firma del odontólogo</p>
          </div>
        </div>
        <p className="mt-6 text-right text-xs text-slate-400">Emitido: {today}</p>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h2>
  );
}

function Info({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
