// node scripts/seed-demo.mjs
import { createClient } from '@supabase/supabase-js'

const URL  = 'http://127.0.0.1:54321'
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CLINIC = '11111111-1111-1111-1111-111111111111'
const DOCTOR = 'aaaaaaa1-0000-0000-0000-000000000003'

const sb = createClient(URL, KEY, { auth: { persistSession: false } })

async function run(label, promise) {
  const { error } = await promise
  if (error) console.error(`❌  ${label}:`, error.message)
  else console.log(`✅  ${label}`)
}

// ── Pacientes ─────────────────────────────────────────────────────────────────
const patients = [
  { id: 'd0000000-0000-0000-0000-000000000001', clinic_id: CLINIC, full_name: 'María López Flores',   national_id: '1234567', dob: '1990-04-12', sex: 'F', phone: '591-76541230', allergies: ['penicilina'],          medical_alerts: ['Anticoagulada'],     notes: 'Viene desde 2024. Muy puntual.' },
  { id: 'd0000000-0000-0000-0000-000000000002', clinic_id: CLINIC, full_name: 'Juan Carlos Pérez',    national_id: '8765432', dob: '1985-11-03', sex: 'M', phone: '591-72198765', allergies: [],                      medical_alerts: [],                    notes: null },
  { id: 'd0000000-0000-0000-0000-000000000003', clinic_id: CLINIC, full_name: 'Carlos Mamani Quispe', national_id: '3456789', dob: '1978-07-20', sex: 'M', phone: '591-70334455', allergies: [],                      medical_alerts: ['Diabético Tipo 2'], notes: 'Controlar glucosa antes de extracciones.' },
  { id: 'd0000000-0000-0000-0000-000000000004', clinic_id: CLINIC, full_name: 'Sofía Torrez Condori', national_id: '4567890', dob: '1997-02-14', sex: 'F', phone: '591-71445566', allergies: ['ibuprofeno'],           medical_alerts: [],                    notes: null },
  { id: 'd0000000-0000-0000-0000-000000000005', clinic_id: CLINIC, full_name: 'Roberto Aguilar',      national_id: '5678901', dob: '1972-09-05', sex: 'M', phone: '591-73556677', allergies: [],                      medical_alerts: ['Hipertensión'],     notes: 'Tomar presión antes de cada procedimiento.' },
  { id: 'd0000000-0000-0000-0000-000000000006', clinic_id: CLINIC, full_name: 'Elena Chávez Vela',    national_id: '6789012', dob: '1965-03-28', sex: 'F', phone: '591-75667788', allergies: ['penicilina','aspirina'], medical_alerts: [],                   notes: 'Prefiere citas por la mañana.' },
  { id: 'd0000000-0000-0000-0000-000000000007', clinic_id: CLINIC, full_name: 'Diego Condori',        national_id: '7890123', dob: '1993-12-01', sex: 'M', phone: '591-72778899', allergies: [],                      medical_alerts: [],                    notes: null },
  { id: 'd0000000-0000-0000-0000-000000000008', clinic_id: CLINIC, full_name: 'Ana Beatriz Vargas',   national_id: '8901234', dob: '1988-06-17', sex: 'F', phone: '591-76889900', allergies: [],                      medical_alerts: [],                    notes: 'Interesada en blanqueamiento.' },
]

await run('Pacientes', sb.from('patients').upsert(patients, { onConflict: 'id', ignoreDuplicates: true }))

