import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { toEventView, type EventView, type StoredEvent } from './event.types';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
const columns =
  'id, title, on_date::text AS on_date, started_at, duration_minutes, people, status, created_at, updated_at, deleted_at';
const constraints: Record<string, string> = {
  events_title_valid: 'El asunto no puede estar vacío',
  events_schedule_valid:
    'Indica un día sin hora o un inicio con zona; la duración requiere hora. Al cambiar de forma temporal, borra los campos anteriores con null.',
  events_duration_valid:
    'La duración debe ser un número entero positivo de minutos',
  events_timing_valid:
    'El día, el inicio y el final deben estar comprendidos entre los años 1 y 9999',
  events_people_valid:
    'La lista admite hasta 50 nombres no vacíos de hasta 100 caracteres',
  events_status_valid: 'El estado no es válido',
};
@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}
  async list(
    accountId: string,
    limit: number,
    offset: number,
    includeRetired = false,
  ): Promise<EventView[]> {
    const result = await this.database.query<StoredEvent>(
      `SELECT ${columns} FROM personal.events WHERE account_id=$1 AND ($4::boolean OR deleted_at IS NULL) ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [accountId, limit, offset, includeRetired],
    );
    return result.rows.map(toEventView);
  }
  async get(accountId: string, id: string): Promise<EventView> {
    const result = await this.database.query<StoredEvent>(
      `SELECT ${columns} FROM personal.events WHERE account_id=$1 AND id=$2 AND deleted_at IS NULL`,
      [accountId, id],
    );
    if (!result.rows[0])
      throw new NotFoundException('Compromiso no encontrado');
    return toEventView(result.rows[0]);
  }
  async create(accountId: string, input: CreateEventDto): Promise<EventView> {
    const result = await this.database
      .query<StoredEvent>(
        `INSERT INTO personal.events(account_id,title,on_date,started_at,duration_minutes,people,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
        [
          accountId,
          input.title,
          input.on_date,
          input.started_at === null ? null : new Date(input.started_at),
          input.duration_minutes,
          input.people,
          input.status,
        ],
      )
      .catch((error: unknown) => this.handleWriteError(error));
    return toEventView(result.rows[0]);
  }
  async update(
    accountId: string,
    id: string,
    input: UpdateEventDto,
  ): Promise<EventView> {
    const types = {
      title: 'text',
      on_date: 'date',
      started_at: 'timestamptz',
      duration_minutes: 'integer',
      people: 'text[]',
      status: 'text',
    } as const;
    const fields = (Object.keys(types) as (keyof typeof types)[]).filter(
      (field) => input[field] !== undefined,
    );
    if (!fields.length)
      throw new UnprocessableEntityException(
        'Indica al menos un campo para actualizar',
      );
    const assignments = fields.map(
      (field, index) => `${field}=$${index + 3}::${types[field]}`,
    );
    const changed = fields.map(
      (field, index) =>
        `${field} IS DISTINCT FROM $${index + 3}::${types[field]}`,
    );
    const parameters: unknown[] = fields.map((field) =>
      field === 'started_at' && input.started_at !== null
        ? new Date(input.started_at!)
        : input[field],
    );
    const result = await this.database
      .query<StoredEvent>(
        `UPDATE personal.events SET ${assignments.join(', ')}, updated_at=CASE WHEN ${changed.join(' OR ')} THEN clock_timestamp() ELSE updated_at END WHERE account_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING ${columns}`,
        [accountId, id, ...parameters],
      )
      .catch((error: unknown) => this.handleWriteError(error));
    if (!result.rows[0])
      throw new NotFoundException('Compromiso no encontrado');
    return toEventView(result.rows[0]);
  }
  async remove(accountId: string, id: string): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE personal.events SET deleted_at=COALESCE(deleted_at,statement_timestamp()), updated_at=CASE WHEN deleted_at IS NULL THEN statement_timestamp() ELSE updated_at END WHERE account_id=$1 AND id=$2 RETURNING id`,
      [accountId, id],
    );
    if (!result.rows[0])
      throw new NotFoundException('Compromiso no encontrado');
  }
  private handleWriteError(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23514' &&
      'constraint' in error &&
      typeof error.constraint === 'string' &&
      Object.hasOwn(constraints, error.constraint)
    )
      throw new UnprocessableEntityException(constraints[error.constraint]);
    throw error;
  }
}
