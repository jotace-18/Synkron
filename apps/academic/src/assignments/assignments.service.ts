import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { Assignment } from './assignment.types';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { UpdateAssignmentDto } from './dto/update-assignment.dto';

const assignmentColumns = `
  id, title, course_name, course_abbreviation,
  section, mandatory, due_date::text, due_at, status,
  work_mode, group_members,
  weight_percent::double precision AS weight_percent,
  weight_basis,
  grade::double precision AS grade,
  created_at, updated_at, deleted_at`;

const assignmentConstraintMessages: Record<string, string> = {
  assignments_deadline_valid:
    'Indica exclusivamente due_date o due_at; al cambiar de formato, envía el anterior como null',
  assignments_group_members_valid:
    'Una entrega individual debe tener group_members vacío; envía [] al cambiar desde un grupo con integrantes',
  assignments_weight_valid:
    'La ponderación requiere porcentaje y referencia, o ambos null para retirarla',
};

@Injectable()
export class AssignmentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(accountId: string, limit = 20, offset = 0): Promise<Assignment[]> {
    const result = await this.database.query<Assignment>(
      `SELECT ${assignmentColumns}
       FROM academic.assignments
       WHERE account_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset],
    );

    return result.rows;
  }

  async exportForSync(
    accountId: string,
    limit = 20,
    offset = 0,
  ): Promise<Assignment[]> {
    const result = await this.database.query<Assignment>(
      `SELECT ${assignmentColumns}
       FROM academic.assignments
       WHERE account_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset],
    );
    return result.rows;
  }

  async create(
    accountId: string,
    input: CreateAssignmentDto,
  ): Promise<Assignment> {
    const result = await this.database
      .query<Assignment>(
        `INSERT INTO academic.assignments (
         account_id, title, course_name, course_abbreviation,
         section, mandatory, due_date, due_at, status,
         work_mode, group_members, weight_percent, weight_basis, grade
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )
       RETURNING ${assignmentColumns}`,
        [
          accountId,
          input.title,
          input.course_name,
          input.course_abbreviation ?? null,
          input.section,
          input.mandatory,
          input.due_date ?? null,
          input.due_at ?? null,
          input.status,
          input.work_mode,
          input.group_members,
          input.weight_percent ?? null,
          input.weight_basis ?? null,
          input.grade ?? null,
        ],
      )
      .catch((error: unknown) => this.handleWriteError(error));

    return result.rows[0];
  }

  async getById(accountId: string, id: string): Promise<Assignment> {
    const result = await this.database.query<Assignment>(
      `SELECT ${assignmentColumns}
       FROM academic.assignments
       WHERE account_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [accountId, id],
    );

    const assignment = result.rows[0];

    if (!assignment) {
      throw new NotFoundException('Entrega no encontrada');
    }

    return assignment;
  }

  async update(
    accountId: string,
    id: string,
    input: UpdateAssignmentDto,
  ): Promise<Assignment> {
    const fieldTypes = {
      title: 'text',
      course_name: 'text',
      course_abbreviation: 'text',
      section: 'text',
      due_date: 'date',
      due_at: 'timestamptz',
      mandatory: 'boolean',
      work_mode: 'text',
      group_members: 'text[]',
      weight_percent: 'numeric',
      weight_basis: 'text',
      status: 'text',
      grade: 'numeric',
    } as const;
    const fields = (
      Object.keys(fieldTypes) as (keyof typeof fieldTypes)[]
    ).filter((field) => input[field] !== undefined);

    if (fields.length === 0) {
      throw new UnprocessableEntityException(
        'Indica al menos un campo para actualizar',
      );
    }

    const parameters = fields.map(
      (field, index) => `$${index + 3}::${fieldTypes[field]}`,
    );

    const assignments = fields.map(
      (field, index) => `${field} = ${parameters[index]}`,
    );

    const differences = fields.map(
      (field, index) => `${field} IS DISTINCT FROM ${parameters[index]}`,
    );

    const values: unknown[] = [
      accountId,
      id,
      ...fields.map((field) => input[field]),
    ];

    const result = await this.database
      .query<Assignment>(
        `UPDATE academic.assignments
       SET
         ${assignments.join(', ')},
         updated_at = CASE
           WHEN ${differences.join(' OR ')}
           THEN clock_timestamp()
           ELSE updated_at
         END
       WHERE account_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${assignmentColumns}`,
        values,
      )
      .catch((error: unknown) => this.handleWriteError(error));

    const assignment = result.rows[0];

    if (!assignment) {
      throw new NotFoundException('Entrega no encontrada');
    }

    return assignment;
  }

  async remove(accountId: string, id: string): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE academic.assignments
       SET deleted_at = COALESCE(deleted_at, statement_timestamp()),
           updated_at = CASE
             WHEN deleted_at IS NULL THEN statement_timestamp()
             ELSE updated_at
           END
       WHERE account_id = $1 AND id = $2
       RETURNING id`,
      [accountId, id],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Entrega no encontrada');
    }
  }

  private handleWriteError(error: unknown): never {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23514' &&
      'constraint' in error &&
      typeof error.constraint === 'string' &&
      Object.hasOwn(assignmentConstraintMessages, error.constraint)
    ) {
      throw new UnprocessableEntityException(
        assignmentConstraintMessages[error.constraint],
      );
    }
    throw error;
  }
}
