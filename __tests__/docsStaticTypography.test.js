import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const prerender = readFileSync(join(ROOT, 'frontend/scripts/prerender.mjs'), 'utf8');

describe('documentation static typography', () => {
  it('does not apply negative letter spacing to static body, tables, figures or disclosures', () => {
    const styleBlock = prerender.match(/const STATIC_STYLES = `<style>([\s\S]*?)<\/style>`;/)?.[1];
    expect(styleBlock).toBeTruthy();

    const rules = [...styleBlock.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const bodyRules = rules.filter(([, selector]) =>
      selector.includes('.hn-static') && /(?:^|\s)(?:p|li|td|th|summary|caption|dd|dt)(?:[,\s.:#]|$)/.test(selector),
    );
    for (const [, , declarations] of bodyRules) {
      expect(declarations).not.toMatch(/letter-spacing\s*:\s*-/i);
    }
  });

  it('keeps static-shell tracking declarations positive and explicit', () => {
    const declarations = [...prerender.matchAll(/letter-spacing\s*:\s*([^;}]+)/g)].map((match) => match[1].trim());
    expect(declarations.length).toBeGreaterThan(0);
    expect(declarations.every((value) => !value.startsWith('-'))).toBe(true);
  });
});
