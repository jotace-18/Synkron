export const SOURCE_PRESETS = {
  personal: {
    label: 'Otros (Personal)',
    name: 'Sincronizar Otros',
    url: 'http://personal:3000/api/v1/activities/export',
    connector: 'standard.activities',
    hint: 'Usa la credencial de tu cuenta personal (PERSONAL_DEMO_TOKEN en la demostración).',
  },
  sport: {
    label: 'Gimnasio (Sport)',
    name: 'Sincronizar gimnasio',
    url: 'http://sport:3000/api/v1/activities/export',
    connector: 'standard.activities',
    hint: 'Usa la credencial de tu cuenta deportiva (SPORT_DEMO_TOKEN en la demostración).',
  },
  custom: {
    label: 'Otra fuente',
    name: '',
    url: '',
    connector: 'standard.activities',
    hint: 'Introduce la URL de exportación y la credencial de la fuente autorizada.',
  },
} as const
export type SourcePreset = keyof typeof SOURCE_PRESETS
