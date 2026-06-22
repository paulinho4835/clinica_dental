-- Agrega el valor 'colega' al enum app_role.
-- IMPORTANTE: PostgreSQL no permite usar un nuevo valor de enum en la misma
-- transacción en que se agrega. Por eso las policies que usan 'colega' van
-- en la migración 0057 (transacción separada).

alter type app_role add value if not exists 'colega';
