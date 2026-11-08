import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { Assignment } from './assignment.types';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(accountId: string, limit = 20, offset = 0): Promise<Assignment[]> {
    const result = await this.database.query<Assignment>(
      `SELECT
         id, title, course_name, course_abbreviation,
         section, mandatory, due_date::text, due_at, status,
         work_mode, group_members,
         weight_percent::double precision AS weight_percent,
         weight_basis,
         grade::double precision AS grade,
         created_at, updated_at
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
    const result = await this.database.query<Assignment>(
      `INSERT INTO academic.assignments (
         account_id, title, course_name, course_abbreviation,
         section, mandatory, due_date, due_at, status,
         work_mode, group_members, weight_percent, weight_basis, grade
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14
       )
       RETURNING
         id, title, course_name, course_abbreviation,
         section, mandatory, due_date::text, due_at, status,
         work_mode, group_members,
         weight_percent::double precision AS weight_percent,
         weight_basis,
         grade::double precision AS grade,
         created_at, updated_at`,
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
    );

    return result.rows[0];
  }

  async getById(accountId: string, id: string): Promise<Assignment> {
    const result = await this.database.query<Assignment>(
      `SELECT
         id, title, course_name, course_abbreviation,
         section, mandatory, due_date::text, due_at, status,
         work_mode, group_members,
         weight_percent::double precision AS weight_percent,
         weight_basis,
         grade::double precision AS grade,
         created_at, updated_at
       FROM academic.assignments
       WHERE account_id = $1 AND id = $2`,
      [accountId, id],
    );

    const assignment = result.rows[0];

    if (!assignment) {
      throw new NotFoundException('Entrega no encontrada');
    }

    return assignment;
  }
}
