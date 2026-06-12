// Cliente Zavu — mensajería WhatsApp vía API oficial de Meta
// Documentación: https://docs.zavu.dev
//
// Variables de entorno requeridas:
//   ZAVU_API_KEY        → API key del dashboard de Zavu (zv_live_xxx)
//   ZAVU_TEMPLATE_ID    → ID de la plantilla aprobada por Meta (ej. "recordatorio_cita")
//
// Estado: listo para usar, pendiente de ZAVU_API_KEY y aprobación de plantilla Meta.

const ZAVU_BASE = "https://api.zavu.dev/v1";

export interface ZavuSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

// Envía un recordatorio de cita usando la plantilla aprobada por Meta.
// variables debe tener exactamente los campos que definiste en la plantilla:
//   "1" → nombre del paciente
//   "2" → nombre de la clínica
//   "3" → fecha (ej. "lunes 16 de junio")
//   "4" → hora (ej. "10:00 AM")
//   "5" → doctor (ej. "Dr. García") — si tu plantilla lo incluye
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateVariables: Record<string, string>
): Promise<ZavuSendResult> {
  const apiKey = process.env.ZAVU_API_KEY;
  const templateId = process.env.ZAVU_TEMPLATE_ID;

  if (!apiKey)   return { ok: false, error: "ZAVU_API_KEY no configurada" };
  if (!templateId) return { ok: false, error: "ZAVU_TEMPLATE_ID no configurada" };

  try {
    const res = await fetch(`${ZAVU_BASE}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: toPhone,
        channel: "whatsapp",
        messageType: "template",
        content: {
          templateId,
          templateVariables,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }

    return { ok: true, messageId: data?.message?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
