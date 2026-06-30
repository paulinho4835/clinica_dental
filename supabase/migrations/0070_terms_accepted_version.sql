-- ----------------------------------------------------------------------------
-- Versión de los Términos aceptada por el administrador de la clínica.
-- Complementa a terms_accepted_at (0069): además de CUÁNDO aceptó, guardamos
-- QUÉ versión aceptó (lib/legal.ts → LEGAL_VERSION).
-- El dashboard compara este valor contra LEGAL_VERSION: si la versión vigente
-- es mayor (los términos cambiaron de fondo), vuelve a mostrar el aviso de
-- aceptación aunque ya hubiera aceptado una versión anterior.
--   null  = nunca aceptó, o aceptó antes de existir el versionado (se re-pide)
--   texto = versión concreta que aceptó (ej. '2026-06-29')
-- Solo aplica al rol 'admin', igual que terms_accepted_at.
-- ----------------------------------------------------------------------------
alter table profiles
  add column if not exists terms_accepted_version text;
