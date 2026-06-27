import "server-only";
import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ============================================================================
// Cliente de Cloudflare R2 (compatible con la API S3). El binario de las fotos
// vive aquí; la base solo guarda la referencia (storage_key). R2 no cobra egress,
// por eso conviene frente a Supabase Storage para imágenes que se ven seguido.
// ============================================================================

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";

export const R2_BUCKET = process.env.R2_BUCKET ?? "";

// true solo si las 4 variables están configuradas. Las rutas/acciones lo usan
// para fallar limpio ("almacenamiento no configurado") en vez de explotar.
export function isR2Configured(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && R2_BUCKET);
}

// Cliente perezoso: se crea una sola vez, y solo si hay credenciales.
let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

// URL firmada para que el navegador SUBA directo a R2 (sin pasar el binario por
// el servidor/Vercel). Expira pronto: es de un solo uso para esa subida.
export async function presignUpload(
  key: string,
  contentType: string,
  expiresInSeconds = 120,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
}

// URL firmada para VER una foto (bucket privado → no hay URL pública). Expira en
// minutos; se genera al renderizar la galería.
export async function presignDownload(
  key: string,
  expiresInSeconds = 600,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

// Lista todos los objetos del bucket (key + fecha de modificación), paginando.
// Lo usa el cron de limpieza para detectar huérfanos (objetos sin fila en la DB).
export async function listAllObjects(): Promise<
  { key: string; lastModified: Date | null }[]
> {
  const out: { key: string; lastModified: Date | null }[] = [];
  let token: string | undefined;
  do {
    const r = await client().send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: token }),
    );
    for (const o of r.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, lastModified: o.LastModified ?? null });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

// Tamaño real (bytes) del objeto en R2, o null si no existe / falla. Se usa para
// validar el peso REAL subido (la URL firmada de PUT no limita tamaño; un cliente
// malicioso podría subir un archivo gigante saltándose la compresión del front).
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const r = await client().send(
      new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    );
    return r.ContentLength ?? null;
  } catch {
    return null;
  }
}
