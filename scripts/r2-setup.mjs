// Configura el bucket de R2 para subida directa desde el navegador:
//   1) crea el bucket si no existe (idempotente)
//   2) aplica la política de CORS (sin esto, el PUT del navegador falla)
//
// Uso:
//   npm run r2:setup
// Lee las credenciales de .env.local (vía node --env-file). Orígenes CORS:
//   R2_CORS_ORIGINS="http://localhost:3000,https://tu-dominio.com"
// (por defecto solo http://localhost:3000).

import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_CORS_ORIGINS,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error(
    "✗ Faltan variables. Define R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
      "R2_SECRET_ACCESS_KEY y R2_BUCKET en .env.local",
  );
  process.exit(1);
}

const origins = (R2_CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function ensureBucket() {
  try {
    await client.send(new CreateBucketCommand({ Bucket: R2_BUCKET }));
    console.log(`✓ Bucket "${R2_BUCKET}" creado.`);
  } catch (e) {
    const code = e?.name ?? "";
    if (code === "BucketAlreadyOwnedByYou" || code === "BucketAlreadyExists") {
      console.log(`• Bucket "${R2_BUCKET}" ya existe.`);
    } else {
      throw e;
    }
  }
}

async function applyCors() {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: R2_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["PUT", "GET"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`✓ CORS aplicado. Orígenes permitidos: ${origins.join(", ")}`);
}

try {
  await ensureBucket();
  await applyCors();
  console.log("\n✅ R2 listo para subir fotos.");
} catch (e) {
  console.error("\n✗ Error configurando R2:", e?.message ?? e);
  process.exit(1);
}
