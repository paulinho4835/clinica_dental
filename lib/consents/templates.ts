// Plantillas de consentimiento informado (texto, sin imágenes).
// El texto renderizado se almacena íntegro + su hash para integridad legal.
export const CONSENT_TEMPLATES: Record<string, { label: string; body: string }> = {
  general: {
    label: "Tratamiento general",
    body: "Autorizo al equipo odontológico a realizar el diagnóstico y los tratamientos dentales acordados. He sido informado/a de los riesgos, beneficios y alternativas, y he podido resolver mis dudas.",
  },
  endodoncia: {
    label: "Endodoncia",
    body: "Consiento la realización del tratamiento de conductos (endodoncia). Entiendo que puede requerir varias sesiones y que existe la posibilidad de complicaciones como dolor postoperatorio o fractura de instrumentos.",
  },
  extraccion: {
    label: "Extracción",
    body: "Autorizo la extracción dental indicada. He sido informado/a de los riesgos: sangrado, infección, inflamación, lesión de estructuras vecinas y necesidad eventual de tratamientos adicionales.",
  },
  ortodoncia: {
    label: "Ortodoncia",
    body: "Consiento el tratamiento de ortodoncia. Comprendo la duración estimada, la necesidad de higiene estricta y de uso de retenedores, y que el resultado depende de mi colaboración.",
  },
};
