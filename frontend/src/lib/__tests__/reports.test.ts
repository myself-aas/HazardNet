import { isValidReportDate } from '../reports';

describe('report date validation', () => {
  it('accepts strict ISO calendar dates', () => {
    expect(isValidReportDate('2026-11-07')).toBe(true);
    expect(isValidReportDate('2024-02-29')).toBe(true);
  });

  it('rejects malformed and impossible dates before a report path is built', () => {
    expect(isValidReportDate('2026-2-7')).toBe(false);
    expect(isValidReportDate('2026-13-01')).toBe(false);
    expect(isValidReportDate('2026-02-29')).toBe(false);
    expect(isValidReportDate('../../archive')).toBe(false);
  });
});
