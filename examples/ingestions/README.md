# Enviar actividades desde una fuente externa

Requiere Node 24, Synkron con la migración 013 aplicada y una fuente creada desde
`https://localhost:8443/api/docs` que permita `academic.exam`. La credencial de
entrada se muestra una sola vez al crear o rotar la fuente.

Consulta la [guía completa](../../docs/entrada-estandarizada.md#ejemplo-externo-sin-campus)
para introducir la credencial y configurar la confianza en la CA local.

```bash
node examples/ingestions/send-activity.mjs examples/ingestions/exam.json external-exam:1
```

El script lee `SYNKRON_INGESTION_TOKEN` y, opcionalmente, `SYNKRON_URL` (por defecto,
`https://localhost:8443`). Envía el JSON y espera al resultado. No imprime el token.

- Reintenta el mismo contenido con la misma clave si pierdes la respuesta.
- Usa otra clave para cambiar la nota, fecha u otros datos del mismo `external_id`.
- Espera al resultado terminal antes de enviar otra revisión de esa identidad.
- Para retirar el ejemplo, envía `retire-exam.json` con otra clave.
- Otra clave con el mismo contenido crea una ejecución, pero no duplica actividad
  ni genera cambios de dominio si no ha cambiado su contenido.

Estos ejemplos utilizan datos ficticios. Los estados y detalles deben cumplir el
esquema de su tipo; todavía solo están habilitadas entregas y exámenes.
