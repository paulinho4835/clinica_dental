import type { FeatureKey } from "@/lib/features";

// Permisos por rol (espejo de las políticas RLS — la DB es la fuente de verdad).
export type Role =
  | "admin"
  | "recepcionista"
  | "colega"
  | "odontologo_general"
  | "especialista"
  | "asistente";

// Roles con acceso de recepción: ven toda la clínica y pueden asignar trabajos a otros.
// Colega NO entra aquí: solo ve sus propios datos (como un doctor).
export function isReceptionistLike(role: Role | undefined): boolean {
  return role === "recepcionista";
}

// Módulos del menú lateral visibles por rol.
const NAV_WHITELIST: Record<Role, FeatureKey[]> = {
  admin:              ["inicio", "agenda", "pacientes", "mis_trabajos", "tratamientos", "inventario", "caja", "cuentas", "pagos", "ajustes", "auditoria", "calificaciones", "wa_masivo", "campanas", "disponibilidad"],
  recepcionista:      ["inicio", "agenda", "pacientes", "mis_trabajos", "wa_masivo", "campanas", "disponibilidad"],
  colega:             ["inicio", "agenda", "pacientes", "mis_trabajos", "calificaciones", "wa_masivo", "campanas", "ajustes"],
  odontologo_general: ["inicio", "agenda", "pacientes", "mis_trabajos", "calificaciones", "ajustes"],
  especialista:       ["inicio", "agenda", "pacientes", "mis_trabajos", "calificaciones", "ajustes"],
  asistente:          ["inicio", "agenda", "pacientes", "inventario"],
};

export function canSeeNav(role: Role | undefined, key: FeatureKey): boolean {
  if (!role) return false;
  return NAV_WHITELIST[role]?.includes(key) ?? false;
}

type Permission =
  | "patients:read" | "patients:write" | "patients:delete"
  | "appointments:write"
  | "clinical:write"      // odontograma, planes
  | "billing:write"
  | "expenses:write"      // gastos / comisiones
  | "inventory:write"
  | "settings:write";     // usuarios, roles, clínica

const MATRIX: Record<Role, Permission[]> = {
  admin: [
    "patients:read", "patients:write", "patients:delete", "appointments:write",
    "clinical:write", "billing:write", "expenses:write", "inventory:write", "settings:write",
  ],
  recepcionista: [
    "patients:read", "patients:write", "appointments:write",
    "clinical:write", "billing:write",
  ],
  // Colega: como doctor pero con billing:write para registrar sus propios cobros.
  // Solo ve su propia agenda y sus propios trabajos (canViewAll = false).
  colega: [
    "patients:read", "patients:write", "appointments:write",
    "clinical:write", "billing:write",
  ],
  odontologo_general: ["patients:read", "patients:write", "appointments:write", "clinical:write"],
  especialista: ["patients:read", "patients:write", "appointments:write", "clinical:write"],
  asistente: ["patients:read", "inventory:write"],
};

export function can(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(perm) ?? false;
}

// Roles que pueden editar el registro clínico del paciente (anamnesis, evolución,
// odontograma): admin + doctores + colega. NO la recepcionista ni la asistente,
// aunque la recepcionista tenga clinical:write para otras cosas.
const CLINICAL_EDIT_ROLES = new Set<Role>([
  "admin",
  "odontologo_general",
  "especialista",
  "colega",
]);

export function canEditAnamnesis(role: string | undefined): boolean {
  return role ? CLINICAL_EDIT_ROLES.has(role as Role) : false;
}
