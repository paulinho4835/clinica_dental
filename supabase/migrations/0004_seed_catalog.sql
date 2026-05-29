-- ============================================================================
-- 0004_seed_catalog.sql — Datos de referencia globales (parte del esquema)
-- Catálogo de condiciones dentales que la UI usa para colorear el odontograma.
-- ============================================================================
insert into dental_condition_catalog (code, label, color, scope) values
  ('sano',                'Sano',                  '#ffffff', 'surface'),
  ('caries',              'Caries',                '#ef4444', 'surface'),
  ('resina',              'Resina / Obturación',   '#3b82f6', 'surface'),
  ('amalgama',            'Amalgama',              '#64748b', 'surface'),
  ('sellante',            'Sellante',              '#22c55e', 'surface'),
  ('fractura',            'Fractura',              '#f97316', 'surface'),
  ('corona',              'Corona',                '#eab308', 'whole'),
  ('endodoncia',          'Endodoncia',            '#a855f7', 'whole'),
  ('implante',            'Implante',              '#06b6d4', 'whole'),
  ('ausente',             'Ausente',               '#94a3b8', 'whole'),
  ('extraccion_indicada', 'Extracción indicada',   '#dc2626', 'whole'),
  ('protesis',            'Prótesis',              '#d946ef', 'whole')
on conflict (code) do nothing;
