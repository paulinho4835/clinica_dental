-- Logo de la clínica para documentos impresos (addon "logo").
--
-- Hasta ahora existía `logo_url` (una URL pública que el admin pegaba a mano,
-- bajo el addon "perfil"). Esto agrega la posibilidad de SUBIR un archivo real:
-- el binario vive en Cloudflare R2 (igual que las fotos de pacientes) y aquí solo
-- guardamos la referencia (storage_key). El logo se sirve con URL firmada al
-- renderizar cada documento impreso.
--
-- El addon que enciende el módulo ("logo") vive en clinics.features (jsonb), no
-- requiere columna nueva.

alter table clinics
  add column if not exists logo_storage_key text;
