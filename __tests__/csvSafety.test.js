/**
 * @jest-environment node
 *
 * Phase 6 (SEC-08): CSV formula-injection safety for the server-side exports.
 *
 * The rule lives in `backend/utils/csvSafety.js` and is used by the forecast history
 * export; `frontend/src/lib/alertsCsv.ts` implements the same rule for the browser
 * export. These tests pin the rule itself and the two output paths that use it.
 */

import { csvEscape, isFormulaLike } from '../backend/utils/csvSafety.js';
import { historyRowsToCsv } from '../backend/utils/forecastServe.js';

describe('isFormulaLike', () => {
  it('flags the characters a spreadsheet evaluates', () => {
    for (const payload of ['=1+1', '+1', '@SUM(A1)', '\tcmd', '\r=1']) {
      expect(isFormulaLike(payload)).toBe(true);
    }
  });

  it('does not flag plain text or plain numbers', () => {
    for (const payload of ['Sunamganj', '78.9', '-12.4', '-0.5', '']) {
      expect(isFormulaLike(payload)).toBe(false);
    }
  });

  it('treats a leading minus as dangerous only when it is not a number', () => {
    expect(isFormulaLike('-2+3')).toBe(true);
    expect(isFormulaLike('-1.2e-3')).toBe(false);
  });
});

describe('csvEscape', () => {
  it('neutralises a formula payload', () => {
    expect(csvEscape('=HYPERLINK("http://x","go")')).toBe('"\'=HYPERLINK(""http://x"",""go"")"');
    expect(csvEscape('=1+1')).toBe("'=1+1");
  });

  it('keeps RFC 4180 quoting for ordinary values', () => {
    expect(csvEscape('Sylhet, BD')).toBe('"Sylhet, BD"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe('');
  });
});

describe('the forecast history export', () => {
  it('cannot emit a live formula from a row value', () => {
    const csv = historyRowsToCsv([
      {
        district_name: '=cmd|\' /C calc\'!A0',
        hazard_type: '+1+1',
        severity_score: -12.4,
        division: 'Sylhet',
      },
    ]);
    const body = csv.split('\n')[1];
    expect(body).toContain("'=cmd");
    expect(body).toContain("'+1+1");
    expect(body).toContain('-12.4'); // numbers keep their value
    expect(body).not.toMatch(/(^|,)=/);
  });
});
