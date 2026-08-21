-- Operaciones frecuentes ejecutadas directamente desde el navegador contra
-- Supabase. Cada RPC valida usuario, clinica, rol e idempotencia antes de escribir.
CREATE TABLE IF NOT EXISTS public.clinic_operation_idempotency (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  key text NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL,
  response_body jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, key)
);

ALTER TABLE public.clinic_operation_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_operation_idempotency FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_patient_atomic(
  p_input jsonb,
  p_idempotency_key text,
  p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_clinic uuid := public.auth_clinic_id();
  v_profile record;
  v_existing public.clinic_operation_idempotency%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_response jsonb;
  v_full_name text := nullif(trim(p_input->>'full_name'), '');
  v_email text := nullif(trim(p_input->>'email'), '');
  v_allergies text[];
  v_alerts text[];
BEGIN
  IF v_actor IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'operation_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.role, p.active AS profile_active, c.active AS clinic_active
    INTO v_profile
    FROM public.profiles p
    JOIN public.clinics c ON c.id = p.clinic_id
   WHERE p.id = v_actor AND p.clinic_id = v_clinic;
  IF NOT FOUND OR NOT coalesce(v_profile.profile_active, false)
     OR NOT coalesce(v_profile.clinic_active, false)
     OR v_profile.role NOT IN ('admin', 'recepcionista', 'colega', 'odontologo_general', 'especialista') THEN
    RAISE EXCEPTION 'operation_forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_input) <> 'object'
     OR v_full_name IS NULL OR char_length(v_full_name) > 200
     OR char_length(coalesce(p_input->>'national_id', '')) > 80
     OR char_length(coalesce(p_input->>'phone', '')) > 80
     OR char_length(coalesce(p_input->>'sex', '')) > 40
     OR char_length(coalesce(p_input->>'address', '')) > 500
     OR (v_email IS NOT NULL AND (char_length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'))
     OR jsonb_typeof(coalesce(p_input->'allergies', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(p_input->'medical_alerts', '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_input->'allergies', '[]'::jsonb)) > 50
     OR jsonb_array_length(coalesce(p_input->'medical_alerts', '[]'::jsonb)) > 50 THEN
    RAISE EXCEPTION 'patient_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0
     OR char_length(p_idempotency_key) > 120 OR p_request_hash IS NULL
     OR char_length(p_request_hash) = 0 THEN
    RAISE EXCEPTION 'idempotency_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_clinic::text || ':' || p_idempotency_key));
  SELECT * INTO v_existing
    FROM public.clinic_operation_idempotency
   WHERE clinic_id = v_clinic AND key = p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM p_request_hash OR v_existing.operation <> 'create_patient' THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.response_body;
  END IF;

  SELECT coalesce(array_agg(trim(value)) FILTER (WHERE trim(value) <> ''), ARRAY[]::text[])
    INTO v_allergies
    FROM jsonb_array_elements_text(coalesce(p_input->'allergies', '[]'::jsonb));
  SELECT coalesce(array_agg(trim(value)) FILTER (WHERE trim(value) <> ''), ARRAY[]::text[])
    INTO v_alerts
    FROM jsonb_array_elements_text(coalesce(p_input->'medical_alerts', '[]'::jsonb));

  BEGIN
    INSERT INTO public.patients (
      clinic_id, full_name, national_id, dob, sex, phone, email, address,
      allergies, medical_alerts
    ) VALUES (
      v_clinic, v_full_name, nullif(trim(p_input->>'national_id'), ''),
      nullif(p_input->>'dob', '')::date, nullif(trim(p_input->>'sex'), ''),
      nullif(trim(p_input->>'phone'), ''), v_email,
      nullif(trim(p_input->>'address'), ''), v_allergies, v_alerts
    ) RETURNING * INTO v_patient;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'patient_invalid' USING ERRCODE = '22023';
  END;

  v_response := jsonb_build_object('patientId', v_patient.id);
  INSERT INTO public.clinic_operation_idempotency (
    clinic_id, key, operation, request_hash, response_body, created_by
  ) VALUES (
    v_clinic, p_idempotency_key, 'create_patient', p_request_hash, v_response, v_actor
  );
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_patient_payment_atomic(
  p_patient_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_received_at timestamptz,
  p_doctor_id uuid,
  p_commission_pct numeric,
  p_note text,
  p_collected_by_id uuid,
  p_treatment_item_id uuid,
  p_idempotency_key text,
  p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_clinic uuid := public.auth_clinic_id();
  v_profile record;
  v_existing public.clinic_operation_idempotency%ROWTYPE;
  v_payment_id uuid;
  v_response jsonb;
BEGIN
  IF v_actor IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'operation_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT p.role, p.active AS profile_active, c.active AS clinic_active
    INTO v_profile
    FROM public.profiles p
    JOIN public.clinics c ON c.id = p.clinic_id
   WHERE p.id = v_actor AND p.clinic_id = v_clinic;
  IF NOT FOUND OR NOT coalesce(v_profile.profile_active, false)
     OR NOT coalesce(v_profile.clinic_active, false)
     OR v_profile.role NOT IN ('admin', 'recepcionista', 'colega') THEN
    RAISE EXCEPTION 'operation_forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000
     OR p_received_at IS NULL OR p_commission_pct IS NULL
     OR p_commission_pct < 0 OR p_commission_pct > 100
     OR char_length(coalesce(p_note, '')) > 120
     OR p_treatment_item_id IS NULL THEN
    RAISE EXCEPTION 'payment_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0
     OR char_length(p_idempotency_key) > 120 OR p_request_hash IS NULL
     OR char_length(p_request_hash) = 0 THEN
    RAISE EXCEPTION 'idempotency_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_clinic::text || ':' || p_idempotency_key));
  SELECT * INTO v_existing
    FROM public.clinic_operation_idempotency
   WHERE clinic_id = v_clinic AND key = p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash IS DISTINCT FROM p_request_hash OR v_existing.operation <> 'create_patient_payment' THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.response_body;
  END IF;

  PERFORM 1 FROM public.patients
   WHERE id = p_patient_id AND clinic_id = v_clinic
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
    FROM public.treatment_items ti
    JOIN public.treatment_phases ph ON ph.id = ti.phase_id
    JOIN public.treatment_plans pl ON pl.id = ph.plan_id
   WHERE ti.id = p_treatment_item_id
     AND ti.clinic_id = v_clinic
     AND ph.clinic_id = v_clinic
     AND pl.clinic_id = v_clinic
     AND pl.patient_id = p_patient_id
   FOR UPDATE OF ti;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'treatment_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_doctor_id IS NOT NULL THEN
    PERFORM 1 FROM public.profiles
     WHERE id = p_doctor_id AND clinic_id = v_clinic AND active
       AND role IN ('colega', 'odontologo_general', 'especialista')
     FOR UPDATE;
    IF NOT FOUND OR (v_profile.role = 'colega' AND p_doctor_id <> v_actor) THEN
      RAISE EXCEPTION 'doctor_invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_profile.role = 'recepcionista' AND p_collected_by_id IS NULL THEN
    RAISE EXCEPTION 'collector_required' USING ERRCODE = '22023';
  END IF;
  IF p_collected_by_id IS NOT NULL THEN
    PERFORM 1 FROM public.clinic_receptionists
     WHERE id = p_collected_by_id AND clinic_id = v_clinic AND active
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'collector_invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_payment_id := public.create_payment_with_work(
    v_clinic, p_patient_id, p_amount, p_method, 'payment', p_received_at,
    p_doctor_id, p_commission_pct, nullif(trim(p_note), ''),
    p_collected_by_id, p_treatment_item_id
  );

  v_response := jsonb_build_object('paymentId', v_payment_id);
  INSERT INTO public.clinic_operation_idempotency (
    clinic_id, key, operation, request_hash, response_body, created_by
  ) VALUES (
    v_clinic, p_idempotency_key, 'create_patient_payment', p_request_hash, v_response, v_actor
  );
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_atomic(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_atomic(jsonb, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_patient_payment_atomic(uuid, numeric, public.payment_method, timestamptz, uuid, numeric, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_payment_atomic(uuid, numeric, public.payment_method, timestamptz, uuid, numeric, text, uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_patient_financial_summary(
  p_patient_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.auth_clinic_id();
  v_items jsonb;
  v_total_worked numeric := 0;
  v_total_paid numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'operation_forbidden' USING ERRCODE = '42501';
  END IF;

  -- Esta lectura conserva RLS: un doctor solo puede consultar pacientes visibles
  -- para su cuenta, mientras admin y recepcion mantienen el alcance de clinica.
  PERFORM 1 FROM public.patients
   WHERE id = p_patient_id AND clinic_id = v_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operation_forbidden' USING ERRCODE = '42501';
  END IF;

  WITH item_rows AS (
    SELECT ti.id,
           coalesce(pc.name, ti.custom_name, '—') AS name,
           ti.price,
           ti.doctor_id,
           dp.full_name AS doctor_name,
           coalesce(pc.default_commission_pct, 0) AS default_commission_pct,
           coalesce((
             SELECT sum(pay.amount)
               FROM public.payments pay
              WHERE pay.clinic_id = v_clinic
                AND pay.patient_id = p_patient_id
                AND pay.treatment_item_id = ti.id
           ), 0) AS paid_amount,
           coalesce((
             SELECT max(dw.lab_cost)
               FROM public.doctor_works dw
              WHERE dw.clinic_id = v_clinic
                AND dw.patient_id = p_patient_id
                AND dw.treatment_item_id = ti.id
                AND dw.lab_cost > 0
           ), 0) AS lab_cost
      FROM public.treatment_plans tp
      JOIN public.treatment_phases ph ON ph.plan_id = tp.id AND ph.clinic_id = v_clinic
      JOIN public.treatment_items ti ON ti.phase_id = ph.id AND ti.clinic_id = v_clinic
      LEFT JOIN public.procedure_catalog pc ON pc.id = ti.procedure_id
      LEFT JOIN public.profiles dp ON dp.id = ti.doctor_id AND dp.clinic_id = v_clinic
     WHERE tp.clinic_id = v_clinic
       AND tp.patient_id = p_patient_id
       AND ti.status <> 'cancelled'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'name', name,
           'price', price,
           'paidAmount', paid_amount,
           'labCost', lab_cost,
           'doctorId', doctor_id,
           'doctorName', doctor_name,
           'defaultCommissionPct', default_commission_pct
         )), '[]'::jsonb),
         coalesce(sum(price), 0)
    INTO v_items, v_total_worked
    FROM item_rows;

  SELECT coalesce(sum(amount), 0)
    INTO v_total_paid
    FROM public.payments
   WHERE clinic_id = v_clinic AND patient_id = p_patient_id;

  RETURN jsonb_build_object(
    'items', v_items,
    'totalWorked', v_total_worked,
    'totalPaid', v_total_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_patient_financial_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_financial_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
