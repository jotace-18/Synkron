import { activityContentHash } from './activity-content-hash';
import type { ActivityInput, JsonValue } from './activity.types';

describe('activityContentHash', () => {
  function activity(): ActivityInput {
    return {
      source_connection_id: '2c6cd1d6-bc01-461e-b9c1-cfe268cd6246',
      source_collection: 'assignments',
      external_id: 'd1903b29-d126-4c48-9bbf-226cf0829309',
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
      details: { grade: null, mandatory: true, group_members: [] },
      source_updated_at: '2026-11-08T19:00:00.000Z',
    };
  }

  it('returns a SHA-256 hexadecimal digest compatible with the database constraint', () => {
    expect(activityContentHash(activity())).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same digest for repeated reads of the same content', () => {
    expect(activityContentHash(activity())).toBe(
      activityContentHash(activity()),
    );
  });

  const contentChanges: [string, Partial<ActivityInput>][] = [
    ['title', { title: 'Entrega revisada' }],
    ['type', { type: 'academic.exam' }],
    ['status', { status: 'submitted' }],
    ['unknown status', { status: null }],
    [
      'date',
      {
        schedule: {
          kind: 'date',
          role: 'deadline',
          date: '2026-11-25',
          at: null,
          end_at: null,
        },
      },
    ],
    [
      'time role',
      {
        schedule: {
          kind: 'date',
          role: 'start',
          date: '2026-11-24',
          at: null,
          end_at: null,
        },
      },
    ],
    ['grade', { details: { grade: 8.75, mandatory: true, group_members: [] } }],
    [
      'mandatory flag',
      { details: { grade: null, mandatory: false, group_members: [] } },
    ],
    [
      'new detail',
      {
        details: {
          grade: null,
          mandatory: true,
          group_members: [],
          course_name: 'CC',
        },
      },
    ],
    ['removed detail', { details: { grade: null, mandatory: true } }],
  ];

  it.each(contentChanges)(
    'changes the digest when the normalized %s changes',
    (_name, change) => {
      expect(activityContentHash({ ...activity(), ...change })).not.toBe(
        activityContentHash(activity()),
      );
    },
  );

  it('distinguishes a date without a time from an instant at midnight', () => {
    const instant: ActivityInput = {
      ...activity(),
      schedule: {
        kind: 'instant',
        role: 'deadline',
        date: null,
        at: '2026-11-24T00:00:00.000Z',
        end_at: null,
      },
    };
    expect(activityContentHash(instant)).not.toBe(
      activityContentHash(activity()),
    );
  });

  it('detects changes to the start of an instant', () => {
    const first: ActivityInput = {
      ...activity(),
      schedule: {
        kind: 'instant',
        role: 'deadline',
        date: null,
        at: '2026-11-24T12:00:00.000Z',
        end_at: null,
      },
    };
    const second: ActivityInput = {
      ...first,
      schedule: {
        kind: 'instant',
        role: 'deadline',
        date: null,
        at: '2026-11-24T13:00:00.000Z',
        end_at: null,
      },
    };
    expect(activityContentHash(first)).not.toBe(activityContentHash(second));
  });

  it('detects changes to the end of an interval', () => {
    const first: ActivityInput = {
      ...activity(),
      schedule: {
        kind: 'interval',
        role: 'start',
        date: null,
        at: '2026-11-24T12:00:00.000Z',
        end_at: '2026-11-24T14:00:00.000Z',
      },
    };
    const second: ActivityInput = {
      ...first,
      schedule: {
        kind: 'interval',
        role: 'start',
        date: null,
        at: '2026-11-24T12:00:00.000Z',
        end_at: '2026-11-24T15:00:00.000Z',
      },
    };
    expect(activityContentHash(first)).not.toBe(activityContentHash(second));
  });

  it.each([null, '2026-11-09T12:00:00.000Z'])(
    'ignores a change to the source technical timestamp: %s',
    (source_updated_at) => {
      expect(activityContentHash({ ...activity(), source_updated_at })).toBe(
        activityContentHash(activity()),
      );
    },
  );

  it('keeps identity separate from content comparison', () => {
    const otherIdentity: ActivityInput = {
      ...activity(),
      source_connection_id: 'another-connection',
      source_collection: 'another-collection',
      external_id: 'another-record',
    };
    expect(activityContentHash(otherIdentity)).toBe(
      activityContentHash(activity()),
    );
  });

  it('ignores central identifiers and import timestamps if passed with a stored record', () => {
    const stored = {
      ...activity(),
      id: 'central-id',
      tenant_id: 'owner-id',
      created_at: '2026-11-09T12:00:00Z',
      updated_at: '2026-11-09T12:00:00Z',
      last_synced_at: '2026-11-09T12:00:00Z',
      content_hash: 'old-hash',
    };
    expect(activityContentHash(stored)).toBe(activityContentHash(activity()));
  });

  it('ignores object key order recursively, including objects inside arrays', () => {
    const first = {
      ...activity(),
      details: {
        alpha: 1,
        nested: { first: true, second: null },
        list: [{ x: 1, y: 2 }],
      },
    };
    const second = {
      ...activity(),
      details: {
        list: [{ y: 2, x: 1 }],
        nested: { second: null, first: true },
        alpha: 1,
      },
    };
    expect(activityContentHash(first)).toBe(activityContentHash(second));
  });

  it('detects changes deep inside nested details', () => {
    const first = { ...activity(), details: { nested: { grade: 8.75 } } };
    const second = { ...activity(), details: { nested: { grade: 9 } } };
    expect(activityContentHash(first)).not.toBe(activityContentHash(second));
  });

  it('preserves list order when comparing content', () => {
    const first = {
      ...activity(),
      details: { group_members: ['Ana', 'Luis'] },
    };
    const second = {
      ...activity(),
      details: { group_members: ['Luis', 'Ana'] },
    };
    expect(activityContentHash(first)).not.toBe(activityContentHash(second));
  });

  const distinctValues: [JsonValue, JsonValue][] = [
    [null, 0],
    [null, false],
    [0, false],
    ['0', 0],
    ['null', null],
    [[], {}],
  ];
  it.each(distinctValues)(
    'distinguishes different JSON values (%j and %j)',
    (first, second) => {
      expect(
        activityContentHash({ ...activity(), details: { value: first } }),
      ).not.toBe(
        activityContentHash({ ...activity(), details: { value: second } }),
      );
    },
  );

  it('escapes delimiters in strings instead of confusing them with object fields', () => {
    const first = { ...activity(), details: { a: 'b,c:d' } };
    const second = { ...activity(), details: { a: 'b', c: 'd' } };
    expect(activityContentHash(first)).not.toBe(activityContentHash(second));
  });

  it('does not modify the activity or sort source lists in place', () => {
    const source = {
      ...activity(),
      details: { z: 'último', members: ['Luis', 'Ana'], a: null },
    };
    const before = JSON.stringify(source);
    activityContentHash(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});
