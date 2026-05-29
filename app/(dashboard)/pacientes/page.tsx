import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { NewPatientForm } from "@/components/patients/NewPatientForm";

export default async function PatientsPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, phone, medical_alerts")
    .order("full_name");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pacientes</h1>
      {can(profile?.role, "patients:write") && <NewPatientForm />}
      <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {patients?.map((p) => (
          <Link
            key={p.id}
            href={`/pacientes/${p.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
          >
            <div>
              <div className="font-medium">{p.full_name}</div>
              <div className="text-xs text-slate-500">{p.phone ?? "Sin teléfono"}</div>
            </div>
            {p.medical_alerts?.length > 0 && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                ⚠ {p.medical_alerts.join(", ")}
              </span>
            )}
          </Link>
        ))}
        {!patients?.length && <p className="px-4 py-3 text-slate-500">Sin pacientes.</p>}
      </div>
    </div>
  );
}
