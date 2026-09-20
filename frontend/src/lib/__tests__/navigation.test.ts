import {
  DESKTOP_LINKS,
  DESKTOP_MENUS,
  DRAWER_SECTIONS,
  isPathCurrent,
} from '../navigation';

describe('navigation metadata', () => {
  it('keeps desktop Home destinations at / and /live', () => {
    const home = DESKTOP_MENUS.find((menu) => menu.id === 'home');
    expect(home?.items.map((item) => [item.title, item.path])).toEqual([
      ['Overview', '/'],
      ['Live map & GIS console', '/live'],
    ]);
  });

  it('does not retarget locate-me or forecast lookup paths', () => {
    const knowledge = DESKTOP_MENUS.find((menu) => menu.id === 'docs');
    expect(knowledge?.items.find((item) => item.id === 'upload')?.path).toBe('/upload');
    expect(DRAWER_SECTIONS.flatMap((section) => section.items).map((item) => item.path)).toContain(
      '/forecast/my-districts'
    );
  });

  it('treats / as exact and other paths as prefixes', () => {
    expect(isPathCurrent('/', '/')).toBe(true);
    expect(isPathCurrent('/live', '/')).toBe(false);
    expect(isPathCurrent('/alerts/abc', '/alerts')).toBe(true);
    expect(isPathCurrent('/forecast/overview', '/forecast')).toBe(true);
  });

  it('marks desktop section triggers from the current pathname', () => {
    const home = DESKTOP_MENUS.find((menu) => menu.id === 'home')!;
    expect(home.isCurrent('/')).toBe(true);
    expect(home.isCurrent('/live')).toBe(true);
    expect(home.isCurrent('/docs')).toBe(false);

    const alerts = DESKTOP_LINKS.find((link) => link.id === 'alerts')!;
    expect(alerts.isCurrent('/alerts/x')).toBe(true);
  });
});
