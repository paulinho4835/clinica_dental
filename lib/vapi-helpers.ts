import { BOLIVIA_TZ } from "@/lib/format";

// Parsea los argumentos de un tool call de Vapi.
// Vapi puede enviar `arguments` ya como objeto JS o como string JSON.
export function parseArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

// Convierte hora en cualquier formato a "HH:MM" (24h). Devuelve null si no parseable.
export function normalizeTime(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  // "12:00", "9:30", "14:00"
  const hhmm = s.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (hhmm) {
    let h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    if (hhmm[3] === "pm" && h < 12) h += 12;
    if (hhmm[3] === "am" && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  // "12h00", "9h30"
  const hh = s.match(/^(\d{1,2})h(\d{2})$/);
  if (hh) return normalizeTime(`${hh[1]}:${hh[2]}`);
  // "12" o "2 pm" (solo hora, con o sin am/pm)
  const ho = s.match(/^(\d{1,2})(?:\s*(am|pm))?$/);
  if (ho) return normalizeTime(`${ho[1]}:00${ho[2] ? " " + ho[2] : ""}`);
  return null;
}

// Convierte fecha en formatos comunes a "YYYY-MM-DD". Devuelve null si no parseable.
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  // Ya es YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY o DD-MM-YYYY (formato boliviano)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }
  // MM/DD/YYYY (formato americano)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const m = mdy[1].padStart(2, "0");
    const d = mdy[2].padStart(2, "0");
    return `${mdy[3]}-${m}-${d}`;
  }
  return null;
}

// Normaliza el número de teléfono que envía Vapi ("+59171234567" → "59171234567").
// También maneja formatos sin código de país para números bolivianos de 8 dígitos.
export function normalizeVapiPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8 && (digits[0] === "6" || digits[0] === "7")) {
    return `591${digits}`;
  }
  if (digits.length >= 10) return digits;
  return null;
}

// Slots horarios según el día de la semana (hora Bolivia).
// Lun-Sáb: 09:00 – 19:00 (11 slots de 1h). Dom: 09:00, 10:00, 11:00.
export function buildSlots(date: string): string[] {
  const local = new Date(
    new Date(`${date}T12:00:00Z`).toLocaleString("en-US", { timeZone: BOLIVIA_TZ }),
  );
  const dow = local.getDay(); // 0=Dom, 1=Lun … 6=Sáb

  if (dow === 0) {
    return ["09:00", "10:00", "11:00"];
  }
  return Array.from({ length: 11 }, (_, i) =>
    `${String(i + 9).padStart(2, "0")}:00`,
  );
}
