import type { OpenAPIObject, PathsObject, SchemaObject } from '@nestjs/swagger';
import {
  array,
  boolean,
  day,
  errorSchema,
  id,
  instant,
  nullable,
  object,
  operation,
  pagination,
  ref,
  text,
  timestamps,
  uuid,
  values,
} from './openapi-support';

export function buildAcademicOpenApi(): OpenAPIObject {
  const common = {
    title: text(200),
    course_name: text(150),
    course_abbreviation: nullable(text(20)),
    weight_percent: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      nullable: true,
    } as SchemaObject,
    weight_basis: values(['course', 'section', null]),
    grade: {
      type: 'number',
      minimum: 0,
      maximum: 10,
      multipleOf: 0.01,
      nullable: true,
    } as SchemaObject,
  };
  const assignment = {
    ...common,
    section: values(['theory', 'practice', 'seminar']),
    mandatory: boolean,
    due_date: nullable(day),
    due_at: nullable(instant),
    status: {
      ...values(['pending', 'in_progress', 'submitted']),
      default: 'pending',
    },
    work_mode: { ...values(['individual', 'group']), default: 'individual' },
    group_members: {
      ...array(text()),
      default: [],
      description:
        'Nombres no vacíos; deben estar vacíos si work_mode es individual.',
    },
  };
  const exam = {
    ...common,
    topics: nullable(text(1000)),
    section: values(['theory', 'practice']),
    exam_date: nullable(day),
    exam_at: nullable(instant),
    status: {
      ...values(['scheduled', 'completed', 'cancelled']),
      default: 'scheduled',
    },
  };
  const assignmentCreate = object(assignment, [
    'title',
    'course_name',
    'section',
    'mandatory',
  ]);
  const examCreate = object(exam, ['title', 'course_name', 'section']);
  const schemas = {
    Error: errorSchema,
    CreateAssignment: {
      ...assignmentCreate,
      description:
        'Indica exclusivamente due_date o due_at. La ponderación exige porcentaje y referencia juntos o ambos null. El estado y la modalidad tienen valores predeterminados.',
    },
    UpdateAssignment: {
      ...object(assignment, []),
      description:
        'Actualización parcial; los campos omitidos se conservan. Al pasar de fecha a instante envía due_date=null, y a la inversa due_at=null. La ponderación se modifica mediante el par completo.',
    },
    Assignment: object({
      ...assignment,
      id: uuid,
      ...timestamps,
      deleted_at: nullable(instant),
    }),
    CreateExam: {
      ...examCreate,
      description:
        'Indica exclusivamente exam_date o exam_at. La ponderación exige porcentaje y referencia juntos o ambos null.',
    },
    UpdateExam: {
      ...object(exam, []),
      description:
        'Actualización parcial. Al cambiar entre fecha e instante envía el campo anterior como null. La ponderación se modifica mediante el par completo.',
    },
    Exam: object({
      ...exam,
      id: uuid,
      ...timestamps,
      deleted_at: nullable(instant),
    }),
  };
  const paths: PathsObject = {};
  const examples = {
    assignments: {
      title: 'Práctica de ejemplo',
      course_name: 'Cloud Computing',
      course_abbreviation: 'CC',
      section: 'practice',
      mandatory: true,
      due_date: '2026-12-02',
      due_at: null,
      status: 'pending',
      work_mode: 'individual',
      group_members: [],
      weight_percent: null,
      weight_basis: null,
      grade: null,
    },
    exams: {
      title: 'Parcial de ejemplo',
      course_name: 'Cloud Computing',
      course_abbreviation: 'CC',
      topics: 'Temas 1 y 2',
      section: 'theory',
      exam_date: '2026-12-03',
      exam_at: null,
      status: 'scheduled',
      weight_percent: null,
      weight_basis: null,
      grade: null,
    },
  };
  for (const [collection, model, tag] of [
    ['assignments', 'Assignment', 'Entregas'],
    ['exams', 'Exam', 'Exámenes'],
  ] as const) {
    const base = `/api/v1/${collection}`;
    paths[base] = {
      get: operation(
        tag,
        `Listar ${tag.toLowerCase()} activos`,
        200,
        array(ref(model)),
        { parameters: pagination },
      ),
      post: operation(
        tag,
        `Crear ${collection === 'exams' ? 'un examen' : 'una entrega'}`,
        201,
        ref(model),
        {
          body: ref(`Create${model}`),
          example: examples[collection],
          errors: [401, 422, 500],
        },
      ),
    };
    paths[`${base}/export`] = {
      get: operation(
        tag,
        'Exportar para sincronización, incluidas retiradas',
        200,
        array(ref(model)),
        {
          parameters: pagination,
          description:
            'Incluye registros con deleted_at. La ausencia en una página no significa retirada. Utiliza limit/offset hasta agotar las páginas.',
        },
      ),
    };
    paths[`${base}/{id}`] = {
      get: operation(tag, 'Consultar por identificador', 200, ref(model), {
        parameters: [id],
        errors: [401, 404, 422, 500],
      }),
      patch: operation(tag, 'Actualizar parcialmente', 200, ref(model), {
        parameters: [id],
        body: ref(`Update${model}`),
        example: { grade: 8.5 },
        errors: [401, 404, 422, 500],
      }),
      delete: operation(
        tag,
        'Retirar conservando la identidad y la exportación',
        204,
        undefined,
        {
          parameters: [id],
          errors: [401, 404, 422, 500],
          description:
            'Borrado lógico mediante deleted_at. No equivale a cancelar un examen; la cancelación se comunica con PATCH status=cancelled.',
        },
      ),
    };
  }
  return {
    openapi: '3.0.4',
    info: {
      title: 'Campus · Academic (fuente externa)',
      version: '1.0.0',
      description:
        'API de la aplicación académica de origen. No es el almacén central de Synkron. Usa AcademicBearer en Authorize, con la credencial de la cuenta académica sin el prefijo Bearer; no sirve la credencial si_ de entrada ni la sesión de Synkron. El gateway publica exclusivamente estas rutas bajo /academic para probarlas desde el portal HTTPS.',
    },
    servers: [
      {
        url: '/academic',
        description: 'Academic a través del gateway HTTPS local',
      },
    ],
    security: [{ AcademicBearer: [] }],
    components: {
      schemas,
      securitySchemes: {
        AcademicBearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Credencial del servicio académico; introducir solo el token. Es distinta de IngestionToken.',
        },
      },
    },
    paths,
  };
}
