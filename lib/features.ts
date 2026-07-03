// Catálogo de módulos toggleables por clínica (feature flags).
// MISMO código para todos los clientes; cada clínica enciende/apaga estos
// módulos vía clinics.features. La fuente de verdad es la columna jsonb.

export type FeatureKey =
  | "inicio"
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
  | "fotos_contador"
  | "wa_masivo"
  | "aviso_doctores"
  | "agente_ia"
  | "logo"
  | "periodontograma";

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
  // Addon: panel de bienvenida con métricas del día. Opt-in (apagado por defecto).
  { key: "inicio", label: "Inicio", href: "/inicio", optIn: true },
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
  { key: "fotos", label: "Fotos de pacientes", href: "/pacientes", optIn: true },
  { key: "fotos_contador", label: "Ver contador de fotos", href: "/pacientes", optIn: true },
  { key: "wa_masivo", label: "WhatsApp Masivo", href: "/wa-masivo", optIn: true },
  // Addon: aviso manual de agenda al doctor por WhatsApp Web (wa.me). La recepción
  // abre el chat del doctor con el resumen de sus citas del día ya prellenado.
  { key: "aviso_doctores", label: "Aviso de agenda a doctores", href: "/agenda", optIn: true },
  // Addon: agente de IA que responde por WhatsApp (Baileys) y agenda citas. La
  // recepción virtual atiende, consulta disponibilidad y crea citas; deriva a
  // un humano (pausa) para todo lo demás. Opt-in.
  { key: "agente_ia", label: "Agente de IA (WhatsApp)", href: "/agenda", optIn: true },
  // Addon: subir el logo de la clínica para que aparezca en los documentos
  // impresos (presupuesto, recetas, consentimientos, etc.). Opt-in.
  { key: "logo", label: "Logo en documentos", href: "/ajustes", optIn: true },
  // Addon premium: carta periodontal (6 sitios por diente) con exámenes fechados
  // e índices automáticos. Vive en la ficha del paciente. Opt-in.
  { key: "periodontograma", label: "Periodontograma", href: "/pacientes", optIn: true },
];

// Tope de fotos POR CLÍNICA (no por paciente). El addon "fotos" enciende el
// módulo; el número se configura por clínica desde Superadmin y vive en el mismo
// jsonb `features` bajo la clave `fotos_max` (así no requiere migración). Si el
// addon está encendido pero no hay número, se usa este default.
export const FOTOS_DEFAULT_QUOTA = 2000;

// Lee el tope de fotos de una clínica a partir del jsonb crudo de `features`.
// Devuelve 0 si el módulo de fotos está apagado.
export function photoQuota(rawFeatures: unknown): number {
  const obj = (rawFeatures ?? {}) as Record<string, unknown>;
  if (obj.fotos !== true) return 0;
  const n = obj.fotos_max;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.floor(n);
  return FOTOS_DEFAULT_QUOTA;
}

// El módulo de fotos está disponible si la clínica tiene el addon encendido.
export function fotosEnabled(features: Features): boolean {
  return features.fotos;
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
  // Baileys se activa automáticamente cuando wa_masivo, recordatorios o el
  // agente de IA están ON. El agente responde POR Baileys, así que necesita el
  // número vinculado → debe aparecer el panel de conexión en Ajustes.
  // El valor guardado en DB se ignora: ya no hay toggle separado en superadmin.
  out.whatsapp = out.wa_masivo || out.recordatorios || out.agente_ia;
  return out;
}

export function isEnabled(features: Features, key: FeatureKey): boolean {
  return features[key];
}
