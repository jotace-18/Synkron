import { sourceFetch } from '../auth/source-auth-client.ts';
import type { Assignment, AssignmentInput } from './assignment.types'

export async function listAssignments(
  signal?: AbortSignal,
): Promise<Assignment[]> {
  const assignments: Assignment[] = []
  const pageSize = 50

  for (;;) {
    const query = new URLSearchParams({
      limit: String(pageSize),
      offset: String(assignments.length),
    })

    const response = await sourceFetch(`/api/v1/assignments?${query}`, {
      cache: 'no-store',
      signal,
    })

    if (response.status !== 200) {
      throw new Error('No se pudieron cargar las entregas.')
    }

    const page: unknown = await response.json()

    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error('El servicio ha devuelto una respuesta inesperada.')
    }

    assignments.push(...(page as Assignment[]))

    if (page.length < pageSize) {
      return assignments
    }
  }
}

export class UnconfirmedAssignmentError extends Error {
  constructor() {
    super(
      'No se pudo confirmar la operación. Comprueba la lista antes de volver a intentarlo.',
    )
    this.name = 'UnconfirmedAssignmentError'
  }
}

export class AssignmentUnavailableError extends Error {
  constructor() {
    super('La entrega ya no está disponible. Actualiza la lista.')
    this.name = 'AssignmentUnavailableError'
  }
}

async function writeAssignment(
  method: 'POST' | 'PATCH' | 'DELETE',
  id: string | undefined,
  input: Partial<AssignmentInput> | undefined,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    const path = id
      ? `/api/v1/assignments/${encodeURIComponent(id)}`
      : '/api/v1/assignments'
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
    throw new UnconfirmedAssignmentError()
  }
  const expected = { POST: 201, PATCH: 200, DELETE: 204 }[method]
  if (response.status === expected) return
  if (response.status >= 500) throw new UnconfirmedAssignmentError()
  if (response.status === 404) throw new AssignmentUnavailableError()
  if (response.status === 422)
    throw new Error(
      'Revisa los campos: fecha, nota, ponderación e integrantes del grupo.',
    )
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      'No se pudo autorizar la operación. Inténtalo de nuevo más tarde.',
    )
  }
  throw new Error(
    method === 'DELETE'
      ? 'No se pudo retirar la entrega. Inténtalo de nuevo.'
      : 'No se pudo guardar la entrega. Inténtalo de nuevo.',
  )
}

export function createAssignment(
  input: AssignmentInput,
  signal?: AbortSignal,
): Promise<void> {
  return writeAssignment('POST', undefined, input, signal)
}

export function updateAssignment(
  id: string,
  input: Partial<AssignmentInput>,
  signal?: AbortSignal,
): Promise<void> {
  if (Object.keys(input).length === 0) return Promise.resolve()
  return writeAssignment('PATCH', id, input, signal)
}

export function retireAssignment(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  return writeAssignment('DELETE', id, undefined, signal)
}
