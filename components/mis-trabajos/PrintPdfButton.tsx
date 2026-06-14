"use client";

import { Printer } from "lucide-react";
import type { CsvWorkRow } from "./ExportCsvButton";

function bs(n: number) {
  return `Bs ${n.toFixed(2)}`;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PrintPdfButton({
  rows,
  doctorName,
  from,
  to,
}: {
  rows: CsvWorkRow[];
  doctorName: string;
  from: string;
  to: string;
}) {
  function handlePrint() {
    const totalCost = rows.reduce((s, r) => s + r.costo, 0);
    const totalComm = rows.reduce((s, r) => s + r.comision_bs, 0);
    const totalPaid = rows
      .filter((r) => r.comision_pagada === "Sí")
      .reduce((s, r) => s + r.comision_bs, 0);
    const totalPending = totalComm - totalPaid;

    const printDate = new Date().toLocaleDateString("es-BO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const periodLabel =
      from && to
        ? `${fmtDate(from)} al ${fmtDate(to)}`
        : from
          ? `Desde ${fmtDate(from)}`
          : to
            ? `Hasta ${fmtDate(to)}`
            : "Todos los períodos";

    const rows_html = rows
      .map(
        (r) => `
      <tr>
        <td style="white-space:nowrap;color:#64748b">${fmtDate(r.fecha)}</td>
        <td>${r.paciente || "—"}</td>
        <td>
          ${r.trabajo}
          ${r.lab_trabajo ? `<br><span style="color:#92400e;font-size:9px">Lab: ${r.lab_trabajo}</span>` : ""}
          ${r.notas ? `<br><span style="color:#94a3b8;font-size:9px">${r.notas}</span>` : ""}
        </td>
        <td class="num">${bs(r.costo)}</td>
        <td class="num" style="color:#0e7490;font-weight:600">${bs(r.comision_bs)}<br><span style="font-size:9px;color:#94a3b8">${r.comision_pct}%</span></td>
        <td>
          <span class="${r.comision_pagada === "Sí" ? "badge-paid" : "badge-pend"}">
            ${r.comision_pagada === "Sí" ? "Pagada ✓" : "Pendiente"}
          </span>
        </td>
      </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Constancia de trabajos — ${doctorName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1e293b;padding:28px 36px}
  .header{border-bottom:2px solid #0e7490;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
  .header h1{font-size:17px;font-weight:bold;color:#0e7490}
  .header .sub{font-size:10px;color:#64748b;margin-top:2px}
  .meta{display:flex;justify-content:space-between;margin-bottom:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px}
  .meta-item{font-size:10px;line-height:1.6}
  .meta-item strong{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10px}
  th{background:#f1f5f9;text-align:left;padding:5px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;border-bottom:2px solid #e2e8f0}
  td{padding:5px 7px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .num{text-align:right}
  .badge-paid{background:#dcfce7;color:#166534;border-radius:9999px;padding:2px 7px;font-size:9px;font-weight:700;white-space:nowrap}
  .badge-pend{background:#fef3c7;color:#92400e;border-radius:9999px;padding:2px 7px;font-size:9px;font-weight:700;white-space:nowrap}
  .totals{display:flex;justify-content:flex-end;gap:20px;margin-bottom:28px}
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
    <h1>Constancia de trabajos realizados</h1>
    <div class="sub">Documento para firma de conformidad</div>
  </div>
  <div style="text-align:right;font-size:10px;color:#64748b">Emitido el ${printDate}</div>
</div>

<div class="meta">
  <div class="meta-item"><strong>Doctor</strong>${doctorName || "—"}</div>
  <div class="meta-item"><strong>Período</strong>${periodLabel}</div>
  <div class="meta-item"><strong>Total de trabajos</strong>${rows.length}</div>
</div>

<table>
  <thead>
    <tr>
      <th>Fecha</th>
      <th>Paciente</th>
      <th>Trabajo realizado</th>
      <th class="num">Costo</th>
      <th class="num">Comisión</th>
      <th>Estado</th>
    </tr>
  </thead>
  <tbody>${rows_html}</tbody>
</table>

<div class="totals">
  ${
    totalPaid > 0
      ? `<div class="total-card">
           <div class="total-label">Comisiones pagadas</div>
           <div class="total-value" style="color:#16a34a">${bs(totalPaid)}</div>
         </div>`
      : ""
  }
  ${
    totalPending > 0
      ? `<div class="total-card">
           <div class="total-label">Comisiones pendientes</div>
           <div class="total-value" style="color:#d97706">${bs(totalPending)}</div>
         </div>`
      : ""
  }
  <div class="total-card">
    <div class="total-label">Costo total facturado</div>
    <div class="total-value" style="color:#1e293b">${bs(totalCost)}</div>
  </div>
  <div class="total-card">
    <div class="total-label">Comisión total</div>
    <div class="total-value" style="color:#0e7490">${bs(totalComm)}</div>
  </div>
</div>

<div class="sig-section">
  <div class="sig-title">Firmas de conformidad</div>
  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">${doctorName || "Doctor"}</div>
      <div class="sig-desc">Firma y aclaración — Conforme</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-name">&nbsp;</div>
      <div class="sig-desc">Responsable de pagos — Firma</div>
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
      // Llamar print() desde el padre evita que el CSP del popup bloquee inline scripts.
      setTimeout(() => { win.focus(); win.print(); }, 350);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={rows.length === 0}
      title="Imprimir / Guardar como PDF"
      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Printer className="h-4 w-4" />
      Imprimir
    </button>
  );
}
