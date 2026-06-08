import "server-only";

// ============================================================================
// Cliente de WhatsApp Cloud API (Meta / Facebook Graph).
// Los recordatorios de cita son mensajes INICIADOS por el negocio fuera de la
// ventana de 24h, por lo que Meta sólo los permite mediante una PLANTILLA
// (template) previamente aprobada. Por eso no enviamos texto libre.
// ============================================================================

const GRAPH_VERSION = "v21.0";

export type SendResult = { ok: boolean; error?: string; id?: string };

// Normaliza un teléfono a formato internacional SIN el '+' (lo que pide la API).
// Asume Bolivia (+591) cuando el número no trae código de país.
//   "71234567"      -> "59171234567"
//   "+591 71234567" -> "59171234567"
//   "0 71234567"    -> "59171234567"
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, ""); // sólo dígitos
  if (!d) return null;
  d = d.replace(/^0+/, ""); // quita ceros de marcación nacional
  if (d.startsWith("591")) return d; // ya trae código Bolivia
  // Celular boliviano: 8 dígitos que empiezan en 6 o 7.
  if (d.length === 8 && /^[67]/.test(d)) return "591" + d;
  // 9+ dígitos: asumimos que ya incluye código de país.
  if (d.length >= 9) return d;
  return null; // demasiado corto para ser válido
}

// Envía un mensaje de plantilla. `templateParams` son los valores posicionales
// {{1}}, {{2}}, … del cuerpo de la plantilla, en orden.
export async function sendWhatsAppTemplate(params: {
  phone: string;
  templateParams: string[];
}): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_TEMPLATE ?? "recordatorio_cita";
  const lang = process.env.WHATSAPP_LANG ?? "es";

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: "WhatsApp no configurado (faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    };
  }

  const to = normalizePhone(params.phone);
  if (!to) return { ok: false, error: "Teléfono inválido" };

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: params.templateParams.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, id: json?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red" };
  }
}
