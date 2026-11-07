import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ArticlePage from '../ArticlePage';

function renderDocs(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ArticlePage path={path} />
    </MemoryRouter>,
  );
}

describe('documentation articles', () => {
  it('renders the hub as data-driven topics, quantitative reference, figures and FAQs', async () => {
    const { container } = renderDocs('/docs');

    expect(await screen.findByRole('heading', { level: 1, name: 'HazardNet documentation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /01 The platform/ })).toHaveAttribute('href', '/docs/platform');
    expect(screen.getByText('N = D × H = 64 × 15 = 960')).toBeInTheDocument();
    const charts = Array.from(container.querySelectorAll('svg[role="img"]'));
    expect(charts).toHaveLength(2);
    charts.forEach((chart) => {
      expect(chart).toHaveAttribute('aria-labelledby');
      expect(chart).toHaveAttribute('aria-describedby');
    });
    expect(screen.getAllByRole('heading', { name: /Master baseline rows by hazard type/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { name: /Master-baseline rows by recorded year/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Questions and answers' })).toBeInTheDocument();
    expect(screen.getByText(/correlations involving either field are undefined or uninformative/i)).toBeInTheDocument();
  });

  it('provides an article table of contents and accessible chart data for the forecast analysis', async () => {
    renderDocs('/docs/forecasts');

    expect(await screen.findByRole('heading', { level: 1, name: 'Reading a forecast' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'A worked statistical example from run v47' }).some((link) => link.getAttribute('href') === '#docs-5-a-worked-statistical-example-from-run-v47')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Severity values in the v47 snapshot' })).toBeInTheDocument();
    expect(screen.getByText('View chart values as a table')).toBeInTheDocument();
    expect(screen.getAllByText('Population standard deviation').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Pearson r: target date vs daily mean').length).toBeGreaterThan(1);
    expect(screen.getAllByText(/Severity has zero variance, so the correlation denominator is zero/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/all 960 severity values in the named 2026-11-06 snapshot are 0.30/i)).toBeInTheDocument();
    expect(screen.getByText(/the snapshot publishes tier=WATCH on every row/i)).toBeInTheDocument();
  });

  it('keeps published alert labels separate from severity fallback bands', async () => {
    renderDocs('/docs/alerts-and-advisories');

    expect(await screen.findByRole('heading', { name: 'The four published platform labels' })).toBeInTheDocument();
    expect(screen.getByText(/used only when no published tier or alert level is available/i)).toBeInTheDocument();
    expect(screen.getByText(/not probabilities, impact thresholds or official warning levels/i)).toBeInTheDocument();
  });

  it('keeps undefined historical correlations distinct from zero', async () => {
    renderDocs('/docs/archive');

    expect(await screen.findByRole('heading', { level: 1, name: 'The historical archive' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Correlation matrix and zero-variance fields' })).toBeInTheDocument();
    expect(screen.getByText(/null means not estimable, not zero/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Master-baseline rows by recorded year/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the published correlations artifact' })).toHaveAttribute('href', '/data/historical/correlations.json');
  });

  it.each([
    ['/docs/platform', 'The HazardNet platform'],
    ['/docs/hazards', 'The eight hazard classes'],
    ['/docs/districts', 'District and division coverage'],
    ['/docs/alerts-and-advisories', 'Alert levels and advisories'],
    ['/docs/data-and-api', 'Data, downloads and the API'],
    ['/docs/verification', 'Validation status'],
  ])('renders %s with a TOC and FAQ', async (path, title) => {
    renderDocs(path);

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'On this page' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Questions and answers' })).toBeInTheDocument();
  });
});
