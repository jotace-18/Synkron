import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { Exam } from './exam.types';
import type { CreateExamDto } from './dto/create-exam.dto';
import type { UpdateExamDto } from './dto/update-exam.dto';

const examColumns = `
  id, title, course_name, course_abbreviation,
  topics, section, exam_date::text, exam_at, status,
  weight_percent::double precision AS weight_percent,
  weight_basis,
  grade::double precision AS grade,
  created_at, updated_at, deleted_at`;

const examConstraintMessages: Record<string, string> = {
  exams_deadline_valid:
    'Indica exclusivamente exam_date o exam_at; al cambiar de formato, envía el anterior como null',
  exams_weight_valid:
    'La ponderación requiere porcentaje y referencia, o ambos null para retirarla',
};

@Injectable()
export class ExamsService {
  constructor(private readonly database: DatabaseService) {}

  async list(accountId: string, limit = 20, offset = 0): Promise<Exam[]> {
    const result = await this.database.query<Exam>(
      `SELECT ${examColumns}
       FROM academic.exams
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
  ): Promise<Exam[]> {
    const result = await this.database.query<Exam>(
      `SELECT ${examColumns}
       FROM academic.exams
       WHERE account_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset],
    );
    return result.rows;
  }

  async create(accountId: string, input: CreateExamDto): Promise<Exam> {
    const result = await this.database
      .query<Exam>(
        `INSERT INTO academic.exams (
         account_id, title, course_name, course_abbreviation, topics,
         section, exam_date, exam_at, status, weight_percent, weight_basis, grade
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${examColumns}`,
        [
          accountId,
          input.title,
          input.course_name,
          input.course_abbreviation ?? null,
          input.topics ?? null,
          input.section,
          input.exam_date ?? null,
          input.exam_at ?? null,
          input.status,
          input.weight_percent ?? null,
          input.weight_basis ?? null,
          input.grade ?? null,
        ],
      )
      .catch((error: unknown) => this.handleWriteError(error));

    return result.rows[0];
  }

  async getById(accountId: string, id: string): Promise<Exam> {
    const result = await this.database.query<Exam>(
      `SELECT ${examColumns}
       FROM academic.exams
       WHERE account_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [accountId, id],
    );

    const exam = result.rows[0];

    if (!exam) {
      throw new NotFoundException('Examen no encontrado');
    }

    return exam;
  }

  async update(
    accountId: string,
    id: string,
    input: UpdateExamDto,
  ): Promise<Exam> {
    const fieldTypes = {
      title: 'text',
      topics: 'text',
      course_name: 'text',
      course_abbreviation: 'text',
      section: 'text',
      exam_date: 'date',
      exam_at: 'timestamptz',
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

    const exams = fields.map(
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
      .query<Exam>(
        `UPDATE academic.exams
       SET
         ${exams.join(', ')},
         updated_at = CASE
           WHEN ${differences.join(' OR ')}
           THEN clock_timestamp()
           ELSE updated_at
         END
       WHERE account_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${examColumns}`,
        values,
      )
      .catch((error: unknown) => this.handleWriteError(error));

    const exam = result.rows[0];

    if (!exam) {
      throw new NotFoundException('Examen no encontrado');
    }

    return exam;
  }

  async remove(accountId: string, id: string): Promise<void> {
    const result = await this.database.query<{ id: string }>(
      `UPDATE academic.exams
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
      throw new NotFoundException('Examen no encontrado');
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
      Object.hasOwn(examConstraintMessages, error.constraint)
    ) {
      throw new UnprocessableEntityException(
        examConstraintMessages[error.constraint],
      );
    }
    throw error;
  }
}
