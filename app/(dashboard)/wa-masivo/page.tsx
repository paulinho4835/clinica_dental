import { requireNavAccess } from "@/lib/guard";
import { getClinicFeatures } from "@/lib/superadmin";
import { BulkSendPanel } from "@/components/whatsapp/BulkSendPanel";

const WA_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3001";

export default async function WaMasivoPage() {
  await requireNavAccess("wa_masivo");

  const features = await getClinicFeatures();

  // Verificar si Baileys está conectado para esta clínica
  let connected = false;
  if (features.whatsapp) {
    try {
      // Necesitamos el clinicId — lo obtenemos vía getProfile
      const { getProfile } = await import("@/lib/auth");
      const profile = await getProfile();
      if (profile?.clinicId) {
        const res = await fetch(`${WA_URL}/status/${profile.clinicId}`, {
          signal: AbortSignal.timeout(3_000),
        });
        const data = await res.json();
        connected = data.connected ?? false;
      }
    } catch {
      // servicio caído — connected = false
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">WhatsApp Masivo</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envía recordatorios de cita a todos los pacientes del día seleccionado a través del
          Agente de WhatsApp. Los mensajes se envían de forma individual con un delay configurable
          para evitar restricciones.
        </p>
      </div>

      {!features.whatsapp && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
          El módulo <strong>Agente de WhatsApp</strong> no está habilitado para esta clínica.
          Actívalo desde el panel de Superadmin.
        </div>
      )}

      {features.whatsapp && <BulkSendPanel connected={connected} />}
    </div>
  );
}
