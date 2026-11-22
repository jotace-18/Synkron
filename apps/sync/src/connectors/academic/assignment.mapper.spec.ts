import { BadGatewayException } from '@nestjs/common';
import { mapAcademicAssignment } from './assignment.mapper';
import type { AcademicAssignmentSource } from './assignment-source.types';

describe('mapAcademicAssignment', () => {
  const connectionId = '2c6cd1d6-bc01-461e-b9c1-cfe268cd6246';

  function assignment(): AcademicAssignmentSource {
    return {
      id: 'd1903b29-d126-4c48-9bbf-226cf0829309',
      title: 'Entrega de prácticas',
      course_name: 'Cloud Computing',
      course_abbreviation: 'CC',
      section: 'practice',
      mandatory: true,
      due_date: '2026-11-24',
      due_at: null,
      status: 'pending',
      work_mode: 'individual',
      group_members: [],
      weight_percent: null,
      weight_basis: null,
      grade: null,
      created_at: '2026-11-08T19:00:00.000Z',
      updated_at: '2026-11-08T19:00:00.000Z',
      deleted_at: null,
    };
  }

  it('maps an active assignment into the common model without inventing a deadline time', () => {
    const source = assignment();
    expect(mapAcademicAssignment(connectionId, source)).toEqual({
      action: 'upsert',
      activity: {
        source_connection_id: connectionId,
        source_collection: 'assignments',
        external_id: source.id,
        type: 'academic.assignment',
        title: 'Entrega de prácticas',
        schedule: {
          kind: 'date',
          role: 'deadline',
          date: '2026-11-24',
          at: null,
          end_at: null,
        },
        status: 'pending',
        details: {
          course_name: 'Cloud Computing',
          course_abbreviation: 'CC',
          section: 'practice',
          mandatory: true,
          work_mode: 'individual',
          group_members: [],
          weight_percent: null,
          weight_basis: null,
          grade: null,
        },
        source_updated_at: '2026-11-08T19:00:00.000Z',
      },
    });
  });

  it.each([
    ['2026-11-24T23:59:00+01:00', '2026-11-24T22:59:00.000Z'],
    ['2026-11-24T23:59:00-05:00', '2026-11-25T04:59:00.000Z'],
    ['2026-11-24T23:59:00Z', '2026-11-24T23:59:00.000Z'],
  ])('normalizes an instant deadline %s to UTC', (due_at, expected) => {
    const result = mapAcademicAssignment(connectionId, {
      ...assignment(),
      due_date: null,
      due_at,
    });
    if (result.action !== 'upsert') throw new Error('Expected upsert');
    expect(result.activity.schedule).toEqual({
      kind: 'instant',
      role: 'deadline',
      date: null,
      at: expected,
      end_at: null,
    });
  });

  it.each(['pending', 'in_progress', 'submitted'])(
    'preserves the source status %s',
    (status) => {
      const result = mapAcademicAssignment(connectionId, {
        ...assignment(),
        status,
      });
      if (result.action !== 'upsert') throw new Error('Expected upsert');
      expect(result.activity.status).toBe(status);
    },
  );

  it('distinguishes unknown optional data from false and zero', () => {
    const result = mapAcademicAssignment(connectionId, {
      ...assignment(),
      mandatory: false,
      course_abbreviation: null,
      grade: 0,
      weight_percent: 0,
      weight_basis: 'section',
    });
    if (result.action !== 'upsert') throw new Error('Expected upsert');
    expect(result.activity.details).toMatchObject({
      mandatory: false,
      course_abbreviation: null,
      grade: 0,
      weight_percent: 0,
      weight_basis: 'section',
    });
  });

  it('retains the source identity when its title, grade and status change', () => {
    const before = mapAcademicAssignment(connectionId, assignment());
    const after = mapAcademicAssignment(connectionId, {
      ...assignment(),
      title: 'Entrega revisada',
      grade: 8.75,
      status: 'submitted',
      updated_at: '2026-11-09T12:00:00Z',
    });
    if (before.action !== 'upsert' || after.action !== 'upsert') {
      throw new Error('Expected upserts');
    }
    expect(after.activity).toMatchObject({
      source_connection_id: before.activity.source_connection_id,
      source_collection: before.activity.source_collection,
      external_id: before.activity.external_id,
      title: 'Entrega revisada',
      status: 'submitted',
      source_updated_at: '2026-11-09T12:00:00.000Z',
      details: { grade: 8.75 },
    });
  });

  it('preserves the textual external ID and distinguishes two source connections', () => {
    const source = { ...assignment(), id: assignment().id.toUpperCase() };
    const otherConnection = '5076083c-f740-4f7e-9297-f1feeb1c0a89';
    const first = mapAcademicAssignment(connectionId, source);
    const second = mapAcademicAssignment(otherConnection, source);
    if (first.action !== 'upsert' || second.action !== 'upsert') {
      throw new Error('Expected upserts');
    }
    expect(first.activity.external_id).toBe(source.id);
    expect(second.activity.external_id).toBe(source.id);
    expect(first.activity.source_connection_id).toBe(connectionId);
    expect(second.activity.source_connection_id).toBe(otherConnection);
  });

  it('normalizes the source modification time without using the import time', () => {
    const result = mapAcademicAssignment(connectionId, {
      ...assignment(),
      updated_at: '2026-11-09T12:30:00+01:00',
    });
    if (result.action !== 'upsert') throw new Error('Expected upsert');
    expect(result.activity.source_updated_at).toBe('2026-11-09T11:30:00.000Z');
  });

  it('selects only authorized details instead of copying arbitrary source fields', () => {
    const source = {
      ...assignment(),
      token: 'private-token',
      account_id: 'source-owner',
      tenant_id: 'untrusted-owner',
      details: { injected: true },
      authorization: 'Bearer private-token',
      internal_note: 'private-note',
    };
    expect(mapAcademicAssignment(connectionId, source)).toEqual(
      mapAcademicAssignment(connectionId, assignment()),
    );
  });

  it('copies group members without changing or sharing the source array', () => {
    const source = {
      ...assignment(),
      work_mode: 'group',
      group_members: ['Ana', 'Luis'],
    };
    const result = mapAcademicAssignment(connectionId, source);
    if (result.action !== 'upsert') throw new Error('Expected upsert');
    expect(result.activity.details.group_members).toEqual(['Ana', 'Luis']);
    expect(result.activity.details.group_members).not.toBe(
      source.group_members,
    );
    source.group_members.push('María');
    expect(result.activity.details.group_members).toEqual(['Ana', 'Luis']);
  });

  it('produces the same normalized result for repeated imports of the same source data', () => {
    expect(mapAcademicAssignment(connectionId, assignment())).toEqual(
      mapAcademicAssignment(connectionId, assignment()),
    );
  });

  it('maps an explicit deletion to a retirement instruction with the same source identity', () => {
    const source = {
      ...assignment(),
      updated_at: '2026-11-09T12:00:00+01:00',
      deleted_at: '2026-11-09T12:00:00+01:00',
      token: 'private-token',
    };
    expect(mapAcademicAssignment(connectionId, source)).toEqual({
      action: 'retire',
      source_connection_id: connectionId,
      source_collection: 'assignments',
      external_id: source.id,
      source_updated_at: '2026-11-09T11:00:00.000Z',
      source_deleted_at: '2026-11-09T11:00:00.000Z',
    });
  });

  it.each([
    null,
    { ...assignment(), due_date: null, due_at: null },
    { ...assignment(), grade: 8.751 },
    { ...assignment(), weight_percent: 25, weight_basis: null },
    { ...assignment(), deleted_at: '2026-02-30T10:00:00Z' },
  ])(
    'rejects invalid source data before producing an import instruction: %j',
    (source) => {
      expect(() => mapAcademicAssignment(connectionId, source)).toThrow(
        BadGatewayException,
      );
    },
  );
});
