export const CV_GLOSSARY: Record<string, string> = {
  "Actual": "Present",
  "Datos académicos": "Academic Background",
  "Datos personales": "Personal Information",
  "Dominio de idiomas": "Languages",
  "Experiencia profesional": "Professional Experience",
  "Fecha de ingreso": "Start Date",
  "Fecha de salida": "End Date",
  "Número de identificación": "ID Number",
  "País de residencia": "Country of Residence",
  "Ciudad de residencia": "City of Residence",
  "Estado civil": "Marital Status",
  "Nacionalidad": "Nationality",
  "Redes sociales": "Social Media",
  "Red social principal": "Primary Social Network",
  "Red social secundaria": "Secondary Social Network",
  "Usuario": "Username",
  "Correo personal": "Personal Email",
  "Correo institucional": "Institutional Email",
  "Referencias": "References",
  "Principales funciones": "Key Responsibilities",
  "Cargo": "Position",
  "Institución": "Institution",
  "Fecha de nacimiento": "Date of Birth",
  "Título": "Degree",
  "Año": "Year",
  "TERCER NIVEL": "Undergraduate Education",
  "CUARTO NIVEL": "Graduate Education",
  "Directora RRHH": "HR Director",
  "Gerente RRHH": "HR Manager",
};

export const PROTECTED_TERMS = [
  "UEES",
  "RRHH",
  "IG",
  "X",
  "Senescyt",
];

export function formatGlossaryForPrompt() {
  return Object.entries(CV_GLOSSARY)
    .map(([source, target]) => `- ${source} => ${target}`)
    .join("\n");
}

