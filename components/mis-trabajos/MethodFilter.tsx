"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "", label: "Todos" },
  { value: "cash", label: "Efectivo" },
  { value: "qr", label: "QR" },
  { value: "card", label: "Tarjeta" },
];

export function MethodFilter({ selected }: { selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onClick(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("method", value);
    else next.delete("method");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Método:</span>
      <div className="flex gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onClick(o.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selected === o.value
                ? "bg-clinic text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
