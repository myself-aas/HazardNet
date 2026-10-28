import '@testing-library/jest-dom';
/// <reference types="jest" />

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import HazardIndex, { type HazardIndexItem } from '../HazardIndex';
import { resetLanguageForTests } from '../../../lib/i18n';

const hazards: HazardIndexItem[] = [
  {
    slug: 'flood',
    class: 'Flood',
    season: 'June–September (monsoon); peak in July–August',
    summary: 'Riverine and monsoon flooding, scored from how much rain falls and how hard it falls.',
  },
  {
    slug: 'tropical-cyclone',
    class: 'Tropical Cyclone',
    season: 'April–May and October–November; the post-monsoon window is the more destructive',
    summary: 'Wind-driven coastal hazard: sustained wind above 50 km/h, with the rain it carries.',
  },
];

const renderIndex = () =>
  render(
    <MemoryRouter>
      <HazardIndex hazards={hazards} />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests('en');
});

describe('the front-door hazard index', () => {
  it('keeps every class in page flow as a direct link, with no view mode to operate', () => {
    renderIndex();

    expect(screen.getAllByRole('listitem')).toHaveLength(hazards.length);
    expect(screen.getByRole('link', { name: /Flood/ })).toHaveAttribute('href', '/hazards/flood');
    expect(screen.getByRole('link', { name: /Tropical Cyclone/ })).toHaveAttribute(
      'href',
      '/hazards/tropical-cyclone',
    );

    // The distilled index has no Shelf/Grid switch, shelf scroll buttons, or quick-action
    // detours repeated from the hero and status strip.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Report Hazard|Regional Dashboard|Live GIS Console/ })).not.toBeInTheDocument();
  });

  it('localises class names in Bengali while marking methodology data as English fallback', () => {
    resetLanguageForTests('bn');
    const { container } = renderIndex();

    expect(screen.getByRole('link', { name: /বন্যা/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ঘূর্ণিঝড়/ })).toBeInTheDocument();
    expect(container.textContent).toContain('সক্রিয় মৌসুম');

    const flood = screen.getByRole('link', { name: /বন্যা/ });
    expect(within(flood).getByText(/Riverine and monsoon flooding/)).toHaveAttribute('lang', 'en');
    expect(within(flood).getByText(/June–September/)).toHaveAttribute('lang', 'en');
  });
});
