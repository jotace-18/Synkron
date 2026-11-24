import { sourceFetch } from '../auth/source-auth-client.ts';
import type { Exam, ExamInput } from './exam.types'

export async function listExams(signal?: AbortSignal): Promise<Exam[]> {
  const exams: Exam[] = []
  const pageSize = 50

  for (;;) {
    const query = new URLSearchParams({
      limit: String(pageSize),
      offset: String(exams.length),
    })

    const response = await sourceFetch(`/api/v1/exams?${query}`, {
      cache: 'no-store',
      signal,
    })

    if (response.status !== 200) {
      throw new Error('No se pudieron cargar los exámenes.')
    }

    const page: unknown = await response.json()

    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error('El servicio ha devuelto una respuesta inesperada.')
    }

    exams.push(...(page as Exam[]))

    if (page.length < pageSize) {
      return exams
    }
  }
}

export class UnconfirmedExamError extends Error {
  constructor() {
    super(
      'No se pudo confirmar la operación. Comprueba la lista antes de volver a intentarlo.',
    )
    this.name = 'UnconfirmedExamError'
  }
}

export class ExamUnavailableError extends Error {
  constructor() {
    super('La examen ya no está disponible. Actualiza la lista.')
    this.name = 'ExamUnavailableError'
  }
}

async function writeExam(
  method: 'POST' | 'PATCH' | 'DELETE',
  id: string | undefined,
  input: Partial<ExamInput> | undefined,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    const path = id
      ? `/api/v1/exams/${encodeURIComponent(id)}`
      : '/api/v1/exams'
    response = await sourceFetch(path, {
      method,
      headers: input ? { 'Content-Type': 'application/json' } : undefined,
      body: input ? JSON.stringify(input) : undefined,
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    })
  } catch {
    throw new UnconfirmedExamError()
  }
  const expected = { POST: 201, PATCH: 200, DELETE: 204 }[method]
  if (response.status === expected) return
  if (response.status >= 500) throw new UnconfirmedExamError()
  if (response.status === 404) throw new ExamUnavailableError()
  if (response.status === 422)
    throw new Error('Revisa los campos: fecha, nota y ponderación.')
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'No se pudo autorizar la operación. Inténtalo de nuevo más tarde.',
    )
  }
  throw new Error(
    method === 'DELETE'
      ? 'No se pudo retirar el examen. Inténtalo de nuevo.'
      : 'No se pudo guardar el examen. Inténtalo de nuevo.',
  )
}

export function createExam(
  input: ExamInput,
  signal?: AbortSignal,
): Promise<void> {
  return writeExam('POST', undefined, input, signal)
}

export function updateExam(
  id: string,
  input: Partial<ExamInput>,
  signal?: AbortSignal,
): Promise<void> {
  if (Object.keys(input).length === 0) return Promise.resolve()
  return writeExam('PATCH', id, input, signal)
}

export function retireExam(id: string, signal?: AbortSignal): Promise<void> {
  return writeExam('DELETE', id, undefined, signal)
}