// ── Historial clínico ──────────────────────────────────────────────────────────
// UUIDs: prefijo b0 = historial, prefijo c0 = items
const history = [
  { id: 'b0000000-0000-0000-0000-000000000001', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000001', dentist_id: DOCTOR, occurred_on: '2026-05-12', notes: 'Limpieza completa. Sin caries activas. Se recomienda endodoncia en pieza 21.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000002', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000001', dentist_id: DOCTOR, occurred_on: '2026-05-27', notes: 'Primera sesión endodoncia pieza 21. Acceso y conductometría. Paciente tolera bien.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000003', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000002', dentist_id: DOCTOR, occurred_on: '2026-05-13', notes: 'Consulta urgencia. Extracción pieza 48 (tercer molar inferior derecho retenido). Sin complicaciones.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000004', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000002', dentist_id: DOCTOR, occurred_on: '2026-06-02', notes: 'Control post-extracción. Cicatrización normal. Se coloca corona provisional pieza 36.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000005', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000003', dentist_id: DOCTOR, occurred_on: '2026-05-12', notes: 'Primera consulta. Revisión completa. Caries profunda en piezas 16 y 36. Glucosa pre-procedimiento: 112 mg/dL.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000006', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000003', dentist_id: DOCTOR, occurred_on: '2026-05-28', notes: 'Endodoncia multirradicular pieza 36. Sesión 1. Preparación biomecánica. Glucosa: 98 mg/dL.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000007', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000004', dentist_id: DOCTOR, occurred_on: '2026-05-14', notes: 'Resina compuesta piezas 14 y 15. Trabajo sin incidentes. Paciente satisfecha con el resultado.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000008', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000004', dentist_id: DOCTOR, occurred_on: '2026-05-21', notes: 'Resina compuesta pieza 25 (mesial). Se aprovechó para profilaxis general.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000009', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000005', dentist_id: DOCTOR, occurred_on: '2026-05-14', notes: 'Limpieza y profilaxis. Presión arterial: 130/85. Encías inflamadas por placa bacteriana. Se indica colutorio.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000010', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000006', dentist_id: DOCTOR, occurred_on: '2026-05-19', notes: 'Extracción pieza 44 (raíz residual). Anestesia sin vasoconstrictor por alergia a aspirina. Sin complicaciones.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000011', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000006', dentist_id: DOCTOR, occurred_on: '2026-05-26', notes: 'Control post-extracción. Buena evolución. Endodoncia pieza 46 planeada para próxima cita.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000012', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000007', dentist_id: DOCTOR, occurred_on: '2026-05-26', notes: 'Consulta inicial. Requiere resina en piezas 17 y 27. Higiene deficiente. Se indica técnica de cepillado.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000013', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000008', dentist_id: DOCTOR, occurred_on: '2026-05-19', notes: 'Primera sesión blanqueamiento dental. Tono inicial A3. Peróxido de hidrógeno 35%. Sin sensibilidad.', created_by: DOCTOR },
  { id: 'b0000000-0000-0000-0000-000000000014', clinic_id: CLINIC, patient_id: 'd0000000-0000-0000-0000-000000000008', dentist_id: DOCTOR, occurred_on: '2026-05-27', notes: 'Segunda sesión blanqueamiento. Tono alcanzado A1. Paciente muy contenta. Se entrega kit de mantenimiento.', created_by: DOCTOR },
]

await run('Historial clínico', sb.from('patient_history').upsert(history, { onConflict: 'id', ignoreDuplicates: true }))

// ── Items del historial ───────────────────────────────────────────────────────
const items = [
  { id: 'c0000000-0000-0000-0000-000000000001', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000001', description: 'Limpieza dental',                         tooth_fdi: null, price: 200 },
  { id: 'c0000000-0000-0000-0000-000000000002', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000001', description: 'Profilaxis y pulido',                       tooth_fdi: null, price: 150 },
  { id: 'c0000000-0000-0000-0000-000000000003', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000002', description: 'Endodoncia unirradicular (sesión 1)',        tooth_fdi: '21', price: 425 },
  { id: 'c0000000-0000-0000-0000-000000000004', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000003', description: 'Consulta de urgencia',                       tooth_fdi: null, price:  60 },
  { id: 'c0000000-0000-0000-0000-000000000005', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000003', description: 'Extracción simple pieza 48',                 tooth_fdi: '48', price: 120 },
  { id: 'c0000000-0000-0000-0000-000000000006', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000004', description: 'Control post-extracción',                    tooth_fdi: null, price:   0 },
  { id: 'c0000000-0000-0000-0000-000000000007', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000004', description: 'Corona provisional pieza 36',                tooth_fdi: '36', price: 300 },
  { id: 'c0000000-0000-0000-0000-000000000008', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000005', description: 'Consulta inicial y diagnóstico',              tooth_fdi: null, price:  60 },
  { id: 'c0000000-0000-0000-0000-000000000009', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000006', description: 'Endodoncia multirradicular (sesión 1)',       tooth_fdi: '36', price: 600 },
  { id: 'c0000000-0000-0000-0000-000000000010', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000007', description: 'Resina compuesta pieza 14',                   tooth_fdi: '14', price: 500 },
  { id: 'c0000000-0000-0000-0000-000000000011', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000007', description: 'Resina compuesta pieza 15',                   tooth_fdi: '15', price: 500 },
  { id: 'c0000000-0000-0000-0000-000000000012', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000008', description: 'Resina compuesta pieza 25',                   tooth_fdi: '25', price: 500 },
  { id: 'c0000000-0000-0000-0000-000000000013', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000008', description: 'Profilaxis',                                  tooth_fdi: null, price: 150 },
  { id: 'c0000000-0000-0000-0000-000000000014', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000009', description: 'Limpieza y profilaxis',                       tooth_fdi: null, price: 200 },
  { id: 'c0000000-0000-0000-0000-000000000015', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000010', description: 'Extracción raíz residual pieza 44',            tooth_fdi: '44', price: 350 },
  { id: 'c0000000-0000-0000-0000-000000000016', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000011', description: 'Control post-extracción',                    tooth_fdi: null, price:   0 },
  { id: 'c0000000-0000-0000-0000-000000000017', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000012', description: 'Consulta y diagnóstico',                      tooth_fdi: null, price:  60 },
  { id: 'c0000000-0000-0000-0000-000000000018', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000013', description: 'Blanqueamiento dental (sesión 1)',             tooth_fdi: null, price: 325 },
  { id: 'c0000000-0000-0000-0000-000000000019', clinic_id: CLINIC, history_id: 'b0000000-0000-0000-0000-000000000014', description: 'Blanqueamiento dental (sesión 2)',             tooth_fdi: null, price: 325 },
]

await run('Items de historial', sb.from('patient_history_items').upsert(items, { onConflict: 'id', ignoreDuplicates: true }))

console.log('\nListo. Abre http://localhost:3000 para ver los datos.')
