// Qué pacientes ve un doctor (odontólogo_general/especialista) en el buscador
// de la agenda al agendar una cita. Un doctor ve: (1) los pacientes que ya
// atendió (tuvo cita o trabajo con ellos), y (2) los pacientes que TODAVÍA
// nadie en la clínica atendió — así puede agendarle su primera cita a un
// paciente recién registrado sin depender de que otro doctor lo haya visto
// antes. Lo único que un doctor NO ve es a los pacientes ya "reclamados" por
// OTRO doctor (privacidad entre colegas).
export function visiblePatientsForDoctor<T extends { id: string }>(
  allPatients: T[],
  ownPatientIds: Iterable<string>,
  claimedPatientIds: Iterable<string>,
): T[] {
  const own = new Set(ownPatientIds);
  const claimed = new Set(claimedPatientIds);
  return allPatients.filter((p) => own.has(p.id) || !claimed.has(p.id));
}
