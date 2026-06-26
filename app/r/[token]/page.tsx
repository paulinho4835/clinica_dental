import { createAdminClient } from "@/lib/supabase/admin";
import { PublicFeedbackForm } from "./PublicFeedbackForm";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
      </div>
    </Shell>
  );
}

export default async function PublicFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("work_feedback")
    .select(
      "id, clinic_id, doctor_id, patient_id, expires_at, submitted_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <Notice
        title="Enlace no válido"
        message="Este enlace no existe o fue revocado. Solicite uno nuevo a la clínica."
      />
    );
  }

  if (invite.submitted_at) {
    return (
      <Notice
        title="Calificación ya enviada"
        message="Ya recibimos su opinión. ¡Muchas gracias!"
      />
    );
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return (
      <Notice
        title="Enlace expirado"
        message="Este enlace ya no está disponible. Solicite uno nuevo a la clínica."
      />
    );
  }

  const [{ data: clinic }, doctorRes, patientRes] = await Promise.all([
    admin.from("clinics").select("name").eq("id", invite.clinic_id).maybeSingle(),
    invite.doctor_id
      ? admin.from("profiles").select("full_name").eq("id", invite.doctor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    invite.patient_id
      ? admin.from("patients").select("full_name").eq("id", invite.patient_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const doctorName =
    (doctorRes.data as { full_name?: string } | null)?.full_name ?? "";
  const patientName =
    (patientRes.data as { full_name?: string } | null)?.full_name ?? "";

  return (
    <Shell>
      <PublicFeedbackForm
        token={token}
        clinicName={clinic?.name ?? "la clínica"}
        doctorName={doctorName}
        patientName={patientName}
      />
    </Shell>
  );
}
