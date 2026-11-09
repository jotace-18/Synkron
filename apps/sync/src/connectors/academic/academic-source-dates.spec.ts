import { isCalendarDate, isTimestamp } from './academic-source-dates';

describe('Academic source dates', () => {
  describe('isCalendarDate', () => {
    it.each(['2026-11-24', '2024-02-29', '2000-02-29', '0099-01-01'])(
      'accepts the real calendar day %s without inventing a time',
      (value) => {
        expect(isCalendarDate(value)).toBe(true);
      },
    );

    it.each([
      null,
      undefined,
      20261124,
      '',
      '2026-02-29',
      '1900-02-29',
      '2026-02-30',
      '2026-04-31',
      '2026-13-01',
      '2026-00-01',
      '2026-01-00',
      '0000-01-01',
      '2026-1-01',
      '2026-11-24T00:00:00Z',
    ])(
      'rejects a nonexistent day or unexpected representation: %s',
      (value) => {
        expect(isCalendarDate(value)).toBe(false);
      },
    );
  });

  describe('isTimestamp', () => {
    it.each([
      '2026-11-24T23:59:00Z',
      '2026-11-24T23:59:00.123Z',
      '2026-11-24T23:59:00.1+01:00',
      '2026-11-24T23:59:00.12-05:30',
      '2024-02-29T00:00:00+14:00',
    ])('accepts an explicit instant with timezone: %s', (value) => {
      expect(isTimestamp(value)).toBe(true);
    });

    it.each([
      null,
      undefined,
      1795564800000,
      '',
      '2026-11-24',
      '2026-11-24T23:59:00',
      '2026-02-30T10:00:00Z',
      '2026-02-29T10:00:00Z',
      '2026-11-24T24:00:00Z',
      '2026-11-24T23:60:00Z',
      '2026-11-24T23:59:60Z',
      '2026-11-24T10:00:00+24:00',
      '2026-11-24T10:00:00+01:60',
      '0000-01-01T10:00:00Z',
      '2026-11-24 10:00:00Z',
    ])('rejects an invalid or ambiguous instant: %s', (value) => {
      expect(isTimestamp(value)).toBe(false);
    });
  });
});
