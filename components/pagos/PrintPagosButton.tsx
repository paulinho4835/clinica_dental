"use client";

import { Printer } from "lucide-react";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transferencia",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  odontologo_general: "Odontólogo",
  especialista: "Especialista",
  recepcionista: "Recepcionista",
  asistente: "Asistente",
};

export type PrintPaymentRow = {
  id: string;
  employeeName: string;
  employeeRole: string;
  amount: number;
  method: string;
  concept: string | null;
  paid_at: string;
  disbursed: boolean;
  works: Array<{
    description: string;
    patient_name: string | null;
    performed_at: string;
    // Monto abonado en este pago (puede ser un adelanto parcial de la comisión).
    paid_amount: number;
    is_partial: boolean;
  }>;
};

export function PrintPagosButton({
  rows,
  monthLabel,
  currency,
}: {
  rows: PrintPaymentRow[];
  monthLabel: string;
  currency: string;
}) {
  function handlePrint() {
    const printDate = new Date().toLocaleDateString("es-BO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const money = (n: number) => `${currency} ${n.toFixed(2)}`;

    const totalDisbursed = rows.filter((r) => r.disbursed).reduce((s, r) => s + r.amount, 0);
    const totalPending = rows.filter((r) => !r.disbursed).reduce((s, r) => s + r.amount, 0);

    const rowsHtml = rows
      .map((r) => {
        const worksHtml =
          r.works.length > 0
            ? `<table class="works-table">
                <tr>
                  <th>Fecha</th><th>Trabajo</th><th>Paciente</th><th class="num">Abonado</th>
                </tr>
                ${r.works
                  .map(
                    (w) => `
                  <tr>
                    <td style="white-space:nowrap;color:#64748b">${fmtDate(w.performed_at)}</td>
                    <td>${w.description || "—"}${w.is_partial ? ' <span style="color:#b45309;font-size:8px">(abono parcial)</span>' : ""}</td>
                    <td style="color:#64748b">${w.patient_name || "—"}</td>
                    <td class="num" style="color:#0e7490;font-weight:600">
                      ${money(w.paid_amount)}
                    </td>
                  </tr>`,
                  )
                  .join("")}
              </table>`
            : "";

        return `
        <div class="payment-block">
          <div class="payment-header">
            <div class="payment-meta">
              <span class="payment-name">${r.employeeName}</span>
              <span class="payment-role">${ROLE_LABEL[r.employeeRole] ?? r.employeeRole}</span>
              ${r.concept ? `<span class="payment-concept">${r.concept}</span>` : ""}
            </div>
            <div class="payment-right">
              <div class="payment-amount">${money(r.amount)}</div>
              <div class="payment-detail">${fmtDate(r.paid_at)} · ${METHOD_LABEL[r.method] ?? r.method}</div>
              <div class="${r.disbursed ? "badge-paid" : "badge-pend"}">${r.disbursed ? "Desembolsado ✓" : "Pendiente"}</div>
            </div>
          </div>
          ${worksHtml}
        </div>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante de pagos a personal</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1e293b;padding:28px 36px}
  .header{border-bottom:2px solid #0e7490;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
  .header h1{font-size:17px;font-weight:bold;color:#0e7490}
  .header .sub{font-size:10px;color:#64748b;margin-top:2px}
  .meta{display:flex;gap:20px;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px}
  .meta-item{font-size:10px;line-height:1.6}
  .meta-item strong{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
  .payment-block{border:1px solid #e2e8f0;border-radius:6px;margin-bottom:10px;overflow:hidden;page-break-inside:avoid}
  .payment-header{display:flex;justify-content:space-between;align-items:flex-start;padding:9px 12px;background:#f8fafc}
  .payment-meta{display:flex;flex-direction:column;gap:2px}
  .payment-name{font-size:12px;font-weight:bold;color:#1e293b}
  .payment-role{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .payment-concept{font-size:10px;color:#475569;margin-top:2px}
  .payment-right{text-align:right}
  .payment-amount{font-size:14px;font-weight:bold;color:#0e7490}
  .payment-detail{font-size:9px;color:#64748b;margin-top:1px}
  .works-table{width:100%;border-collapse:collapse;font-size:9px;border-top:1px solid #e2e8f0}
  .works-table th{background:#fff;text-align:left;padding:4px 10px;font-size:8px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;border-bottom:1px solid #f1f5f9}
  .works-table td{padding:4px 10px;border-bottom:1px solid #f8fafc;vertical-align:top}
  .works-table tr:last-child td{border-bottom:none}
  .num{text-align:right}
  .badge-paid{display:inline-block;background:#dcfce7;color:#166534;border-radius:9999px;padding:2px 7px;font-size:8px;font-weight:700;margin-top:3px}
  .badge-pend{display:inline-block;background:#fef3c7;color:#92400e;border-radius:9999px;padding:2px 7px;font-size:8px;font-weight:700;margin-top:3px}
  .totals{display:flex;justify-content:flex-end;gap:20px;margin:16px 0 24px}
  .total-card{text-align:right}
  .total-label{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .total-value{font-size:15px;font-weight:bold}
  .sig-section{margin-top:36px;border-top:1px dashed #cbd5e1;padding-top:24px}
  .sig-title{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:20px}
  .sig-row{display:flex;justify-content:space-between}
  .sig-block{width:44%;text-align:center}
  .sig-line{border-top:1px solid #1e293b;margin-bottom:6px}
  .sig-name{font-size:11px;font-weight:bold}
  .sig-desc{font-size:9px;color:#64748b;margin-top:2px}
  .footer{margin-top:20px;font-size:8px;color:#94a3b8;text-align:center}
  @media print{body{padding:0}@page{margin:1.5cm;size:A4}}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>Comprobante de pagos a personal</h1>
    <div class="sub">Registro de pagos y comisiones realizadas</div>
  </div>
  <div style="text-align:right;font-size:10px;color:#64748b">Emitido el ${printDate}</div>
</div>

<div class="meta">
  <div class="meta-item"><strong>Período</strong>${monthLabel}</div>
  <div class="meta-item"><strong>Total de registros</strong>${rows.length}</div>
  ${totalDisbursed > 0 ? `<div class="meta-item"><strong>Total desembolsado</strong><span style="color:#16a34a;font-weight:bold">${money(totalDisbursed)}</span></div>` : ""}
  ${totalPending > 0 ? `<div class="meta-item"><strong>Pendiente de desembolso</strong><span style="color:#d97706;font-weight:bold">${money(totalPending)}</span></div>` : ""}
</div>

${rowsHtml}

<div class="totals">
  ${totalPending > 0 ? `<div class="total-card"><div class="total-label">Pendiente</div><div class="total-value" style="color:#d97706">${money(totalPending)}</div></div>` : ""}
  <div class="total-card">
    <div class="total-label">Total desembolsado</div>
    <div class="total-value" style="color:#16a34a">${money(totalDisbursed)}</div>
  </div>
</div>

<div class="sig-section">
  <div class="sig-title">Conformidad</div>
  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">&nbsp;</div>
      <div class="sig-desc">Responsable de pagos — Firma</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">&nbsp;</div>
      <div class="sig-desc">Gerencia / Administración — Firma</div>
    </div>
  </div>
</div>

<div class="footer">Documento generado automáticamente por el sistema de gestión de clínica dental.</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.focus(); win.print(); }, 350);
    } else {
      alert("El navegador bloqueó la ventana de impresión.\nPermite los popups para este sitio en la barra de direcciones y vuelve a intentarlo.");
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={rows.length === 0}
      title="Imprimir comprobante de pagos"
      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Printer className="h-4 w-4" />
      Imprimir
    </button>
  );
}
