import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

describe('AssignmentsService', () => {
  const query = jest.fn<
    Promise<{ rows: unknown[] }>,
    [sql: string, values?: unknown[]]
  >();
  const accountId = '11111111-1111-4111-8111-111111111111';
  let service: AssignmentsService;

  beforeEach(() => {
    query.mockReset();
    service = new AssignmentsService({ query } as unknown as DatabaseService);
  });

  function createInput() {
    return Object.assign(new CreateAssignmentDto(), {
      title: "Entrega de mi equipo'; DROP TABLE academic.assignments; --",
      course_name: 'Cloud Computing',
      section: 'practice' as const,
      mandatory: true,
      due_date: '2026-11-24',
    });
  }

  it('uses the trusted account and keeps input values separate from SQL', async () => {
    const input = Object.assign(createInput(), {
      account_id: '22222222-2222-4222-8222-222222222222',
    });
    query.mockResolvedValue({ rows: [{ id: 'created-assignment' }] });

    await service.create(accountId, input);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(sql).not.toContain(input.title);
    expect(values?.[0]).toBe(accountId);
    expect(values).toContain(input.title);
    expect(values).not.toContain(input.account_id);
  });

  it('propagates a database failure instead of pretending the assignment was created', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValue(error);

    await expect(service.create(accountId, createInput())).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('propagates a database failure instead of reporting an empty assignment list', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValue(error);

    await expect(service.list(accountId)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports a missing scoped assignment as not found', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    query.mockResolvedValue({ rows: [] });

    const pending = service.getById(accountId, id);
    await expect(pending).rejects.toBeInstanceOf(NotFoundException);
    await expect(pending).rejects.toThrow('Entrega no encontrada');
    expect(query.mock.calls[0][1]).toEqual([accountId, id]);
  });

  it('propagates a database failure instead of reporting an assignment as missing', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValue(error);

    await expect(
      service.getById(accountId, '22222222-2222-4222-8222-222222222222'),
    ).rejects.toBe(error);
  });

  it('rejects an empty update before querying PostgreSQL', async () => {
    const pending = service.update(
      accountId,
      '22222222-2222-4222-8222-222222222222',
      {},
    );
    await expect(pending).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(pending).rejects.toThrow(
      'Indica estado o nota para actualizar',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('reports a missing scoped assignment as not found during an update', async () => {
    query.mockResolvedValue({ rows: [] });
    const pending = service.update(
      accountId,
      '22222222-2222-4222-8222-222222222222',
      { status: 'submitted' },
    );
    await expect(pending).rejects.toBeInstanceOf(NotFoundException);
    await expect(pending).rejects.toThrow('Entrega no encontrada');
  });

  it('propagates a database failure instead of reporting an update as completed', async () => {
    const error = new Error('Database unavailable');
    query.mockRejectedValue(error);

    await expect(
      service.update(accountId, '22222222-2222-4222-8222-222222222222', {
        grade: 8.75,
      }),
    ).rejects.toBe(error);
  });
});
