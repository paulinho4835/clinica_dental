-- Tope de pacientes por clínica (palanca de upsell manual del superadmin,
-- mismo patrón que clinics.max_users). NULL = sin tope: comportamiento
-- actual, sin cambios para ninguna clínica existente. El superadmin lo
-- activa clínica por clínica desde /superadmin cuando quiere usarlo como
-- gancho comercial.
-- Spec: docs/superpowers/specs/2026-07-20-limite-pacientes-plan-design.md
--
-- Nota de numeración: en main el último número es 0090. La migración
-- 0091_shared_practice.sql del feature "consultorio compartido" vive solo
-- en su rama/worktree, todavía sin mergear. Si esa rama se mergea antes que
-- esta, renumerar este archivo a 0092.

alter table clinics
  add column if not exists max_patients integer;

notify pgrst, 'reload schema';
