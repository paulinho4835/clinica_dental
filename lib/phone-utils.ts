// Normaliza un número de teléfono a formato E.164 (+591XXXXXXXX).
// Usado por Zavu para enviar WhatsApp vía API oficial.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.startsWith("591")) return "+" + d;
  if (d.length === 8 && /^[67]/.test(d)) return "+591" + d;
  if (d.length >= 9) return "+" + d;
  return null;
}
