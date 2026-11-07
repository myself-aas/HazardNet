import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const prerender = readFileSync(join(ROOT, 'frontend/scripts/prerender.mjs'), 'utf8');
const appleStyles = readFileSync(join(ROOT, 'frontend/src/styles/apple.css'), 'utf8');
const radiusSources = [
  'frontend/src/components/ArticlePage.tsx',
  'frontend/src/components/ReportTemplate.tsx',
  'frontend/src/components/docs/DocsVisuals.tsx',
  'frontend/src/pages/ReportsPage.tsx',
  'frontend/src/pages/ReportsArchivePage.tsx',
].map((path) => readFileSync(join(ROOT, path), 'utf8'));

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

  it('uses only radii published by the global Apple geometry tokens', () => {
    const styleBlock = prerender.match(/const STATIC_STYLES = `<style>([\s\S]*?)<\/style>`;/)?.[1];
    expect(styleBlock).toBeTruthy();
    const tokenRadii = new Set(
      [...appleStyles.matchAll(/--ap-radius-[\w-]+\s*:\s*([^;]+);/g)].map((match) => match[1].trim()),
    );
    const staticRadii = [...styleBlock.matchAll(/border-radius\s*:\s*([^;}]+)/g)].map((match) => match[1].trim());

    expect(staticRadii.length).toBeGreaterThan(0);
    staticRadii.forEach((radius) => expect(tokenRadii).toContain(radius));
  });

  it('does not use Tailwind radius utilities that are absent from the global theme', () => {
    const unsupported = radiusSources.flatMap((source) => source.match(/\brounded-ap-[\w-]+/g) ?? []);
    expect(unsupported).toEqual([]);
  });
});
