"use client";

import { Download } from "lucide-react";

export type CsvWorkRow = {
  fecha: string;
  paciente: string;
  doctor: string;
  cobrado_por: string;
  trabajo: string;
  lab_trabajo: string;
  costo: number;
  lab_costo: number;
  comision_pct: number;
  comision_bs: number;
  cobrado: number;
  metodo: string;
  comision_pagada: string;
  notas: string;
};

const HEADERS = [
  "Fecha",
  "Paciente",
  "Doctor",
  "Cobrado por",
  "Trabajo",
  "Lab trabajo",
  "Costo (Bs)",
  "Lab costo (Bs)",
  "Comisión (%)",
  "Comisión (Bs)",
  "Cobrado (Bs)",
  "Método",
  "Comisión pagada",
  "Notas",
];

function cell(v: string | number) {
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function ExportCsvButton({
  rows,
  filename,
}: {
  rows: CsvWorkRow[];
  filename: string;
}) {
  function handleExport() {
    const lines = [
      HEADERS.join(","),
      ...rows.map((r) =>
        [
          r.fecha,
          r.paciente,
          r.doctor,
          r.cobrado_por,
          r.trabajo,
          r.lab_trabajo,
          r.costo,
          r.lab_costo,
          r.comision_pct,
          r.comision_bs,
          r.cobrado,
          r.metodo,
          r.comision_pagada,
          r.notas,
        ]
          .map(cell)
          .join(","),
      ),
    ];

    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0}
      title="Exportar a CSV"
      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Download className="h-4 w-4" />
      CSV
    </button>
  );
}
