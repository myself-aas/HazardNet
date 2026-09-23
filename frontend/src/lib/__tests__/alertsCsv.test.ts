/**
 * @jest-environment jsdom
 *
 * CSV export (Phase 5). A CSV from a hazard dashboard ends up quoted in a report, so
 * the rules tested here are about fidelity: no rounding, no reformatting, and escaping
 * that survives a driver list containing a comma.
 */

import { alertsToCsv, csvCell, downloadAlertsCsv, isFormulaLike } from '../alertsCsv';
import type { AlertRecord } from '../alerts';

const COLUMNS = [
  { key: 'id', header: 'alert_id' },
  { key: 'level', header: 'level' },
  { key: 'district_name', header: 'district' },
  { key: 'severity_score', header: 'severity_score' },
];

const alert = (over: Partial<AlertRecord> = {}): AlertRecord => ({
  id: 'a-1', state: 'PUBLISHED', level: 'WATCH', district_name: 'Sunamganj', severity_score: 0.9999,
  ...over,
});

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('Sunamganj')).toBe('Sunamganj');
    expect(csvCell(74)).toBe('74');
    expect(csvCell(0.9999)).toBe('0.9999'); // no rounding: the file is evidence
  });

  it('quotes and doubles anything RFC 4180 requires', () => {
    expect(csvCell('Comilla, Bangladesh')).toBe('"Comilla, Bangladesh"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('renders null and undefined as empty rather than as text', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('alertsToCsv', () => {
  it('writes a header row and one row per alert', () => {
    const csv = alertsToCsv([alert(), alert({ id: 'a-2', level: 'SEVERE' })], COLUMNS);
    const [header, first, second] = csv.split('\r\n');
    expect(header).toBe('alert_id,level,district,severity_score');
    expect(first).toBe('a-1,WATCH,Sunamganj,0.9999');
    expect(second).toBe('a-2,SEVERE,Sunamganj,0.9999');
  });

  it('keeps column order and empty fields aligned', () => {
    const csv = alertsToCsv([alert({ severity_score: null })], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe('a-1,WATCH,Sunamganj,');
  });

  it('writes a header even with no rows', () => {
    expect(alertsToCsv([], COLUMNS)).toBe('alert_id,level,district,severity_score');
  });
});

describe('downloadAlertsCsv', () => {
  it('builds a UTF-8 BOM blob and clicks a download anchor', () => {
    const click = jest.fn();
    const createObjectUrl = jest.fn(() => 'blob:test');
    const revokeObjectUrl = jest.fn();
    let anchor: { style: Record<string, unknown>; href?: string; download?: string; click: () => void };
    const doc = {
      createElement: () => {
        anchor = { style: {}, click: () => click() };
        return anchor;
      },
      body: { appendChild: jest.fn(), removeChild: jest.fn() },
    } as unknown as Document;

    const ok = downloadAlertsCsv([alert()], {
      filename: 'alerts.csv', columns: COLUMNS, createObjectUrl, revokeObjectUrl, documentRef: doc,
    });

    expect(ok).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test');
    expect(anchor!.download).toBe('alerts.csv');
    expect(anchor!.href).toBe('blob:test');
  });

  it('appends the .csv extension when the caller forgets it', () => {
    let download = '';
    const doc = {
      createElement: () => ({
        style: {},
        click: () => {},
        set download(v: string) { download = v; },
      }),
      body: { appendChild: jest.fn(), removeChild: jest.fn() },
    } as unknown as Document;
    downloadAlertsCsv([alert()], {
      filename: 'hazardnet-alerts', columns: COLUMNS, documentRef: doc,
      createObjectUrl: () => 'blob:x', revokeObjectUrl: () => {},
    });
    expect(download).toBe('hazardnet-alerts.csv');
  });

  it('returns false instead of throwing when there is no DOM or object URL', () => {
    expect(downloadAlertsCsv([alert()], {
      filename: 'a.csv', columns: COLUMNS, documentRef: undefined,
    })).toBe(false);
  });
});

describe('formula injection (Phase 6)', () => {
  // Phase 6 turned this from a nice-to-have into a tested rule: the export is opened in
  // Excel by people who did not write the data, and a leading '=' executes on open.
  const columns = [{ key: 'district_name' as const, header: 'district' }];
  const row = (district_name: string) => ([{ district_name }] as unknown as AlertRecord[]);
  const firstCell = (csv: string) => csv.split('\r\n')[1];

  it('neutralises every character a spreadsheet evaluates', () => {
    for (const payload of ['=1+1', '+1', '@SUM(A1)', '\tcmd', '\r=1']) {
      const cell = firstCell(alertsToCsv(row(payload), columns));
      expect(cell.startsWith("'") || cell.startsWith("\"'")).toBe(true);
    }
  });

  it('neutralises a DDE-style payload', () => {
    const csv = alertsToCsv(row('=cmd|\' /C calc\'!A0'), columns);
    expect(csv).toContain("'=cmd");
  });

  it('leaves plain numbers alone, including negative ones', () => {
    expect(csvCell(-12.4)).toBe('-12.4');
    expect(csvCell('-0.5')).toBe('-0.5');
    // ...but a leading minus that is not a number is treated as a formula.
    expect(csvCell('-2+3')).toBe("'-2+3");
  });

  it('still quotes a neutralised value that contains a comma', () => {
    const cell = firstCell(alertsToCsv(row('=x,y'), columns));
    // Neutralised *and* RFC 4180 quoted (the comma would otherwise shift the column).
    expect(cell).toBe("\"'=x,y\"");
  });

  it('exposes the same rule the backend escaper uses', () => {
    expect(isFormulaLike('=x')).toBe(true);
    expect(isFormulaLike('safe')).toBe(false);
    expect(isFormulaLike('')).toBe(false);
  });
});
