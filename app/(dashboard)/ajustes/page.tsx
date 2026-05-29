import { createClient } from "@/lib/supabase/server";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  recepcionista: "Recepcionista",
  odontologo_general: "Odontólogo general",
  especialista: "Especialista",
  asistente: "Asistente",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("full_name, role")
    .order("full_name");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ajustes — Usuarios y roles</h1>
      <p className="text-sm text-slate-500">
        Solo el rol <strong>admin</strong> puede crear o modificar usuarios (RLS lo aplica en la DB).
      </p>
      <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {members?.map((m, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{m.full_name}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {ROLE_LABEL[m.role] ?? m.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
