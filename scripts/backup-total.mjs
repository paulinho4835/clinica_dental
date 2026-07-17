#!/usr/bin/env node
// ============================================================================
// Backup TOTAL de la plataforma (todas las clínicas), pensado para migración.
// Exporta a una carpeta local:
//   db/<tabla>.json   — TODAS las tablas de public (incluye profiles, clinics,
//                       platform_admins y tablas globales que el backup por
//                       clínica no cubre), paginadas con service-role key.
//   auth/users.json   — usuarios de auth (email, metadata; SIN hash de password:
//                       la API no lo expone. Para hashes usar pg_dump).
//   r2/<key>          — todos los objetos del bucket R2 (fotos, logos, respaldos
//                       semanales por clínica).
//   manifest.json     — resumen con conteos y errores.
//
// Uso:
//   node scripts/backup-total.mjs --env .env.backup --out "C:/dev/backup-clinicas"
//   node scripts/backup-total.mjs --solo r2 --env .env.local --out ...
//   node scripts/backup-total.mjs --solo tablas,auth ...
//
// El archivo --env debe tener: NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL),
// SUPABASE_SERVICE_ROLE_KEY, y para R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET.
// Seguridad: se niega a exportar la DB si la URL apunta a localhost, salvo
// --permitir-local (el objetivo es respaldar PRODUCCIÓN, no la DB de pruebas).
// ============================================================================

import { readFileSync, mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "node:stream/promises";

// ── Tablas de public (fuente: supabase/migrations). Actualizar al agregar tablas.
const TABLES = [
  "account_movements", "agent_info_entries", "anamnesis_invitations",
  "appointment_reminders", "appointments", "audit_archive_runs", "audit_log",
  "backup_runs", "budgets", "campaign_sends", "campaigns", "cash_sessions",
  "clinic_receptionists", "clinics", "commissions", "consent_templates",
  "consents", "dental_condition_catalog", "dentist_schedules",
  "doctor_availability", "doctor_works", "doctors", "expenses",
  "informed_consents", "inventory_batches", "inventory_items",
  "inventory_movements", "invoice_items", "invoices", "odontogram_events",
  "odontogram_pediatric_events", "odontograms", "odontograms_pediatric",
  "operatories", "patient_evolution_note_history", "patient_evolution_notes",
  "patient_history", "patient_history_items", "patient_photos", "patients",
  "payments", "perio_exams", "platform_admins", "prescriptions",
  "procedure_catalog", "profiles", "staff_payment_works", "staff_payments",
  "treatment_items", "treatment_phases", "treatment_plans", "wa_conversations",
  "work_feedback",
];

const PAGE = 1000;

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const envFile = argVal("--env") ?? ".env.local";
const outRoot = argVal("--out") ?? "C:/dev/backup-clinicas";
const solo = (argVal("--solo") ?? "tablas,auth,r2").split(",").map((s) => s.trim());
const permitirLocal = args.includes("--permitir-local");

// ── Env: mismo saneo que lib/r2.ts (BOM, zero-width, comillas) ──────────────
function cleanVal(v) {
  return (v ?? "")
    .split("")
    .filter((c) => c.charCodeAt(0) !== 0xfeff && c.charCodeAt(0) !== 0x200b)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");
}
const env = { ...process.env };
try {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = cleanVal(m[2]);
  }
  console.log(`Env cargado de ${envFile}`);
} catch {
  console.log(`(No se pudo leer ${envFile}; uso solo variables de entorno)`);
}

