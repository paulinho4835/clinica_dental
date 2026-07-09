// Helpers puros para armar el mensaje y el link de wa.me de una campaña.
// Reutiliza normalizePhone (mismo criterio que el resto de la app para
// distinguir celulares bolivianos de números internacionales).
import { normalizePhone } from "@/lib/phone-utils";

// Primer nombre de un nombre completo, para no sonar demasiado formal en el
// saludo ("Hola Juan" en vez de "Hola Juan Pérez López").
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

// Reemplaza TODAS las ocurrencias del placeholder literal "{nombre}" por el
// primer nombre del paciente. Si el mensaje no lo trae, se devuelve tal cual.
export function applyNamePlaceholder(message: string, fullName: string): string {
  return message.split("{nombre}").join(firstName(fullName));
}

// Arma el link de wa.me con el mensaje ya personalizado y codificado. Null si
// el teléfono no es válido (el llamador debe entonces ocultar el botón de
// enviar y mostrar el aviso de "sin teléfono").
export function buildCampaignWaLink(
  phone: string | null | undefined,
  message: string,
  fullName: string,
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const text = applyNamePlaceholder(message, fullName);
  return `https://wa.me/${normalized.replace("+", "")}?text=${encodeURIComponent(text)}`;
}
