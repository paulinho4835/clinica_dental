// Chequeo estático (sin DB) de que toda tabla nueva tenga RLS habilitado.
//
// Por qué estático: la CI de este proyecto deliberadamente no toca ninguna
// base de datos (ver comentario en .github/workflows/ci.yml), así que un
// chequeo vía `pg_tables` no es una opción sin agregar infra nueva. En vez de
// eso, se parsean los archivos de `supabase/migrations/`.
//
// Regla: `0001_schema.sql` + `0002_rls.sql` son la base fundacional — 0002
// habilita RLS automáticamente (loop dinámico PL/pgSQL) para TODA tabla que
// ya existía en ese momento y tenga columna `clinic_id`, más un puñado de
// tablas sin `clinic_id` habilitadas explícitamente ahí mismo. Ese loop corre
// UNA sola vez, en ese momento — nunca vuelve a ejecutarse. Por eso toda
// migración 0003+ que crea una tabla DEBE traer su propio
// `alter table ... enable row level security` explícito; si no lo trae, la
// tabla queda sin RLS y cualquier query con la service-role key (40+ archivos
// la usan) o un bug de scoping en el cliente normal puede filtrar datos entre
// clínicas.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const GRANDFATHERED_MAX = 2; // 0001 + 0002 cubiertas por el loop dinámico

const CREATE_TABLE = /create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
const DROP_TABLE = /drop\s+table\s+(if\s+exists\s+)?(public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
const ENABLE_RLS = /alter\s+table\s+(if\s+exists\s+)?(public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+enable\s+row\s+level\s+security/gi;

function allMatches(regex, text, group) {
  const out = [];
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text))) out.push(m[group].toLowerCase());
  return out;
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const created = new Map(); // tabla -> primer archivo que la crea
const dropped = new Set();
const enabled = new Set();

for (const file of files) {
  const num = parseInt(file.slice(0, 4), 10);
  const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

  if (num > GRANDFATHERED_MAX) {
    for (const t of allMatches(CREATE_TABLE, text, 3)) {
      if (!created.has(t)) created.set(t, file);
    }
  }
  for (const t of allMatches(DROP_TABLE, text, 3)) dropped.add(t);
  for (const t of allMatches(ENABLE_RLS, text, 3)) enabled.add(t);
}

const missing = [...created.entries()].filter(
  ([table]) => !dropped.has(table) && !enabled.has(table),
);

if (missing.length > 0) {
  console.error("RLS check FALLÓ — tablas creadas sin `enable row level security`:\n");
  for (const [table, file] of missing) {
    console.error(`  - ${table}  (creada en ${file})`);
  }
  console.error(
    "\nAgrega `alter table <tabla> enable row level security;` + sus policies " +
      "en la misma migración (ver supabase/migrations/0002_rls.sql como plantilla).",
  );
  process.exit(1);
}

console.log(`RLS check OK — ${created.size} tabla(s) creada(s) después de 0002, todas con RLS.`);
