import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can, isReceptionistLike } from "@/lib/rbac";
import { getClinicLogoUrl } from "@/lib/clinicLogo";
import { PrintBrand } from "@/components/print/PrintBrand";
import { AutoPrint, PrintButtons } from "./PrintControls";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Pendiente",
  confirmed: "Confirmada",
  waiting: "En sala",
  in_chair: "En sillón",
  finished: "Atendido",
  no_show: "No vino",
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
  });

type Row = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  dentist_name: string | null;
  patient_name: string | null;
  reason: string | null;
  patients: { full_name?: string; national_id?: string | null } | null;
};

export default async function AgendaPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ doctor?: string }>;
}) {
  const { date } = await params;
  const { doctor } = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const profile = await getProfile();
  if (!profile || !can(profile.role, "appointments:write")) notFound();

  // Admin y recepción ven (y filtran) todos los doctores; el resto, solo lo suyo.
  const canViewAll = profile.role === "admin" || isReceptionistLike(profile.role);

  const supabase = await createClient();

  // Límites del día en hora Bolivia (UTC-4) expresados como instante UTC.
  const dayStart = new Date(`${date}T00:00:00-04:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  let query = supabase
    .from("appointments")
    .select(
      "id, starts_at, ends_at, status, dentist_name, patient_name, reason, patients(full_name, national_id)",
    )
    .eq("clinic_id", profile.clinicId)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  // Doctores ven solo sus citas; admin/recepción pueden filtrar por ?doctor.
  if (!canViewAll) {
    query = query.eq("dentist_name", profile.fullName);
  } else if (doctor) {
    query = query.eq("dentist_name", doctor);
  }

  const { data: clinicRow } = await supabase
    .from("clinics")
    .select("name, address, phone")
    .eq("id", profile.clinicId)
    .single();

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const clinic = clinicRow as { name?: string; address?: string; phone?: string } | null;
  const logoUrl = await getClinicLogoUrl(profile.clinicId);

  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const patientLabel = (r: Row) => r.patients?.full_name ?? r.patient_name ?? "—";

  return (
    <>
      <AutoPrint />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 12mm; }
          tr { break-inside: avoid; }
        }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      <div className="mx-auto max-w-4xl px-8 py-8 text-sm text-slate-800">
        <PrintButtons />

        {/* Encabezado */}
        <div className="mb-5 border-b-2 border-slate-800 pb-4">
          <PrintBrand logoUrl={logoUrl}>
            <p className="text-xl font-bold uppercase tracking-wide">
              {clinic?.name ?? "Clínica Dental"}
            </p>
            {clinic?.address && <p className="text-xs text-slate-500">{clinic.address}</p>}
            {clinic?.phone && <p className="text-xs text-slate-500">Tel.: {clinic.phone}</p>}
            <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-slate-500">
              Agenda del día
            </p>
          </PrintBrand>
          <p className="mt-1 text-base font-medium capitalize text-slate-700">
            {dayLabel}
            {doctor ? ` · ${doctor}` : ""}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-slate-400">Sin citas para este día.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-xs uppercase text-slate-400">
                <th className="py-2 pr-2">Hora</th>
                <th className="py-2 pr-2">Paciente</th>
                <th className="py-2 pr-2">C.I.</th>
                <th className="py-2 pr-2">Odontólogo</th>
                <th className="py-2 pr-2">Motivo</th>
                <th className="py-2 pr-2">Estado</th>
                {/* Columna en blanco para anotaciones a mano */}
                <th className="w-24 py-2">Notas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-2 tabular-nums font-medium">
                    {hhmm(r.starts_at)}
                    {r.ends_at ? `–${hhmm(r.ends_at)}` : ""}
                  </td>
                  <td className="py-2 pr-2">{patientLabel(r)}</td>
                  <td className="py-2 pr-2 text-slate-500 tabular-nums">
                    {r.patients?.national_id ?? "—"}
                  </td>
                  <td className="py-2 pr-2 text-slate-500">{r.dentist_name ?? "—"}</td>
                  <td className="py-2 pr-2 text-slate-500">{r.reason ?? "—"}</td>
                  <td className="py-2 pr-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="py-2"></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-6 text-right text-xs text-slate-400">
          {rows.length} cita{rows.length !== 1 ? "s" : ""} · Emitido:{" "}
          {new Date().toLocaleDateString("es-BO", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "America/La_Paz",
          })}
        </p>
      </div>
    </>
  );
}
