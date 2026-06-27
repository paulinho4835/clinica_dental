// Catálogo de módulos toggleables por clínica (feature flags).
// MISMO código para todos los clientes; cada clínica enciende/apaga estos
// módulos vía clinics.features. La fuente de verdad es la columna jsonb.

export type FeatureKey =
  | "agenda"
  | "pacientes"
  | "mis_trabajos"
  | "tratamientos"
  | "caja"
  | "cuentas"
  | "inventario"
  | "ajustes"
  | "auditoria"
  | "bloqueo_horario"
  | "whatsapp"
  | "whatsapp_manual"
  | "recetas"
  | "pagos"
  | "perfil"
  | "consentimientos"
  | "recordatorios"
  | "calificaciones"
  | "fotos"
  | "fotos_20"
  | "wa_masivo";

export interface FeatureMeta {
  key: FeatureKey;
  label: string;
  href: string;
  /** Núcleo: no se puede apagar desde el panel (dejaría la clínica inoperable). */
  core?: boolean;
  /** Opt-in: apagado por defecto para clínicas sin el feature explícitamente habilitado. */
  optIn?: boolean;
}

// Orden = orden en el menú lateral.
export const FEATURES: FeatureMeta[] = [
  { key: "agenda", label: "Agenda", href: "/agenda" },
  { key: "pacientes", label: "Pacientes", href: "/pacientes" },
  { key: "mis_trabajos", label: "Mis trabajos", href: "/mis-trabajos" },
  { key: "pagos", label: "Pagos a personal", href: "/pagos", optIn: true },
  { key: "tratamientos", label: "Tratamientos", href: "/tratamientos" },
  { key: "inventario", label: "Inventario", href: "/inventario" },
  { key: "caja", label: "Dashboard financiero", href: "/caja" },
  { key: "cuentas", label: "Cuentas de pacientes", href: "/cuentas" },
  { key: "ajustes", label: "Ajustes", href: "/ajustes", core: true },
  { key: "auditoria", label: "Auditoría", href: "/auditoria" },
  { key: "bloqueo_horario", label: "Bloqueo por horario", href: "/ajustes", optIn: true },
  // "whatsapp" (Baileys) no aparece en superadmin: se deriva automáticamente
  // cuando wa_masivo o recordatorios están activos (ver normalizeFeatures).
  { key: "whatsapp_manual", label: "WhatsApp Manual", href: "/agenda", optIn: true },
  { key: "recetas", label: "Recetas y Presupuesto", href: "/pacientes", optIn: true },
  { key: "perfil", label: "Perfil de clínica", href: "/ajustes", optIn: true },
  { key: "consentimientos", label: "Consentimientos", href: "/pacientes", optIn: true },
  { key: "recordatorios", label: "Recordatorios Automáticos", href: "/ajustes", optIn: true },
  { key: "calificaciones", label: "Calificaciones", href: "/calificaciones", optIn: true },
  { key: "fotos", label: "Fotos de pacientes (10)", href: "/pacientes", optIn: true },
  { key: "fotos_20", label: "Fotos ampliadas (20)", href: "/pacientes", optIn: true },
  { key: "wa_masivo", label: "WhatsApp Masivo", href: "/wa-masivo", optIn: true },
];

// Tope de fotos por paciente según el addon contratado. El upgrade "fotos_20"
// implica el base: una clínica con fotos_20 no necesita tener "fotos" encendido.
// 0 = el módulo de fotos no está habilitado para la clínica.
export const FOTOS_LIMIT_BASE = 10;
export const FOTOS_LIMIT_PLUS = 20;

export function photoLimit(features: Features): number {
  if (features.fotos_20) return FOTOS_LIMIT_PLUS;
  if (features.fotos) return FOTOS_LIMIT_BASE;
  return 0;
}

// El módulo de fotos está disponible si tiene cualquiera de los dos addons.
export function fotosEnabled(features: Features): boolean {
  return features.fotos || features.fotos_20;
}

export type Features = Record<FeatureKey, boolean>;

// Si una clave falta en el jsonb (clínica vieja, módulo nuevo), se asume
// encendida para no romper clínicas existentes al agregar features.
export function normalizeFeatures(raw: unknown): Features {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Features;
  for (const f of FEATURES) {
    if (f.core) {
      out[f.key] = true;
    } else if (f.optIn) {
      out[f.key] = obj[f.key] === true;
    } else {
      out[f.key] = obj[f.key] !== false;
    }
  }
  // Baileys se activa automáticamente cuando wa_masivo o recordatorios están ON.
  // El valor guardado en DB se ignora: ya no hay toggle separado en superadmin.
  out.whatsapp = out.wa_masivo || out.recordatorios;
  return out;
}

export function isEnabled(features: Features, key: FeatureKey): boolean {
  return features[key];
}
