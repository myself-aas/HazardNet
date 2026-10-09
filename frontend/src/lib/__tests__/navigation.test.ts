import { DRAWER_SECTIONS, PRIMARY_LINKS, isPathCurrent, isConsoleTrack } from '../navigation';

const allItems = DRAWER_SECTIONS.flatMap((section) => section.items);

describe('navigation metadata', () => {
  it('gives the header exactly five plain-word links, in a stable order', () => {
    expect(PRIMARY_LINKS.map((link) => [link.label, link.path])).toEqual([
      ['Home', '/'],
      ['Forecasts', '/forecast/overview'],
      ['Alerts', '/alerts'],
      ['Advice', '/advisories'],
      ['Learn', '/docs'],
    ]);
  });

  it('keeps every label to one or two plain words (≤ 14 characters, no ampersand, no description, no badge)', () => {
    const labels = [
      ...PRIMARY_LINKS.map((link) => link.label),
      ...DRAWER_SECTIONS.map((section) => section.category),
      ...allItems.map((item) => item.title),
    ];
    const offenders = labels.filter((label) => label.trim().split(/\s+/).length > 2 || label.length > 14 || /[&/:()]/.test(label));
    expect(offenders).toEqual([]);
    for (const item of allItems) {
      expect(Object.keys(item)).not.toContain('description');
      expect(Object.keys(item)).not.toContain('badge');
    }
    // the typo the old menu shipped ("validation Validation") and its "9 Perils" badge must not come back
    expect(JSON.stringify(DRAWER_SECTIONS)).not.toMatch(/validation Validation|Perils|GIS|Bulletins|Matrix/);
  });

  it('keeps every id unique within its section, and gives the drawer four groups', () => {
    expect(DRAWER_SECTIONS.map((section) => section.category)).toEqual(['Explore', 'Advice', 'Data', 'Learn']);
    for (const section of DRAWER_SECTIONS) {
      expect(new Set(section.items.map((item) => item.id)).size).toBe(section.items.length);
    }
  });

  it('keeps every route that was reachable from the old header and drawer reachable from the new drawer', () => {
    const reachableBefore = [
      '/',
      '/live',
      '/forecast/overview',
      '/forecast/my-districts',
      '/forecast/compare',
      '/divisions',
      '/districts',
      '/hazards',
      '/alerts',
      '/advisories/crops',
      '/advisories/livestock',
      '/advisories/fisheries',
      '/advisories/health-wash',
      '/advisories/seasonal-calendar',
      '/advisories/emergency-response',
      '/docs',
      '/upload',
      '/download',
      '/blogs',
      '/about',
      '/contact',
      '/use-cases',
      '/status',
      '/model-performance',
      '/analytics/pipeline-status',
      '/analytics/model-metrics',
      '/analytics/historical',
    ];
    const paths = new Set(allItems.map((item) => item.path));
    expect(reachableBefore.filter((path) => !paths.has(path))).toEqual([]);
  });

  it('does not retarget the saved-districts heatmap side-effect', () => {
    expect(allItems.find((item) => item.id === 'saved')).toMatchObject({
      path: '/forecast/my-districts',
      extraAction: 'toggleHeatmap',
    });
  });

  it('treats / as exact and other paths as prefixes', () => {
    expect(isPathCurrent('/', '/')).toBe(true);
    expect(isPathCurrent('/live', '/')).toBe(false);
    expect(isPathCurrent('/alerts/abc', '/alerts')).toBe(true);
    expect(isPathCurrent('/forecast/overview', '/forecast')).toBe(true);
  });

  it('marks exactly one header link as current for the main routes', () => {
    const current = (pathname: string) => PRIMARY_LINKS.filter((link) => link.isCurrent(pathname)).map((link) => link.id);
    expect(current('/')).toEqual(['home']);
    expect(current('/live')).toEqual(['forecasts']);
    expect(current('/forecast/district/mymensingh')).toEqual(['forecasts']);
    expect(current('/alerts/x')).toEqual(['alerts']);
    expect(current('/advisories/crops')).toEqual(['advice']);
    expect(current('/docs')).toEqual(['learn']);
    expect(current('/status')).toEqual(['learn']);
    expect(current('/model-performance')).toEqual(['learn']);
  });

  describe('the console density track', () => {
    it('classifies every Dashboard and analytics route as console', () => {
      const consoleRoutes = [
        '/live',
        '/home',
        '/home/overview',
        '/forecast/overview',
        '/forecast/my-districts',
        '/forecast/compare',
        '/forecast/settings',
        '/settings',
        '/analytics',
        '/analytics/forecast-dashboard',
      ];
      for (const path of consoleRoutes) {
        expect(isConsoleTrack(path)).toBe(true);
      }
    });

    it('leaves the front door and the content routes editorial', () => {
      const editorialRoutes = [
        '/',
        '/about',
        '/docs',
        '/hazards',
        '/divisions',
        '/districts/dhaka',
        '/alerts',
        '/advisories/crops',
        '/blogs',
        '/login',
      ];
      for (const path of editorialRoutes) {
        expect(isConsoleTrack(path)).toBe(false);
      }
    });

    it('does not treat a lookalike prefix as console', () => {
      // Prefix matching has to stay segment-aware: `/settings` is a Dashboard
      // route, `/settingsx` is not a route at all.
      expect(isConsoleTrack('/settingsx')).toBe(false);
      expect(isConsoleTrack('/live-map')).toBe(false);
      expect(isConsoleTrack('/homes')).toBe(false);
      expect(isConsoleTrack('/analyticsx')).toBe(false);
    });
  });
});
