import { createAdminClient } from "@/lib/supabase/admin";
import { EMPTY_ANAMNESIS } from "@/lib/schemas/anamnesis";
import { getActiveIntakeQuestions } from "@/lib/intakeQuestions";
import { normalizeFeatures } from "@/lib/features";
import { getClinicLogoUrl } from "@/lib/clinicLogo";
import { PublicAnamnesisForm } from "./PublicAnamnesisForm";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  // theme-light: el paciente abre este enlace desde su celular; forzamos tema
  // claro para que no se vea en oscuro (controles nativos con bajo contraste).
  return <div className="theme-light min-h-screen bg-slate-50">{children}</div>;
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

export default async function PublicAnamnesisPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("anamnesis_invitations")
    .select("id, kind, patient_id, clinic_id, expires_at, completed_at, contact_name")
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

  if (invite.completed_at) {
    return (
      <Notice
        title="Formulario ya completado"
        message="Este historial ya fue enviado. Gracias."
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

  const isNew = invite.kind === "new";

  const { data: clinic } = await admin
    .from("clinics")
    .select("name, settings, features")
    .eq("id", invite.clinic_id)
    .maybeSingle();

  const logoUrl = await getClinicLogoUrl(invite.clinic_id, admin);

  // Privacidad: la página pública NO carga datos médicos previos. Para paciente
  // existente solo se trae el nombre para el saludo; para alta, no hay paciente.
  let patientName = (invite.contact_name as string | null) ?? "";
  if (!isNew) {
    const { data: patient } = await admin
      .from("patients")
      .select("full_name")
      .eq("id", invite.patient_id)
      .maybeSingle();
    if (!patient) {
      return (
        <Notice
          title="Enlace no válido"
          message="No encontramos el registro asociado. Contacte a la clínica."
        />
      );
    }
    patientName = patient.full_name;
  }

  return (
    <Shell>
      <PublicAnamnesisForm
        token={token}
        kind={isNew ? "new" : "existing"}
        clinicName={clinic?.name ?? "la clínica"}
        logoUrl={logoUrl}
        patientName={patientName}
        initialData={EMPTY_ANAMNESIS}
        initialAllergies=""
        initialAlerts=""
        customQuestions={
          isNew && normalizeFeatures(clinic?.features).preguntas_registro
            ? getActiveIntakeQuestions(clinic?.settings)
            : []
        }
      />
    </Shell>
  );
}
