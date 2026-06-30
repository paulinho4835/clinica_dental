import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditAnamnesis } from "@/lib/rbac";
import { parseAnamnesis, ANTECEDENTES_FIELDS, HABITOS_FIELDS } from "@/lib/schemas/anamnesis";
import { getClinicLogoUrl } from "@/lib/clinicLogo";
import { PrintBrand } from "@/components/print/PrintBrand";
import { AutoPrint, PrintButtons } from "../imprimir/AutoPrint";

export default async function ImprimirAnamnesisPage({
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

  const { data: clinicRow } = await supabase
    .from("clinics")
    .select("name, address, phone")
    .eq("id", patient.clinic_id)
    .single();

  const a = parseAnamnesis((patient as { anamnesis_data?: unknown }).anamnesis_data);
  const clinic = clinicRow as { name?: string; address?: string; phone?: string } | null;
  const logoUrl = await getClinicLogoUrl(patient.clinic_id);

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
          @page { size: A4; margin: 15mm; }
        }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-8 text-sm text-slate-800">
        <PrintButtons />

        {/* Encabezado clínica */}
        <div className="mb-6 border-b-2 border-slate-800 pb-4">
          <PrintBrand logoUrl={logoUrl}>
            <p className="text-xl font-bold uppercase tracking-wide">
              {clinic?.name ?? "Clínica Dental"}
            </p>
            {clinic?.address && (
              <p className="text-xs text-slate-500">{clinic.address}</p>
            )}
            {clinic?.phone && (
              <p className="text-xs text-slate-500">Tel.: {clinic.phone}</p>
            )}
            <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-slate-500">
              Historia Clínica — Anamnesis
            </p>
          </PrintBrand>
        </div>

        {/* Datos del paciente */}
        <div className="mb-6 rounded-lg bg-slate-50 px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Datos del paciente</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <InfoRow label="Nombre completo" value={patient.full_name} />
            <InfoRow label="C.I." value={patient.national_id ?? "—"} />
            <InfoRow label="Fecha de nacimiento" value={patient.dob ?? "—"} />
            <InfoRow label="Sexo" value={patient.sex ?? "—"} />
            {patient.phone && <InfoRow label="Teléfono" value={patient.phone} />}
            {patient.email && <InfoRow label="Correo" value={patient.email} />}
            {patient.address && <InfoRow label="Dirección" value={patient.address} />}
          </div>
        </div>

        {/* Alergias y alertas */}
        {((patient.allergies?.length ?? 0) > 0 ||
          (patient.medical_alerts?.length ?? 0) > 0) && (
          <div className="mb-6 rounded border border-red-400 bg-red-50 px-4 py-3">
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
          </div>
        )}

        {/* Antecedentes patológicos */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
            Antecedentes patológicos personales
          </p>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
            {ANTECEDENTES_FIELDS.map((f) => {
              const checked = (a.antecedentes as unknown as Record<string, boolean>)[f.key];
              return (
                <div key={f.key} className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                      checked ? "border-slate-900 bg-slate-900" : "border-slate-400 bg-white"
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                      </svg>
                    )}
                  </span>
                  <span className={checked ? "font-semibold" : "text-slate-600"}>{f.label}</span>
                </div>
              );
            })}
          </div>
          {a.antecedentes.otros && (
            <p className="mt-2">
              <span className="font-medium">Otros: </span>
              {a.antecedentes.otros}
            </p>
          )}
        </div>

        {/* Hábitos */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Hábitos</p>
          <div className="flex flex-wrap gap-6">
            {HABITOS_FIELDS.map((f) => {
              const checked = (a.habitos as Record<string, boolean>)[f.key];
              return (
                <div key={f.key} className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                      checked ? "border-slate-900 bg-slate-900" : "border-slate-400 bg-white"
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                      </svg>
                    )}
                  </span>
                  <span className={checked ? "font-semibold" : "text-slate-600"}>{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Otros datos clínicos */}
        <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Medicación habitual" value={a.medicacion_habitual || "Ninguna"} />
          <InfoRow
            label="Embarazo / lactancia"
            value={
              a.embarazo === "embarazada"
                ? "Embarazada"
                : a.embarazo === "lactancia"
                  ? "En lactancia"
                  : "No aplica"
            }
          />
          <InfoRow
            label="Antecedentes familiares"
            value={a.antecedentes_familiares || "—"}
          />
          <InfoRow
            label="Última visita odontológica"
            value={a.ultima_visita_odontologica || "—"}
          />
          <InfoRow
            label="Motivo de consulta"
            value={a.motivo_consulta || "—"}
            wide
          />
        </div>

        {/* Declaración y firmas */}
        <div className="mt-10 border-t border-slate-300 pt-6">
          <p className="mb-8 text-xs leading-relaxed text-slate-500">
            Declaro que la información proporcionada es verídica y completa. Autorizo al
            profesional a utilizar estos datos con fines exclusivamente clínicos y odontológicos.
          </p>
          <div className="grid grid-cols-2 gap-16">
            <div>
              <div className="flex h-16 items-end justify-center border-b border-slate-800">
                {a.firma && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.firma}
                    alt="Firma del paciente"
                    className="max-h-16 object-contain"
                  />
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
          <p className="mt-6 text-right text-xs text-slate-400">Fecha: {today}</p>
        </div>
      </div>
    </>
  );
}

function InfoRow({
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
