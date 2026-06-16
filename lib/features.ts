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
  | "whatsapp"
  | "whatsapp_manual"
  | "recetas"
  | "pagos"
  | "perfil"
  | "consentimientos"
  | "recordatorios";

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
  { key: "whatsapp", label: "WhatsApp Baileys", href: "/agenda", optIn: true },
  { key: "whatsapp_manual", label: "WhatsApp Manual", href: "/agenda", optIn: true },
  { key: "recetas", label: "Recetas y Presupuesto", href: "/pacientes", optIn: true },
  { key: "perfil", label: "Perfil de clínica", href: "/ajustes", optIn: true },
  { key: "consentimientos", label: "Consentimientos", href: "/pacientes", optIn: true },
  { key: "recordatorios", label: "Recordatorios Automáticos", href: "/ajustes", optIn: true },
];

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
      // Opt-in: debe estar explícitamente en true para considerarse habilitado.
      out[f.key] = obj[f.key] === true;
    } else {
      // Opt-out: se asume encendido si la clave falta (retrocompatibilidad).
      out[f.key] = obj[f.key] !== false;
    }
  }
  return out;
}

export function isEnabled(features: Features, key: FeatureKey): boolean {
  return features[key];
}
