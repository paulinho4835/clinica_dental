import type { FeatureKey } from "@/lib/features";

// Permisos por rol (espejo de las políticas RLS — la DB es la fuente de verdad).
export type Role =
  | "admin"
  | "recepcionista"
  | "colega"
  | "odontologo_general"
  | "especialista"
  | "asistente";

// Roles con permisos equivalentes a recepcionista (copia funcional para clínicas colaboradoras).
export function isReceptionistLike(role: Role | undefined): boolean {
  return role === "recepcionista" || role === "colega";
}

// Módulos del menú lateral visibles por rol.
const NAV_WHITELIST: Record<Role, FeatureKey[]> = {
  admin:              ["agenda", "pacientes", "mis_trabajos", "tratamientos", "inventario", "caja", "cuentas", "pagos", "ajustes", "auditoria", "wa_masivo"],
  recepcionista:      ["agenda", "pacientes", "mis_trabajos", "wa_masivo"],
  colega:             ["agenda", "pacientes", "mis_trabajos", "wa_masivo"],
  odontologo_general: ["agenda", "pacientes", "mis_trabajos"],
  especialista:       ["agenda", "pacientes", "mis_trabajos"],
  asistente:          ["agenda", "pacientes", "inventario"],
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