const SUPA_URL = cleanVal(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
const SERVICE_KEY = cleanVal(env.SUPABASE_SERVICE_ROLE_KEY);

const stamp = new Date().toISOString().slice(0, 10);
const outDir = join(outRoot, stamp);
mkdirSync(outDir, { recursive: true });

const manifest = {
  generated_at: new Date().toISOString(),
  supabase_url: SUPA_URL || null,
  partes: solo,
  tablas: {},
  auth_users: null,
  r2: null,
  errores: [],
};

// ── 1) Tablas ───────────────────────────────────────────────────────────────
async function backupTables() {
  if (!SUPA_URL || !SERVICE_KEY) {
    manifest.errores.push("tablas: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    console.error("SALTADO tablas: faltan credenciales de Supabase");
    return;
  }
  if (/127\.0\.0\.1|localhost/.test(SUPA_URL) && !permitirLocal) {
    manifest.errores.push("tablas: la URL apunta a localhost (usa --permitir-local si es a propósito)");
    console.error("SALTADO tablas: la URL es localhost — esto respaldaría la DB de PRUEBAS, no producción.");
    return;
  }
  const supa = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });
  mkdirSync(join(outDir, "db"), { recursive: true });

  for (const table of TABLES) {
    try {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supa
          .from(table)
          .select("*")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      writeFileSync(join(outDir, "db", `${table}.json`), JSON.stringify(rows, null, 1));
      manifest.tablas[table] = rows.length;
      console.log(`db/${table}.json — ${rows.length} filas`);
    } catch (e) {
      manifest.errores.push(`tabla ${table}: ${e.message}`);
      console.error(`ERROR tabla ${table}: ${e.message}`);
    }
  }
}

// ── 2) Usuarios de auth ─────────────────────────────────────────────────────
async function backupAuthUsers() {
  if (!SUPA_URL || !SERVICE_KEY) {
    manifest.errores.push("auth: faltan credenciales de Supabase");
    return;
  }
  if (/127\.0\.0\.1|localhost/.test(SUPA_URL) && !permitirLocal) {
    manifest.errores.push("auth: la URL apunta a localhost");
    return;
  }
  const supa = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const users = [];
    for (let page = 1; ; page++) {
      const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }
    mkdirSync(join(outDir, "auth"), { recursive: true });
    writeFileSync(join(outDir, "auth", "users.json"), JSON.stringify(users, null, 1));
    manifest.auth_users = users.length;
    console.log(`auth/users.json — ${users.length} usuarios (sin hashes de password; para hashes usar pg_dump)`);
  } catch (e) {
    manifest.errores.push(`auth: ${e.message}`);
    console.error(`ERROR auth: ${e.message}`);
  }
}

// ── 3) R2 completo ──────────────────────────────────────────────────────────
async function backupR2() {
  const acct = cleanVal(env.R2_ACCOUNT_ID);
  const key = cleanVal(env.R2_ACCESS_KEY_ID);
  const secret = cleanVal(env.R2_SECRET_ACCESS_KEY);
  const bucket = cleanVal(env.R2_BUCKET);
  if (!acct || !key || !secret || !bucket) {
    manifest.errores.push("r2: faltan credenciales R2_*");
    console.error("SALTADO r2: faltan credenciales R2_*");
    return;
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${acct}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });

  let count = 0;
  let bytes = 0;
  let token = undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) {
      const dest = join(outDir, "r2", obj.Key.replace(/[:*?"<>|]/g, "_"));
      mkdirSync(dirname(dest), { recursive: true });
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
      await pipeline(res.Body, createWriteStream(dest));
      count++;
      bytes += obj.Size ?? 0;
      if (count % 50 === 0) console.log(`r2: ${count} objetos (${(bytes / 1e6).toFixed(1)} MB)...`);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  manifest.r2 = { objetos: count, mb: +(bytes / 1e6).toFixed(1) };
  console.log(`r2 — ${count} objetos, ${(bytes / 1e6).toFixed(1)} MB`);
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`Backup total → ${outDir}\n`);
if (solo.includes("tablas")) await backupTables();
if (solo.includes("auth")) await backupAuthUsers();
if (solo.includes("r2")) await backupR2();

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nManifest: ${join(outDir, "manifest.json")}`);
if (manifest.errores.length) {
  console.error(`\nTERMINÓ CON ${manifest.errores.length} ERROR(ES):`);
  for (const e of manifest.errores) console.error(` - ${e}`);
  process.exitCode = 1;
} else {
  console.log("Backup completado sin errores.");
}
