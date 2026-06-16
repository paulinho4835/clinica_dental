// Ventana horaria en la que doctores pueden modificar registros clínicos
// (odontograma y evolución). El admin queda exento. Configurable por clínica
// en clinics.settings.clinical_hours; por defecto 08:00–20:00 hora Bolivia.

export type ClinicalHours = { enabled: boolean; from: string; to: string };

export const DEFAULT_CLINICAL_HOURS: ClinicalHours = {
  enabled: true,
  from: "08:00",
  to: "20:00",
};

// Lee la config desde clinics.settings (jsonb), con valores por defecto.
export function getClinicalHours(settings: unknown): ClinicalHours {
  const s = (settings ?? {}) as Record<string, unknown>;
  const ch = (s.clinical_hours ?? {}) as Record<string, unknown>;
  return {
    enabled: ch.enabled !== false, // por defecto activo
    from: typeof ch.from === "string" && /^\d{2}:\d{2}$/.test(ch.from) ? ch.from : DEFAULT_CLINICAL_HOURS.from,
    to: typeof ch.to === "string" && /^\d{2}:\d{2}$/.test(ch.to) ? ch.to : DEFAULT_CLINICAL_HOURS.to,
  };
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Minutos desde medianoche en hora Bolivia (America/La_Paz).
function nowBoliviaMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

// ¿Estamos dentro de la ventana de edición clínica ahora (hora Bolivia)?
export function withinClinicalHours(settings: unknown): boolean {
  const ch = getClinicalHours(settings);
  if (!ch.enabled) return true; // bloqueo desactivado → siempre permitido
  const now = nowBoliviaMinutes();
  const from = hhmmToMinutes(ch.from);
  const to = hhmmToMinutes(ch.to);
  if (from <= to) return now >= from && now < to;
  // Ventana que cruza medianoche (ej. 20:00–08:00)
  return now >= from || now < to;
}
