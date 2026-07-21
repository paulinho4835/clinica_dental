// Validación y saneamiento centralizado de variables de entorno.
//
// Por qué existe: la clase de bug más cara de este proyecto siempre fue la misma
// — env vars que fallaban en silencio. El BOM invisible en R2_BUCKET, y CRON_SECRET
// faltante que dejó los 3 cron jobs devolviendo 401 sin que nadie se enterara.
// Este módulo arranca gritando (claro y temprano) en vez de fallar callado.
//
// Es PURO y agnóstico del framework (no importa Next ni Sentry) para poder moverse
// tal cual al "core" reutilizable. La parte que corta el arranque vive en
// instrumentation.ts.

/**
 * Limpia un valor de entorno: quita BOM y caracteres invisibles de ancho cero
 * (la causa del bug de R2_BUCKET), recorta espacios, y trata "" como ausente.
 */
export function sanitizeEnvValue(v: string | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  // U+FEFF = BOM; U+200B..U+200D = espacios de ancho cero que se cuelan al copiar.
  // Se usan escapes Unicode a propósito: meter el caracter invisible literal en
  // el regex sería justo el tipo de fragilidad que este módulo busca eliminar.
  const cleaned = v.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  return cleaned === "" ? undefined : cleaned;
}

const s = sanitizeEnvValue;

// Lectura EXPLÍCITA variable por variable: es lo que permite a Next inyectar las
// NEXT_PUBLIC_* en el bundle durante el build (un process.env genérico no se
// reemplaza). Acepta una fuente para poder testear sin tocar el entorno real.
export function readEnv(src: Record<string, string | undefined> = process.env) {
  return {
    // Públicas (visibles en el cliente, inyectadas en build).
    NEXT_PUBLIC_SUPABASE_URL: s(src.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: s(src.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_SITE_URL: s(src.NEXT_PUBLIC_SITE_URL),
    NEXT_PUBLIC_VAPI_PUBLIC_KEY: s(src.NEXT_PUBLIC_VAPI_PUBLIC_KEY),
    // Servidor (secretos; nunca llegan al cliente).
    SUPABASE_SERVICE_ROLE_KEY: s(src.SUPABASE_SERVICE_ROLE_KEY),
    CRON_SECRET: s(src.CRON_SECRET),
    R2_ACCOUNT_ID: s(src.R2_ACCOUNT_ID),
    R2_ACCESS_KEY_ID: s(src.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: s(src.R2_SECRET_ACCESS_KEY),
    R2_BUCKET: s(src.R2_BUCKET),
    VAPI_API_KEY: s(src.VAPI_API_KEY),
    VAPI_WEBHOOK_SECRET: s(src.VAPI_WEBHOOK_SECRET),
    VAPI_CLINIC_ID: s(src.VAPI_CLINIC_ID),
    VAPI_PHONE_NUMBER_ID: s(src.VAPI_PHONE_NUMBER_ID),
    VAPI_REMINDER_ASSISTANT_ID: s(src.VAPI_REMINDER_ASSISTANT_ID),
    GOOGLE_CLIENT_ID: s(src.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: s(src.GOOGLE_CLIENT_SECRET),
    WA_SERVICE_URL: s(src.WA_SERVICE_URL),
    WHATSAPP_TOKEN: s(src.WHATSAPP_TOKEN),
    WHATSAPP_PHONE_NUMBER_ID: s(src.WHATSAPP_PHONE_NUMBER_ID),
    WHATSAPP_TEMPLATE: s(src.WHATSAPP_TEMPLATE),
    WHATSAPP_LANG: s(src.WHATSAPP_LANG),
    ZAVU_API_KEY: s(src.ZAVU_API_KEY),
    ZAVU_TEMPLATE_ID: s(src.ZAVU_TEMPLATE_ID),
    UPSTASH_REDIS_REST_URL: s(src.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: s(src.UPSTASH_REDIS_REST_TOKEN),
  };
}

export type Env = ReturnType<typeof readEnv>;

/** Acceso saneado a las variables. Importar solo desde código de servidor. */
export const env = readEnv();

// Sin estas la app no arranca de verdad → error que corta el deploy.
const HARD_REQUIRED: (keyof Env)[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

// Features que se activan por grupo de variables. Tener algunas pero no todas es
// casi siempre un error de configuración (típico al copiar el proyecto a otro).
const FEATURE_GROUPS: Record<string, (keyof Env)[]> = {
  "Cloudflare R2 (fotos/respaldos)": [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ],
  "WhatsApp Cloud API": ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  "Rate limiting (Upstash)": [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ],
  "Google Calendar (sync de citas)": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
};

export interface EnvCheck {
  errors: string[];
  warnings: string[];
}

/**
 * Valida el entorno. PURA: devuelve errores y advertencias, no lanza ni imprime.
 * El que la llama decide qué hacer (instrumentation.ts corta el arranque ante
 * errores y reporta las advertencias).
 */
export function validateEnv(
  src: Record<string, string | undefined> = process.env,
): EnvCheck {
  const e = readEnv(src);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of HARD_REQUIRED) {
    if (!e[key]) errors.push(`Falta la variable obligatoria ${key}.`);
  }

  if (e.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      new URL(e.NEXT_PUBLIC_SUPABASE_URL);
    } catch {
      errors.push(
        `NEXT_PUBLIC_SUPABASE_URL no es una URL válida: "${e.NEXT_PUBLIC_SUPABASE_URL}".`,
      );
    }
  }

  // El bug histórico: sin CRON_SECRET, Vercel no inyecta el bearer y los crons
  // (recordatorios, respaldos, limpieza de fotos) devuelven 401 y nunca corren.
  if (!e.CRON_SECRET) {
    warnings.push(
      "CRON_SECRET no está definida: los cron jobs de Vercel (recordatorios, respaldos, limpieza de fotos) NO se ejecutarán.",
    );
  }

  for (const [name, keys] of Object.entries(FEATURE_GROUPS)) {
    const present = keys.filter((k) => e[k]);
    if (present.length > 0 && present.length < keys.length) {
      const missing = keys.filter((k) => !e[k]);
      warnings.push(
        `Configuración incompleta de ${name}: faltan ${missing.join(", ")}.`,
      );
    }
  }

  return { errors, warnings };
}
