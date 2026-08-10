import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeFeatures } from "@/lib/features";
import { getClinicLogoUrl } from "@/lib/clinicLogo";
import { PrintBrand } from "@/components/print/PrintBrand";
import { AutoPrint, PrintButtons } from "../../pacientes/[id]/imprimir/AutoPrint";
import { money } from "@/lib/format";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transferencia",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/La_Paz",
  });
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  const supabase = await createClient();
  const { data: receipt } = await supabase
    .from("payment_receipts")
    .select("id, clinic_id, receipt_number, patient_name, patient_national_id, description, amount, currency, payment_method, issued_at")
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt) notFound();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, address, phone, nit, features")
    .eq("id", receipt.clinic_id)
    .maybeSingle();
  if (!clinic || !normalizeFeatures(clinic.features).recibos_pago) notFound();

  const logoUrl = await getClinicLogoUrl(receipt.clinic_id);
  const number = `REC-${String(receipt.receipt_number).padStart(6, "0")}`;

  return (
    <>
      <AutoPrint />
      <style>{`
        @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { size: A4; margin: 12mm; } }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>
      <div className="mx-auto max-w-3xl px-8 py-8 text-slate-800">
        <PrintButtons />
        <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <PrintBrand logoUrl={logoUrl}>
            <p className="text-xl font-bold uppercase tracking-wide">{clinic.name ?? "Clínica Dental"}</p>
            <p className="mt-1 text-sm font-semibold uppercase text-slate-500">Recibo de pago</p>
            {(clinic.address || clinic.phone || clinic.nit) && <p className="mt-0.5 text-xs text-slate-500">{[clinic.address, clinic.phone && `Tel: ${clinic.phone}`, clinic.nit && `NIT: ${clinic.nit}`].filter(Boolean).join(" · ")}</p>}
          </PrintBrand>
          <div className="text-right text-sm text-slate-500">
            <p className="font-semibold text-slate-700">{number}</p>
            <p className="mt-1">Emitido: {fmtDateTime(receipt.issued_at)}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-1 rounded-lg bg-slate-50 px-5 py-4 text-sm">
          <div><span className="text-slate-500">Paciente: </span><span className="font-semibold">{receipt.patient_name}</span></div>
          <div><span className="text-slate-500">CI: </span><span className="font-semibold">{receipt.patient_national_id ?? "—"}</span></div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-b-2 border-slate-800 text-left text-xs uppercase text-slate-500"><th className="pb-2 pr-3">Concepto</th><th className="pb-2 pr-3">Método de pago</th><th className="pb-2 text-right">Monto recibido</th></tr></thead>
          <tbody><tr className="border-b border-slate-100"><td className="py-3 pr-3 font-medium">{receipt.description}</td><td className="py-3 pr-3 text-slate-600">{METHOD_LABEL[receipt.payment_method] ?? receipt.payment_method}</td><td className="py-3 text-right font-semibold tabular-nums">{money(Number(receipt.amount), receipt.currency)}</td></tr></tbody>
        </table>

        <p className="mt-5 text-sm text-slate-600">Recibí conforme el monto indicado. Este documento es un recibo de pago y no constituye una factura fiscal.</p>
        <div className="mt-20 flex justify-center"><div className="w-72 text-center text-sm text-slate-500"><div className="border-t border-slate-400 pt-2">Firma del paciente</div><p className="mt-1 text-xs">{receipt.patient_name}</p></div></div>
      </div>
    </>
  );
}
