// Consolida las migraciones SQL en un solo archivo listo para pegar en el
// SQL Editor del dashboard de Supabase (nube), cuando el CLI no tiene acceso
// a ese proyecto.
//
// Uso:
//   node scripts/consolidate-migrations.mjs            -> todas las migraciones
//   node scripts/consolidate-migrations.mjs 0060       -> desde 0060 (incl.) en adelante
//   npm run db:consolidate -- 0060
//
// Tip: para saber DESDE cuál empezar, corre en el dashboard:
//   select version from supabase_migrations.schema_migrations order by version;
// y pasa como argumento la primera que NO aparezca ahí.
//
// La salida va a supabase/_consolidado.sql (ignorado por git). Pégala completa.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");
const OUT = join(__dirname, "..", "supabase", "_consolidado.sql");

const from = process.argv[2]?.trim() ?? null;

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// El prefijo numérico (0060, 0061, …) define el orden y el filtro "desde".
const prefix = (f) => f.match(/^(\d+)/)?.[1] ?? "";

const selected = from
  ? files.filter((f) => prefix(f) >= from)
  : files;

if (selected.length === 0) {
  console.error(`No hay migraciones${from ? ` desde ${from}` : ""}.`);
  process.exit(1);
}

const parts = [
  "-- ====================================================================",
  "-- CONSOLIDADO DE MIGRACIONES — generado por scripts/consolidate-migrations.mjs",
  `-- ${from ? `Desde ${from}` : "Todas"} · ${new Date().toISOString()}`,
  "-- Idempotencia: cada migración usa if-not-exists / drop-if-exists cuando aplica.",
  "-- Pega esto completo en el SQL Editor del dashboard de Supabase (nube).",
  "-- ====================================================================",
  "",
];

for (const f of selected) {
  const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8").trimEnd();
  parts.push(`-- ----- ${f} -----`, sql, "");
}

// Asegurar el reload del esquema de PostgREST al final (evita el error
// "Could not find the 'X' column ... in the schema cache").
parts.push("notify pgrst, 'reload schema';", "");

writeFileSync(OUT, parts.join("\n"), "utf8");

console.log(`✓ ${selected.length} migración(es) consolidadas:`);
for (const f of selected) console.log(`   · ${f}`);
console.log(`\n→ ${OUT}`);
console.log("  Ábrelo, copia todo y pégalo en el SQL Editor del dashboard.");
