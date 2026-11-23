import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  toGymSessionView,
  type GymSessionView,
  type StoredGymSession,
} from './gym.types';
import type { CreateGymSessionDto } from './dto/create-gym-session.dto';
import type { UpdateGymSessionDto } from './dto/update-gym-session.dto';

const columns =
  'id, started_at, duration_minutes, training_mode, accompanied, status, created_at, updated_at, deleted_at';
const constraints: Record<string, string> = {
  gym_sessions_duration_valid:
    'La duración debe ser un número entero positivo de minutos',
  gym_sessions_timing_valid:
    'El inicio y el final deben estar comprendidos entre los años 1 y 9999',
  gym_sessions_mode_valid: 'La modalidad no es válida',
  gym_sessions_status_valid: 'El estado no es válido',
};

@Injectable()
export class GymService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    accountId: string,
    limit: number,
    offset: number,
    includeRetired = false,
  ): Promise<GymSessionView[]> {
    const result = await this.database.query<StoredGymSession>(
      `SELECT ${columns} FROM sport.gym_sessions
       WHERE account_id=$1 AND ($4::boolean OR deleted_at IS NULL)
       ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [accountId, limit, offset, includeRetired],
    );
    return result.rows.map(toGymSessionView);
  }

  async create(
    accountId: string,
    input: CreateGymSessionDto,
  ): Promise<GymSessionView> {
    const result = await this.database
      .query<StoredGymSession>(
        `INSERT INTO sport.gym_sessions(account_id, started_at, duration_minutes, training_mode, accompanied, status)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,
        [
          accountId,
          new Date(input.started_at),
          input.duration_minutes,
          input.training_mode,
          input.accompanied,
          input.status,
        ],
      )
      .catch((error: unknown) => this.handleWriteError(error));
    return toGymSessionView(result.rows[0]);
  }

  async get(accountId: string, id: string): Promise<GymSessionView> {
    const result = await this.database.query<StoredGymSession>(
      `SELECT ${columns} FROM sport.gym_sessions WHERE account_id=$1 AND id=$2 AND deleted_at IS NULL`,
      [accountId, id],
    );
    if (!result.rows[0])
      throw new NotFoundException('Sesión de gimnasio no encontrada');
    return toGymSessionView(result.rows[0]);
  }

  async update(
    accountId: string,
    id: string,
    input: UpdateGymSessionDto,
  ): Promise<GymSessionView> {
    const types = {
      started_at: 'timestamptz',
      duration_minutes: 'integer',
      training_mode: 'text',
      accompanied: 'boolean',
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
      field === 'started_at' ? new Date(input.started_at!) : input[field],
    );
    const result = await this.database
      .query<StoredGymSession>(
        `UPDATE sport.gym_sessions SET ${assignments.join(', ')},
       updated_at=CASE WHEN ${changed.join(' OR ')} THEN clock_timestamp() ELSE updated_at END
       WHERE account_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING ${columns}`,
        [accountId, id, ...parameters],
      )
      .catch((error: unknown) => this.handleWriteError(error));
    if (!result.rows[0])
      throw new NotFoundException('Sesión de gimnasio no encontrada');
    return toGymSessionView(result.rows[0]);
  }

  async remove(accountId: string, id: string): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE sport.gym_sessions SET deleted_at=COALESCE(deleted_at, statement_timestamp()),
       updated_at=CASE WHEN deleted_at IS NULL THEN statement_timestamp() ELSE updated_at END
       WHERE account_id=$1 AND id=$2 RETURNING id`,
      [accountId, id],
    );
    if (!result.rows[0])
      throw new NotFoundException('Sesión de gimnasio no encontrada');
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
    ) {
      throw new UnprocessableEntityException(constraints[error.constraint]);
    }
    throw error;
  }
}
