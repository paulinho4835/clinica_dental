import { FEATURES, type FeatureKey, type Features } from "@/lib/features";
import { canSeeNav, type Role } from "@/lib/rbac";

export type NavItem = {
  href: string;
  label: string;
  /** Título de la sección del menú a la que pertenece (null = sin título). */
  section: string | null;
  badge?: number;
};

// Secciones del menú lateral, en orden. Un admin llega a ver 15 módulos: en
// una sola lista plana costaba encontrar cada uno.
const NAV_SECTIONS: { label: string | null; keys: FeatureKey[] }[] = [
  { label: null, keys: ["inicio"] },
  {
    label: "Clínica",
    keys: ["agenda", "pacientes", "mis_trabajos", "tratamientos", "disponibilidad", "inventario"],
  },
  { label: "Finanzas", keys: ["caja", "cuentas", "pagos"] },
  { label: "Comunicación", keys: ["calificaciones", "wa_masivo", "campanas"] },
  { label: "Administración", keys: ["auditoria", "ajustes"] },
];

// Con pocos módulos (p. ej. un doctor) los títulos de sección solo agregan ruido.
export const NAV_SECTION_MIN_ITEMS = 8;

// Menú = módulos encendidos de la clínica Y permitidos para el rol, agrupados
// por sección. Un módulo de menú que no esté en ninguna sección se agrega al
// final para que nunca desaparezca en silencio.
export function navItemsFor(features: Features, role: Role | undefined): NavItem[] {
  const visible = new Map(
    FEATURES.filter((f) => features[f.key] && canSeeNav(role, f.key)).map((f) => [f.key, f]),
  );
  const items: NavItem[] = [];
  for (const section of NAV_SECTIONS) {
    for (const key of section.keys) {
      const feature = visible.get(key);
      if (!feature) continue;
      items.push({ href: feature.href, label: feature.label, section: section.label });
      visible.delete(key);
    }
  }
  for (const feature of visible.values()) {
    items.push({ href: feature.href, label: feature.label, section: null });
  }
  return items;
}
