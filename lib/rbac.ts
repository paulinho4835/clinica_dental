// Permisos por rol (espejo de las políticas RLS — la DB es la fuente de verdad).
export type Role =
  | "admin"
  | "recepcionista"
  | "odontologo_general"
  | "especialista"
  | "asistente";

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
    "patients:read", "patients:write", "patients:delete", "appointments:write",
    "billing:write", "inventory:write",
  ],
  odontologo_general: ["patients:read", "appointments:write", "clinical:write"],
  especialista: ["patients:read", "appointments:write", "clinical:write"],
  asistente: ["patients:read", "inventory:write"],
};

export function can(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(perm) ?? false;
}
