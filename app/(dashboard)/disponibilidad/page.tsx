import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireNavAccess } from "@/lib/guard";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import type { AvailabilityBlock } from "@/lib/availability";
import { AvailabilityPanel } from "@/components/disponibilidad/AvailabilityPanel";

export const dynamic = "force-dynamic";

export default async function DisponibilidadPage() {
  await requireNavAccess("disponibilidad");
  const supabase = await createClient();
  const profile = await getProfile();
  const platformAdminIds = await getPlatformAdminIds();

  // Mismo criterio de "doctores" que la agenda: roles que atienden pacientes,
  // activos, sin superadmins.
  let doctorsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "colega", "admin"])
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    doctorsQuery = doctorsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  const [{ data: doctors }, { data: rows }] = await Promise.all([
    doctorsQuery,
    supabase
      .from("doctor_availability")
      .select(
        "id, dentist_id, weekday, date_from, date_to, start_time, end_time, reason, profiles!doctor_availability_dentist_id_fkey(full_name)",
      )
      .eq("clinic_id", profile!.clinicId)
      .order("weekday", { ascending: true, nullsFirst: false })
      .order("date_from", { ascending: true }),
  ]);

  const blocks: AvailabilityBlock[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    dentist_id: r.dentist_id as string,
    dentist_name:
      ((r.profiles as { full_name?: string } | null)?.full_name ?? "").trim(),
    weekday: (r.weekday as number | null) ?? null,
    date_from: (r.date_from as string | null) ?? null,
    date_to: (r.date_to as string | null) ?? null,
    start_time: r.start_time as string,
    end_time: r.end_time as string,
    reason: (r.reason as string | null) ?? null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Disponibilidad de doctores</h1>
      <p className="max-w-2xl text-sm text-slate-500">
        Registra los horarios en los que un doctor NO atiende (un día de la
        semana de forma recurrente, o fechas concretas como vacaciones). Esos
        bloques se muestran en gris en la agenda y avisan al agendar encima.
      </p>
      <AvailabilityPanel doctors={doctors ?? []} blocks={blocks} />
    </div>
  );
}
