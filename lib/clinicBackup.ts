// Lógica de remapeo para restaurar un backup de clínica como una clínica NUEVA
// (clon). El backup y el esquema vienen de las funciones SQL backup_clinic() y
// clinic_backup_schema(). Aquí se generan ids nuevos, se reescriben las FKs y se
// ordenan las tablas topológicamente para el insert atómico (restore_clinic_apply).
// Diseño: docs/superpowers/specs/2026-06-16-backup-restore-clinicas-design.md

import { randomUUID } from "crypto";

export type BackupColumn = { name: string; generated: boolean; not_null: boolean };
export type BackupFk = { column: string; parent: string };
export type BackupTableMeta = { columns: BackupColumn[]; fks: BackupFk[] };
export type BackupSchema = { tables: Record<string, BackupTableMeta> };

type Row = Record<string, unknown>;

export type BackupFile = {
  version: number;
  generated_at: string;
  source_clinic_id: string;
  clinic: Row;
  tables: Record<string, Row[]>;
};

export type RestoreViolation = { table: string; column: string; count: number };

export type RestorePayload = {
  newClinic: Row;
  ordered: { table: string; rows: Row[] }[];
};

export type RestoreResult =
  | { ok: true; payload: RestorePayload; newName: string }
  | { ok: false; violations: RestoreViolation[] };

// Recolecta todos los ids de profiles referenciados por el backup, para luego
// consultar cuáles siguen existiendo (las cuentas se reusan, no se recrean).
export function collectProfileIds(
  backup: BackupFile,
  schema: BackupSchema,
): Set<string> {
  const ids = new Set<string>();
  for (const [table, meta] of Object.entries(schema.tables)) {
    const profileCols = meta.fks
      .filter((fk) => fk.parent === "profiles")
      .map((fk) => fk.column);
    if (profileCols.length === 0) continue;
    for (const row of backup.tables[table] ?? []) {
      for (const col of profileCols) {
        const v = row[col];
        if (typeof v === "string") ids.add(v);
      }
    }
  }
  return ids;
}

// Orden topológico de tablas (Kahn): cada tabla se inserta después de las tablas
// padre que referencia. El grafo es un DAG (sin ciclos ni auto-referencias).
function topoSort(tables: string[], schema: BackupSchema): string[] {
  const inSet = new Set(tables);
  const deps = new Map<string, Set<string>>();
  for (const t of tables) deps.set(t, new Set());
  for (const t of tables) {
    for (const fk of schema.tables[t]?.fks ?? []) {
      if (fk.parent !== t && inSet.has(fk.parent)) deps.get(t)!.add(fk.parent);
    }
  }

  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < tables.length) {
    let progressed = false;
    for (const t of tables) {
      if (done.has(t)) continue;
      if ([...deps.get(t)!].every((d) => done.has(d))) {
        order.push(t);
        done.add(t);
        progressed = true;
      }
    }
    // Salvaguarda ante un ciclo inesperado: vacía el resto en orden original.
    if (!progressed) {
      for (const t of tables) if (!done.has(t)) order.push(t);
      break;
    }
  }
  return order;
}

// Construye el payload remapeado para restore_clinic_apply, o devuelve las
// violaciones del caso borde (FK NOT NULL a una cuenta inexistente).
export function buildRestorePayload(
  backup: BackupFile,
  schema: BackupSchema,
  liveProfileIds: Set<string>,
  now: Date = new Date(),
): RestoreResult {
  // Tablas a restaurar = presentes en el backup Y en el esquema actual.
  const tables = Object.keys(backup.tables).filter(
    (t) => schema.tables[t] && (backup.tables[t]?.length ?? 0) > 0,
  );

  // Mapa de ids viejo→nuevo por tabla.
  const idMap = new Map<string, Map<string, string>>();
  for (const t of tables) {
    const m = new Map<string, string>();
    for (const row of backup.tables[t]) {
      const oldId = row.id;
      if (typeof oldId === "string") m.set(oldId, randomUUID());
    }
    idMap.set(t, m);
  }

  const newClinicId = randomUUID();
  const dateStr = now.toLocaleDateString("es-BO", { timeZone: "America/La_Paz" });
  const newName = `${String(backup.clinic.name ?? "Clínica")} (restaurada ${dateStr})`;
  const newClinic: Row = {
    ...backup.clinic,
    id: newClinicId,
    name: newName,
    created_at: now.toISOString(),
  };

  const violations: RestoreViolation[] = [];
  const out: { table: string; rows: Row[] }[] = [];

  for (const t of tables) {
    const meta = schema.tables[t];
    const generated = new Set(
      meta.columns.filter((c) => c.generated).map((c) => c.name),
    );
    const notNull = new Set(
      meta.columns.filter((c) => c.not_null).map((c) => c.name),
    );
    // Mapa columna→tabla padre (para reescribir FKs).
    const fkByCol = new Map<string, string>();
    for (const fk of meta.fks) fkByCol.set(fk.column, fk.parent);

    let nullViolations = 0;
    const rows: Row[] = [];

    for (const row of backup.tables[t]) {
      const next: Row = {};
      for (const [col, val] of Object.entries(row)) {
        if (generated.has(col)) continue; // no se insertan columnas generadas

        if (col === "id") {
          next.id = idMap.get(t)!.get(String(val));
          continue;
        }

        const parent = fkByCol.get(col);
        if (!parent || val === null || val === undefined) {
          next[col] = val ?? null;
          continue;
        }

        if (parent === "clinics") {
          next[col] = newClinicId;
        } else if (parent === "profiles") {
          // Reusar cuenta existente; si ya no existe, queda en null.
          next[col] = liveProfileIds.has(String(val)) ? val : null;
        } else if (idMap.has(parent)) {
          // FK a otra tabla clonada → id nuevo (o null si la fila padre no estaba).
          next[col] = idMap.get(parent)!.get(String(val)) ?? null;
        } else {
          next[col] = val; // padre fuera del set clonado (no debería ocurrir)
        }

        if (next[col] === null && notNull.has(col)) nullViolations++;
      }
      // clinic_id siempre apunta al clon, aunque no estuviera en las FKs leídas.
      next.clinic_id = newClinicId;
      rows.push(next);
    }

    if (nullViolations > 0) {
      // Agrupa por la primera columna NOT NULL a profiles que falló (informativo).
      const offending = meta.fks.find(
        (fk) => fk.parent === "profiles" && notNull.has(fk.column),
      );
      violations.push({
        table: t,
        column: offending?.column ?? "(desconocida)",
        count: nullViolations,
      });
    }

    out.push({ table: t, rows });
  }

  if (violations.length > 0) return { ok: false, violations };

  // Reordena `out` según el orden topológico.
  const order = topoSort(tables, schema);
  const byTable = new Map(out.map((e) => [e.table, e]));
  const ordered = order
    .map((t) => byTable.get(t))
    .filter((e): e is { table: string; rows: Row[] } => !!e);

  return { ok: true, payload: { newClinic, ordered }, newName };
}
