-- ============================================================================
-- 0014_payment_method_qr.sql
-- La clínica solo cobra en Efectivo o QR. Se agrega 'qr' al enum.
-- 'card'/'transfer' quedan en el tipo (no se pueden borrar valores de enum en
-- Postgres) pero ya no se ofrecen en la UI ni se aceptan en validación.
-- ============================================================================

alter type payment_method add value if not exists 'qr';
