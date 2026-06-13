export type PlaceholderVars = {
  nombre_paciente: string;
  fecha: string;
  doctor: string;
  clinica: string;
};

export function fillPlaceholders(body: string, vars: PlaceholderVars): string {
  return body
    .replace(/\{\{nombre_paciente\}\}/g, vars.nombre_paciente)
    .replace(/\{\{fecha\}\}/g, vars.fecha)
    .replace(/\{\{doctor\}\}/g, vars.doctor)
    .replace(/\{\{clinica\}\}/g, vars.clinica);
}

export function todayFormatted(): string {
  return new Date().toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
