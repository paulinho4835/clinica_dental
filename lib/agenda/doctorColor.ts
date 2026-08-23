"use client";

import { createContext, useContext } from "react";

export type DoctorColor = {
  bg: string;      // Tailwind bg class  e.g. "bg-blue-50"
  dot: string;     // Tailwind bg class para círculos indicadores e.g. "bg-blue-600"
  border: string;  // Tailwind border-color class  e.g. "border-blue-600"
  text: string;    // Tailwind text class  e.g. "text-blue-800"
};

// Paleta de colores MUY distintos entre sí, ordenada para que los primeros
// (la mayoría de clínicas tienen pocos doctores) sean lo más diferentes posible:
// azul, rojo, verde, ámbar, violeta, rosa… Sin pares parecidos (nada de
// teal+emerald ni indigo+violet juntos).
export const DOCTOR_PALETTE: DoctorColor[] = [
  { bg: "bg-blue-50",    dot: "bg-blue-600",    border: "border-blue-600",    text: "text-blue-800"    },
  { bg: "bg-red-50",     dot: "bg-red-500",     border: "border-red-500",     text: "text-red-800"     },
  { bg: "bg-emerald-50", dot: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-800" },
  { bg: "bg-amber-50",   dot: "bg-amber-500",   border: "border-amber-500",   text: "text-amber-900"   },
  { bg: "bg-violet-50",  dot: "bg-violet-500",  border: "border-violet-500",  text: "text-violet-800"  },
  { bg: "bg-pink-50",    dot: "bg-pink-500",    border: "border-pink-500",    text: "text-pink-800"    },
  { bg: "bg-cyan-50",    dot: "bg-cyan-500",    border: "border-cyan-500",    text: "text-cyan-800"    },
  { bg: "bg-lime-50",    dot: "bg-lime-500",    border: "border-lime-600",    text: "text-lime-800"    },
  { bg: "bg-orange-50",  dot: "bg-orange-600",  border: "border-orange-600",  text: "text-orange-800"  },
  { bg: "bg-fuchsia-50", dot: "bg-fuchsia-500", border: "border-fuchsia-500", text: "text-fuchsia-800" },
];

const UNASSIGNED: DoctorColor = {
  bg: "bg-slate-100",
  dot: "bg-slate-300",
  border: "border-slate-300",
  text: "text-slate-500",
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Fallback por hash del nombre (para nombres fuera de la lista de doctores).
// Puede repetir color si dos nombres colisionan; por eso lo preferible es el
// resolver por posición (buildDoctorColorResolver), que es libre de colisiones.
export function getDoctorColor(doctorId: string | null | undefined): DoctorColor {
  if (!doctorId) return UNASSIGNED;
  return DOCTOR_PALETTE[hashStr(doctorId) % DOCTOR_PALETTE.length];
}

export type DoctorColorResolver = (name: string | null | undefined) => DoctorColor;

// Construye un resolver que asigna a cada doctor un color DISTINTO según su
// posición en la lista (ordenada por nombre para que sea estable). Dos doctores
// nunca comparten color mientras haya entradas libres en la paleta.
export function buildDoctorColorResolver(
  doctors: (string | { full_name: string; agenda_color?: string | null })[],
): DoctorColorResolver {
  const map = new Map<string, DoctorColor>();
  const assignments = doctors.map((doctor) =>
    typeof doctor === "string" ? { full_name: doctor } : doctor,
  );
  const unique = [...new Set(assignments.map((doctor) => doctor.full_name?.trim()).filter(Boolean))].sort(
    (a, b) => a!.localeCompare(b!),
  ) as string[];
  unique.forEach((name, i) => {
    const assigned = assignments.find((doctor) => doctor.full_name.trim() === name)?.agenda_color;
    map.set(
      name,
      DOCTOR_PALETTE.find((color) => color.dot === `bg-${assigned}-500` || color.dot === `bg-${assigned}-600`) ??
        DOCTOR_PALETTE[i % DOCTOR_PALETTE.length],
    );
  });

  return (name) => {
    const key = name?.trim();
    if (!key) return UNASSIGNED;
    return map.get(key) ?? getDoctorColor(key);
  };
}

// Contexto para que las vistas (Día/Semana/Mes) usen el resolver sin colisiones
// provisto por AgendaShell. Por defecto cae al hash.
export const DoctorColorContext = createContext<DoctorColorResolver>(getDoctorColor);

export function useDoctorColor(): DoctorColorResolver {
  return useContext(DoctorColorContext);
}
