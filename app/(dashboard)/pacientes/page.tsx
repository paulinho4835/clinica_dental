import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { NewPatientForm } from "@/components/patients/NewPatientForm";
import { PatientSearch } from "@/components/patients/PatientSearch";
import { requireFeature } from "@/lib/guard";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireFeature("pacientes");
  const supabase = await createClient();
  const profile = await getProfile();

  const q = (await searchParams).q?.trim() ?? "";

  let query = supabase
    .from("patients")
    .select("id, full_name, national_id, phone, medical_alerts")
    .order("full_name");

  // Filtro por nombre o CI. Usa search_text (normalizado sin acentos ni
  // mayúsculas) para que "maria" encuentre "María".
  if (q) {
    const term = q
      .normalize("NFD")
      .replace(new RegExp("[\u0300-\u036f]", "g"), "")
      .toLowerCase();
    query = query.ilike("search_text", `%${term}%`);
  }

  const { data: patients } = await query;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pacientes</h1>
      {can(profile?.role, "patients:write") && <NewPatientForm />}

      <PatientSearch initial={q} />

      <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {patients?.map((p) => (
          <Link
            key={p.id}
            href={`/pacientes/${p.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
          >
            <div>
              <div className="font-medium">{p.full_name}</div>
              <div className="text-xs text-slate-500">
                {p.national_id ? `CI: ${p.national_id}` : "Sin CI"}
                {" · "}
                {p.phone ?? "Sin teléfono"}
              </div>
            </div>
            {p.medical_alerts?.length > 0 && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                ⚠ {p.medical_alerts.join(", ")}
              </span>
            )}
          </Link>
        ))}
        {!patients?.length && (
          <p className="px-4 py-3 text-slate-500">
            {q ? `Sin resultados para "${q}".` : "Sin pacientes."}
          </p>
        )}
      </div>
    </div>
  );
}
