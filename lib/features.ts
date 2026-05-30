// Catálogo de módulos toggleables por clínica (feature flags).
// MISMO código para todos los clientes; cada clínica enciende/apaga estos
// módulos vía clinics.features. La fuente de verdad es la columna jsonb.

export type FeatureKey =
  | "agenda"
  | "pacientes"
  | "tratamientos"
  | "caja"
  | "inventario"
  | "ajustes";

export interface FeatureMeta {
  key: FeatureKey;
  label: string;
  href: string;
  /** Núcleo: no se puede apagar desde el panel (dejaría la clínica inoperable). */
  core?: boolean;
}

// Orden = orden en el menú lateral.
export const FEATURES: FeatureMeta[] = [
  { key: "agenda", label: "Agenda", href: "/agenda" },
  { key: "pacientes", label: "Pacientes", href: "/pacientes" },
  { key: "tratamientos", label: "Tratamientos", href: "/tratamientos" },
  { key: "caja", label: "Caja y finanzas", href: "/caja" },
  { key: "inventario", label: "Inventario", href: "/inventario" },
  { key: "ajustes", label: "Ajustes", href: "/ajustes", core: true },
];

export type Features = Record<FeatureKey, boolean>;

// Si una clave falta en el jsonb (clínica vieja, módulo nuevo), se asume
// encendida para no romper clínicas existentes al agregar features.
export function normalizeFeatures(raw: unknown): Features {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Features;
  for (const f of FEATURES) {
    out[f.key] = f.core ? true : obj[f.key] !== false;
  }
  return out;
}

export function isEnabled(features: Features, key: FeatureKey): boolean {
  return features[key];
}
