-- ============================================================================
-- 0003_functions_triggers.sql — Lógica de negocio crítica en la DB
-- (integridad financiera y de stock vive aquí, no solo en la app)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_odontograms_updated
  before update on odontograms
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Hash de consentimiento (sin imagen): sha256(texto || paciente || fecha)
-- ----------------------------------------------------------------------------
create or replace function consent_hash(p_text text, p_patient uuid, p_at timestamptz)
returns text language sql immutable as $$
  select encode(digest(p_text || p_patient::text || p_at::text, 'sha256'), 'hex')
$$;

create or replace function fill_consent_hash()
returns trigger language plpgsql as $$
begin
  new.content_hash := consent_hash(new.content_text, new.patient_id, new.signed_at);
  return new;
end;
$$;

create trigger trg_consent_hash
  before insert on informed_consents
  for each row execute function fill_consent_hash();

-- ----------------------------------------------------------------------------
-- Comisión al marcar un tratamiento como 'done'
-- Base = price del item; % = default_commission_pct del procedimiento.
-- ----------------------------------------------------------------------------
create or replace function generate_commission_on_done()
returns trigger language plpgsql as $$
declare
  v_pct numeric(5,2);
begin
  if new.status = 'done' and (old.status is distinct from 'done') and new.dentist_id is not null then
    select default_commission_pct into v_pct
    from procedure_catalog where id = new.procedure_id;

    insert into commissions (clinic_id, dentist_id, treatment_item_id, base_amount, percentage, amount)
    values (
      new.clinic_id, new.dentist_id, new.id,
      new.price, coalesce(v_pct, 0),
      round(new.price * coalesce(v_pct, 0) / 100.0, 2)
    )
    on conflict (treatment_item_id) do nothing;

    if new.done_at is null then
      new.done_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_commission_on_done
  before update on treatment_items
  for each row execute function generate_commission_on_done();

-- ----------------------------------------------------------------------------
-- Stock: cada movimiento ajusta current_stock (y el lote si aplica)
-- in: +qty | out: -qty | adjust: qty es el delta (puede ser negativo)
-- ----------------------------------------------------------------------------
create or replace function apply_inventory_movement()
returns trigger language plpgsql as $$
declare
  v_delta numeric(12,2);
begin
  v_delta := case new.type
    when 'in'  then new.quantity
    when 'out' then -new.quantity
    else new.quantity                  -- adjust
  end;

  update inventory_items
    set current_stock = current_stock + v_delta
  where id = new.item_id;

  if new.batch_id is not null then
    update inventory_batches
      set quantity = quantity + v_delta
    where id = new.batch_id;
  end if;

  return new;
end;
$$;

create trigger trg_inventory_movement
  after insert on inventory_movements
  for each row execute function apply_inventory_movement();

-- ----------------------------------------------------------------------------
-- Estado de cuenta del paciente: balance_after acumulado
-- debit aumenta lo que debe; credit (pago / saldo a favor) lo reduce.
-- ----------------------------------------------------------------------------
create or replace function compute_ledger_balance()
returns trigger language plpgsql as $$
declare
  v_prev numeric(12,2);
begin
  select balance_after into v_prev
  from account_movements
  where patient_id = new.patient_id
  order by created_at desc, id desc
  limit 1;

  v_prev := coalesce(v_prev, 0);
  new.balance_after := v_prev + case new.kind
    when 'debit'  then new.amount
    when 'credit' then -new.amount
  end;
  return new;
end;
$$;

create trigger trg_ledger_balance
  before insert on account_movements
  for each row execute function compute_ledger_balance();

-- Un pago genera automáticamente un movimiento de crédito en la cuenta del paciente.
create or replace function payment_to_ledger()
returns trigger language plpgsql as $$
begin
  insert into account_movements (clinic_id, patient_id, kind, amount, ref_type, ref_id)
  values (new.clinic_id, new.patient_id, 'credit', new.amount, 'payment', new.id);
  return new;
end;
$$;

create trigger trg_payment_ledger
  after insert on payments
  for each row execute function payment_to_ledger();

-- Una factura emitida genera el débito (cuenta por cobrar) del paciente.
create or replace function invoice_to_ledger()
returns trigger language plpgsql as $$
begin
  if new.status = 'issued' and (old.status is distinct from 'issued') then
    insert into account_movements (clinic_id, patient_id, kind, amount, ref_type, ref_id)
    values (new.clinic_id, new.patient_id, 'debit', new.total, 'invoice', new.id);
  end if;
  return new;
end;
$$;

create trigger trg_invoice_ledger
  after update on invoices
  for each row execute function invoice_to_ledger();
