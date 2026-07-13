import { bs } from "@/lib/format";

// Barra de progreso de pago de UN tratamiento (pagado del paciente vs. precio
// del ítem del plan). Verde = saldado, ámbar = parcial, gris = sin iniciar.
// Único componente de esta barra en todo el sistema: la usan Pagos a personal
// (StaffPaymentForm, contra la comisión del doctor) y Cuentas de pacientes
// (contra el precio del tratamiento) para que ambos módulos hablen el mismo
// lenguaje visual con los mismos números.
export function TreatmentProgressBar({
  paid,
  total,
  size = "sm",
}: {
  paid: number;
  total: number;
  size?: "sm" | "md";
}) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const isPaid = pct >= 99.9;
  const barColor = isPaid ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-slate-200";
  const barHeight = size === "md" ? "h-1.5" : "h-1";

  return (
    <div className="flex items-center gap-2">
      <div className={`${barHeight} flex-1 overflow-hidden rounded-full bg-slate-100`}>
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`whitespace-nowrap tabular-nums text-xs ${
          isPaid ? "font-medium text-emerald-600" : "text-slate-400"
        }`}
      >
        {isPaid ? "Saldado ✓" : `${bs(paid)} / ${bs(total)}`}
      </span>
    </div>
  );
}
