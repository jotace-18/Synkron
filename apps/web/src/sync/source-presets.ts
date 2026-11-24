export const SOURCE_PRESETS = {
  academic: {
    label: "Académico (Campus: entregas y exámenes)",
    name: "Sincronizar Académico",
    url: "http://academic:3000/api/v1/assignments/export",
    connector: "academic.assignments",
    hint: "Entra en Campus y crea una credencial en Acceso de Synkron. Se conectarán entregas y exámenes de esa misma cuenta.",
  },
  personal: {
    label: "Otros (Personal)",
    name: "Sincronizar Otros",
    url: "http://personal:3000/api/v1/activities/export",
    connector: "standard.activities",
    hint: "Entra en Otros y crea una credencial personal en Acceso de Synkron.",
  },
  sport: {
    label: "Gimnasio (Sport)",
    name: "Sincronizar gimnasio",
    url: "http://sport:3000/api/v1/activities/export",
    connector: "standard.activities",
    hint: "Entra en Sport y crea una credencial personal en Acceso de Synkron.",
  },
  custom: {
    label: "Otra fuente",
    name: "",
    url: "",
    connector: "standard.activities",
    hint: "Introduce la URL de exportación y la credencial de la fuente autorizada.",
  },
} as const;
export type SourcePreset = keyof typeof SOURCE_PRESETS;
