/**
 * Phase 7 — More-tab secondary features: camera submission queue, article
 * reader markdown parser, accessibility/settings wiring.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '../src/test/test-utils';
import { parseMarkdown } from '../src/components/articles/ArticleReader';
import { MoreScreen } from '../src/screens/more/MoreScreen';
import { flushQueue } from '../src/lib/reports/useReportQueue';

describe('Phase 7 Markdown parser', () => {
  it('parses headings, paragraphs, bullets and tables', () => {
    const md = `# Title

Hello **world** this is a paragraph.

## H2

- Item one
- Item two

| Col A | Col B |
|---|---|
| a1 | b1 |
| a2 | b2 |
`;
    const blocks = parseMarkdown(md);
    const types = blocks.map((b) => b.type);
    expect(types).toContain('h1');
    expect(types).toContain('h2');
    expect(types).toContain('p');
    expect(types).toContain('li');
    expect(types).toContain('table');
    const table = blocks.find((b) => b.type === 'table')!;
    expect(table.rows).toHaveLength(3); // header + 2 rows (separator row dropped)
    expect(table.rows![0]).toEqual(['Col A', 'Col B']);
  });

  it('handles empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});

describe('Phase 7 More screen lists secondary destinations', () => {
  it('shows Submit report, Data status, Notifications, Accessibility, and article rows', async () => {
    render(<MoreScreen />);
    await waitFor(() => expect(screen.getByText('Submit field report')).toBeTruthy());
    expect(screen.getByText('Data status')).toBeTruthy();
    expect(screen.getByText('Notification settings')).toBeTruthy();
    expect(screen.getByText('Accessibility')).toBeTruthy();
    expect(screen.getByText('About HazardNet')).toBeTruthy();
    expect(screen.getByText('Methodology')).toBeTruthy();
    expect(screen.getByText('Privacy')).toBeTruthy();
    expect(screen.getByText('Contact')).toBeTruthy();
  });
});

describe('Phase 7 offline report queue flush', () => {
  it('flushQueue is a function and resolves without throwing', async () => {
    // (Offline stub always throws without connection; queue persists statuses but does not crash.)
    // Use in-memory AsyncStorage from jest.setup.
    await expect(flushQueue()).resolves.toBeDefined();
  });
});
