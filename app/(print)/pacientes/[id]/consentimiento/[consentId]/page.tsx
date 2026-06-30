import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClinicLogoUrl } from "@/lib/clinicLogo";
import { PrintBrand } from "@/components/print/PrintBrand";
import { AutoPrint, PrintButtons } from "../../imprimir/AutoPrint";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export default async function ConsentPrintPage({
  params,
}: {
  params: Promise<{ id: string; consentId: string }>;
}) {
  const { id: patientId, consentId } = await params;
  const supabase = await createClient();

  const { data: consent } = await supabase
    .from("consents")
    .select("id, title, body, status, signature_data, signed_at, created_at, clinic_id, patient_id")
    .eq("id", consentId)
    .eq("patient_id", patientId)
    .single();

  if (!consent) notFound();

  const [{ data: patient }, { data: clinic }] = await Promise.all([
    supabase
      .from("patients")
      .select("full_name, national_id, phone")
      .eq("id", patientId)
      .single(),
    supabase
      .from("clinics")
      .select("name, address, phone, nit, logo_url")
      .eq("id", consent.clinic_id)
      .single(),
  ]);

  if (!patient) notFound();

  const logoUrl = await getClinicLogoUrl(consent.clinic_id);

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

        {/* Encabezado clínica */}
        <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <PrintBrand logoUrl={logoUrl}>
            <p className="text-xl font-bold uppercase tracking-wide">
              {clinic?.name ?? "Clínica Dental"}
            </p>
            {clinic?.address && (
              <p className="text-sm text-slate-500">{clinic.address}</p>
            )}
            {clinic?.phone && (
              <p className="text-sm text-slate-500">Tel.: {clinic.phone}</p>
            )}
            {clinic?.nit && (
              <p className="text-sm text-slate-500">NIT: {clinic.nit}</p>
            )}
          </PrintBrand>
          <div className="text-right text-sm text-slate-500">
            <p className="font-semibold uppercase">Consentimiento Informado</p>
            <p className="mt-1">Emitido: {fmtDate(consent.created_at as string)}</p>
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
          {patient.phone && (
            <div>
              <span className="text-slate-500">Teléfono: </span>
              <span>{patient.phone}</span>
            </div>
          )}
        </div>

        {/* Título */}
        <h1 className="mb-6 text-center text-xl font-bold uppercase tracking-wide">
          {consent.title}
        </h1>

        {/* Cuerpo */}
        <div className="mb-8 whitespace-pre-wrap text-sm leading-relaxed">
          {consent.body}
        </div>

        {/* Firma */}
        <div className="mt-12">
          {consent.status === "firmado" && consent.signature_data ? (
            <div className="flex flex-col items-start gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={consent.signature_data as string}
                alt="Firma del paciente"
                className="h-24 border-b border-slate-400 object-contain"
              />
              <p className="text-sm text-slate-500">
                Firma digital — {fmtDate(consent.signed_at as string)}
              </p>
            </div>
          ) : (
            <div className="mt-8 border-t border-slate-400 pt-2 text-center text-sm text-slate-500">
              Firma del paciente
            </div>
          )}
        </div>

        {/* Firma del doctor */}
        <div className="mt-16 border-t border-slate-400 pt-2 text-center text-sm text-slate-500">
          Firma del odontólogo
        </div>
      </div>
    </>
  );
}
