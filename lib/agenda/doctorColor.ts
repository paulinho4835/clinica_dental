export type DoctorColor = {
  bg: string;      // Tailwind bg class  e.g. "bg-teal-50"
  dot: string;     // Tailwind bg class para círculos indicadores e.g. "bg-teal-500"
  border: string;  // Tailwind border-color class  e.g. "border-teal-500"
  text: string;    // Tailwind text class  e.g. "text-teal-800"
};

export const DOCTOR_PALETTE: DoctorColor[] = [
  { bg: "bg-teal-50",    dot: "bg-teal-500",    border: "border-teal-500",    text: "text-teal-800"   },
  { bg: "bg-indigo-50",  dot: "bg-indigo-500",  border: "border-indigo-500",  text: "text-indigo-800" },
  { bg: "bg-pink-50",    dot: "bg-pink-500",    border: "border-pink-500",    text: "text-pink-800"   },
  { bg: "bg-amber-50",   dot: "bg-amber-500",   border: "border-amber-500",   text: "text-amber-800"  },
  { bg: "bg-emerald-50", dot: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-800"},
  { bg: "bg-violet-50",  dot: "bg-violet-500",  border: "border-violet-500",  text: "text-violet-800" },
  { bg: "bg-red-50",     dot: "bg-red-500",     border: "border-red-500",     text: "text-red-800"    },
  { bg: "bg-sky-50",     dot: "bg-sky-500",     border: "border-sky-500",     text: "text-sky-800"    },
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

export function getDoctorColor(doctorId: string): DoctorColor {
  if (!doctorId) return UNASSIGNED;
  return DOCTOR_PALETTE[hashStr(doctorId) % DOCTOR_PALETTE.length];
}
