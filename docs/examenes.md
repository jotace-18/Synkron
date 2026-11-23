# Exámenes: puesta en marcha y comprobación

La incorporación está implementada en los siete bloques acordados:

1. Contrato: fecha obligatoria, hora opcional, Programado/Realizado/Cancelado,
   asignatura, temario, teoría/prácticas, ponderación y nota.
2. Sync extensible: catálogo, registro de importadores y tubería compartida.
3. Academic: persistencia, CRUD por cuenta y exportación con retiradas.
4. Conector `academic.exams`: lectura paginada, validación, transformación,
   definiciones y reservas de ejecución; migración compatible con entregas.
5. Campus: sección de exámenes con listado, creación, edición y retirada.
6. Synkron: calendario, agenda, detalles, estados, recordatorios y reglas explícitas.
7. Verificación: pruebas unitarias, comprobaciones de frontend y dos escenarios
   de integración registrados en los jobs de CI existentes. No se añade otro job.

## Checkpoint validado el 22/11/2026

Se aplicaron ambas migraciones y se reconstruyeron los servicios locales.
El usuario confirmó que pasaron `exams-http.e2e-spec.ts` y
`exams-import.e2e-spec.ts` con PostgreSQL.

En el navegador se comprobó el recorrido Campus → Sync → calendario y detalle:
creación sin hora, actualización de fecha con hora de Madrid y nota, cancelación
visible en gris y tachada, y retirada de la agenda. También se recibió un
recordatorio de examen programado y el aviso «Nota de examen actualizada» de
una regla específica. Las capturas muestran ambos avisos en la bandeja de Synkron.

Estas comprobaciones locales complementan las pruebas automatizadas. El resultado
del siguiente workflow de GitHub queda por confirmar después de subir el checkpoint.

## Actualizar los contenedores

Desde la raíz del repositorio, con la configuración local ya existente:

```bash
docker compose up -d --wait academic-db sync-db
docker compose run --rm --no-deps --volume "$PWD/apps/academic:/app" academic npm run migrate:up
docker compose run --rm --no-deps --volume "$PWD/apps/sync:/app" sync npm run migrate:up
docker compose up -d --build academic academic-web sync sync-worker automation automation-reminders web
docker compose up -d api rabbitmq sync-publisher sync-event-publisher monitoring monitoring-consumer automation-consumer automation-scheduler automation-notifications gateway
```

Las nuevas migraciones son `academic/004_create_exams.sql` y
`sync/012_add_exam_connector.sql`. No es necesaria una migración de Automation.
No se borra ningún volumen ni se altera la configuración existente de entregas.

## Configurar la sincronización una vez

Crear una conexión propia en Synkron con estos datos:

```json
{
  "name": "Academic: exámenes",
  "base_url": "http://academic:3000/api/v1/exams/export",
  "auth": { "type": "bearer", "token": "CREDENCIAL_ACADEMIC_LOCAL" },
  "enabled": true
}
```

Se utiliza el valor local de `ACADEMIC_DEMO_TOKEN`, de la misma cuenta académica
que Campus. El marcador anterior no es una credencial válida. La conexión de
entregas mantiene su URL de exportación original.

La API es `POST /api/v1/connections`, con sesión y token CSRF de Synkron.
Después crear la definición mediante `POST /api/v1/sync-definitions`:

```json
{
  "name": "Centralizar exámenes académicos",
  "source_connection_id": "UUID_DEVUELTO_AL_CREAR_LA_CONEXION",
  "connector": "academic.exams",
  "enabled": true
}
```

La definición aparecerá en «Qué sincronizar», en los formularios de programación
y como destino de reglas. No se crean configuraciones para otras cuentas ni se
activa una programación automáticamente. Para evitar duplicados, consultar antes
`GET /api/v1/connections` y `GET /api/v1/sync-definitions` con paginación.

## Recorrido de comprobación

1. En Campus (`http://127.0.0.1:3103`), abrir Exámenes y crear uno de CC, con
   temario, fecha sin hora y estado Programado.
2. En Synkron (`https://localhost:8443`), iniciar sesión y sincronizar la definición
   de exámenes. Verificar que aparece en su día, con el modal completo y sin hora
   inventada. Cuenta de prueba: `prueba@example.com`, contraseña
   `Una-clave-ficticia-para-pruebas`.
3. Repetir la sincronización: debe contar como sin cambios y conservar el ID central.
4. Editar fecha/hora y nota en Campus y sincronizar. Debe actualizarse el mismo
   examen y registrar `schedule` y `grade` en Monitoring.
5. Probar Realizado y Cancelado: ambos permanecen visibles; Cancelado se muestra
   tachado y ninguno debe producir nuevos recordatorios pendientes.
6. Retirarlo en Campus: tras sincronizar desaparece de la agenda central. La
   exportación conserva la marca de retirada. Cancelar no equivale a retirar.
7. Para comprobar avisos, crear un examen programado dentro de la antelación
   configurada. Repetir revisiones no debe duplicar el aviso. Un cambio de fecha
   permite un aviso del nuevo momento; los pendientes obsoletos se cancelan.
8. Crear una regla específica de cambio de fecha o nota de examen. Las reglas de
   entregas deben seguir funcionando y no reaccionar a exámenes.

El caso de PostgreSQL de Academic comprueba autenticación, aislamiento de cuentas,
cambios atómicos de fecha/ponderación, edición sin cambios, retirada repetida y
exportación. El de Sync recorre creación, deduplicación, nota/fecha, cancelación y
retirada con el procesador real y eventos en outbox; simula únicamente el lector
externo. Ambos se ejecutan con el resto de E2E en CI.

```bash
docker compose run --rm --no-deps --volume "$PWD/apps/academic:/app" academic npm run test:e2e -- --runInBand exams-http.e2e-spec.ts
docker compose run --rm --no-deps --volume "$PWD/apps/sync:/app" sync npm run test:e2e -- --runInBand exams-import.e2e-spec.ts
```
