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
  | "campanas"
  | "aviso_doctores"
  | "disponibilidad"
  | "agente_ia"
  | "agente_ia_t2"
  | "agente_ia_t3"
  | "agente_ia_info"
  | "logo"
  | "periodontograma"
  | "odontograma_pediatrico";

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
  { key: "caja", label: "Dashboard", href: "/caja" },
  { key: "cuentas", label: "Cuentas de pacientes", href: "/cuentas" },
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
  // Addon: campañas/promociones enviadas manualmente por WhatsApp (wa.me), sin
  // depender de Baileys. Independiente de wa_masivo: no enciende Baileys.
  { key: "campanas", label: "Campañas de WhatsApp", href: "/campanas", optIn: true },
  // Addon: aviso manual de agenda al doctor por WhatsApp Web (wa.me). La recepción
  // abre el chat del doctor con el resumen de sus citas del día ya prellenado.
  { key: "aviso_doctores", label: "Aviso de agenda a doctores", href: "/agenda", optIn: true },
  // Addon: disponibilidad de doctores. Registra cuándo NO atiende cada doctor
  // (semanal o por fechas); se pinta gris en la agenda, avisa al agendar encima
  // y el Agente de IA no ofrece esos horarios.
  { key: "disponibilidad", label: "Disponibilidad Doctores", href: "/disponibilidad", optIn: true },
  // Addon: agente de IA que responde por WhatsApp (Baileys) y agenda citas. La
  // recepción virtual atiende, consulta disponibilidad y crea citas; deriva a
  // un humano (pausa) para todo lo demás. Opt-in.
  { key: "agente_ia", label: "Agente de IA (WhatsApp)", href: "/agenda", optIn: true },
  // Addon premium (T2) del agente de IA: además de agendar, el agente puede
  // consultar, reprogramar y cancelar citas existentes por WhatsApp. Solo tiene
  // efecto si "agente_ia" también está encendido.
  { key: "agente_ia_t2", label: "Agente de IA T2 (gestiona citas)", href: "/agenda", optIn: true },
  // Addon premium (T3) del agente de IA: consulta disponibilidad real de la
  // agenda (check_availability) antes de agendar o reprogramar, y muestra al
  // paciente los horarios libres formateados. Sin T3, el agente agenda "a
  // ciegas" con la hora que el paciente pida y solo avisa si choca. Independiente
  // de T2: T2 sin T3 reprograma directo (falla si choca, igual que agendar).
  { key: "agente_ia_t3", label: "Agente de IA T3 (consulta disponibilidad real)", href: "/agenda", optIn: true },
  // Addon del agente de IA: información oficial de la clínica (tratamientos,
  // precios, horarios, promociones, FAQ) que el bot usa para responder esas
  // preguntas en vez de derivarlas a un humano. La clínica cura el contenido en
  // Ajustes; el bot SOLO sabe lo que está escrito ahí. Requiere agente_ia.
  { key: "agente_ia_info", label: "Agente de IA · Info de la clínica (precios/FAQ)", href: "/ajustes", optIn: true },
  // Addon: subir el logo de la clínica para que aparezca en los documentos
  // impresos (presupuesto, recetas, consentimientos, etc.). Opt-in.
  { key: "logo", label: "Logo en documentos", href: "/ajustes", optIn: true },
  // Addon premium: carta periodontal (6 sitios por diente) con exámenes fechados
  // e índices automáticos. Vive en la ficha del paciente. Opt-in.
  { key: "periodontograma", label: "Periodontograma", href: "/pacientes", optIn: true },
  // Addon opt-in: odontograma de dentición temporal (FDI 51-85), independiente
  // del odontograma de adultos. Vive en la ficha del paciente.
  { key: "odontograma_pediatrico", label: "Odontograma Pediátrico", href: "/pacientes", optIn: true },
  { key: "ajustes", label: "Ajustes", href: "/ajustes", core: true },
];

// Agrupación temática de la sección ADD-ONS del panel de superadmin (solo
// presentación: no cambia ninguna lógica de features). Cubre exactamente los
// FeatureKey con optIn:true. Si se agrega un add-on nuevo a FEATURES hay que
// sumarlo a algún grupo aquí, o no se mostrará en el panel (ver console.warn
// en ClinicList).
export const ADDON_GROUPS: { label: string; keys: FeatureKey[] }[] = [
  { label: "💬 Comunicación", keys: ["whatsapp_manual", "wa_masivo", "campanas", "aviso_doctores", "recordatorios"] },
  { label: "🤖 Agente de IA", keys: ["agente_ia", "agente_ia_t2", "agente_ia_t3", "agente_ia_info"] },
  { label: "🦷 Ficha clínica y documentos", keys: ["recetas", "consentimientos", "fotos", "fotos_contador", "periodontograma", "odontograma_pediatrico", "logo"] },
  { label: "⚙️ Administración", keys: ["inicio", "pagos", "bloqueo_horario", "perfil", "disponibilidad", "calificaciones"] },
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

// Presets de "Módulos" (los no-core, no-opt-in) para clínicas grandes vs
// consultorios pequeños de 1 doctor. Los add-ons (opt-in) NO forman parte del
// preset: se venden aparte y se prenden igual en cualquier plan.
// Fuente de verdad de qué claves son "módulo": FEATURES sin core ni optIn.
export const MODULE_KEYS: FeatureKey[] = [
  "agenda", "pacientes", "mis_trabajos", "tratamientos",
  "inventario", "caja", "cuentas", "auditoria",
];

export type ModulePreset = "consultorio" | "clinica";

export const MODULE_PRESET_LABELS: Record<ModulePreset, string> = {
  consultorio: "Consultorio",
  clinica: "Clínica completa",
};

// Módulos encendidos por preset. Todo lo que no aparezca aquí se apaga
// explícitamente al aplicar el preset (no se asume nada por ausencia).
export const MODULE_PRESETS: Record<ModulePreset, FeatureKey[]> = {
  // Consultorio de 1 doctor: solo lo esencial para atender pacientes. Sin
  // inventario, caja, cuentas de pacientes ni auditoría (no maneja stock,
  // finanzas de equipo ni necesita trazabilidad multi-usuario).
  consultorio: ["agenda", "pacientes", "mis_trabajos", "tratamientos"],
  // Clínica con equipo: todos los módulos encendidos.
  clinica: [...MODULE_KEYS],
};

// Construye el objeto `features` inicial de una clínica nueva según su preset
// de módulos. Define EXPLÍCITAMENTE cada MODULE_KEY (true/false) para no
// depender de que normalizeFeatures asuma "encendido por ausencia" — así una
// clínica "consultorio" nace realmente sin inventario/caja/cuentas/auditoría.
// Los add-ons opt-in no se incluyen: nacen apagados por su propia lógica.
export function initialFeaturesForPreset(
  preset: ModulePreset,
  opts: { whatsapp: boolean },
): Record<string, boolean> {
  const on = new Set(MODULE_PRESETS[preset]);
  const features: Record<string, boolean> = {};
  for (const key of MODULE_KEYS) features[key] = on.has(key);
  features.whatsapp = opts.whatsapp;
  return features;
}

// Si el conjunto actual de módulos ON coincide exactamente con un preset,
// devuelve su nombre; si no, null (plan "personalizado" armado a mano).
export function detectModulePreset(features: Features): ModulePreset | null {
  for (const preset of Object.keys(MODULE_PRESETS) as ModulePreset[]) {
    const on = new Set(MODULE_PRESETS[preset]);
    const matches = MODULE_KEYS.every((k) => features[k] === on.has(k));
    if (matches) return preset;
  }
  return null;
}
