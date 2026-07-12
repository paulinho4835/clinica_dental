-- 0083_condition_catalog_extra.sql — nuevas condiciones del odontograma
-- Pedido clínico: marcar "caries recidivante" (caries bajo/junto a una
-- restauración previa) con color propio, más marcas comunes que faltaban.
-- Espejo de CONDITION_* en lib/odontogram/types.ts.

insert into dental_condition_catalog (code, label, color, scope) values
  ('caries_recidivante', 'Caries recidivante',      '#991b1b', 'surface'),
  ('desgaste',           'Desgaste / abrasión',     '#a16207', 'surface'),
  ('perno',              'Perno muñón',             '#6366f1', 'whole'),
  ('movilidad',          'Movilidad',               '#ec4899', 'whole'),
  ('en_erupcion',        'En erupción / incluido',  '#0d9488', 'whole')
on conflict (code) do nothing;

notify pgrst, 'reload schema';
