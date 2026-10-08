/**
 * AdvisorySignalCard — the UI surface for the advisory columns the district table used to
 * drop (`advisory_tier`, `final_severity`, `model_severity_raw`, `physics_override`,
 * `prob_top1..3`, `latitude`/`longitude`, `data_source`, `model_version`).
 *
 * The fixture is a real row from the public advisory dataset
 * (https://www.kaggle.com/datasets/ashifahmedshuvo/hazardnet-weekly-forecasts) after the
 * mapper has renamed its columns, so this test fails if the parser and the component ever
 * disagree about what a published row looks like.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AdvisorySignalCard } from '../AdvisorySignalCard';
import type { ForecastRow } from '../../../lib/forecasts';

const ADVISORY_ROW: ForecastRow = {
  district_id: 40,
  district_name: 'Bagerhat',
  horizon: '7_days',
  hazard_type: 'Flash Flood',
  severity_score: 0.7638,
  confidence: 0.9829,
  target_date: '2026-10-06',
  prediction_date: '2026-09-29',
  model_severity: 0.7701,
  model_severity_raw: 0.9934,
  physics_severity: 0.4,
  final_severity: 0.7638,
  physics_override: false,
  advisory_tier: 'SEVERE',
  latitude: 22.3744,
  longitude: 89.739,
  prob_top1: 0.9829,
  prob_top2: 0.0081,
  prob_top3: 0.004,
  data_source: 'Kaggle_Daily_Advisory',
  model_version: '2.1.9',
};

describe('AdvisorySignalCard', () => {
  it('renders the published tier and every severity track the pipeline emits', () => {
    render(<AdvisorySignalCard rows={[ADVISORY_ROW]} horizon="7_days" districtName="Bagerhat" />);

    expect(screen.getByTestId('advisory-tier')).toHaveTextContent('Severe');
    // Published, not re-derived client-side — the whole point of carrying the column.
    expect(screen.getByText('Published tier')).toBeInTheDocument();

    // Four tracks: raw model output, calibrated model score, physics prior, and the blend.
    expect(screen.getByText('Model (raw)')).toBeInTheDocument();
    expect(screen.getByText('Model (calibrated)')).toBeInTheDocument();
    expect(screen.getByText('Physics track')).toBeInTheDocument();
    expect(screen.getByText('Final (fused)')).toBeInTheDocument();
    expect(screen.getAllByText('99%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('76%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0);
  });

  it('shows the ranked hazard distribution and the row provenance', () => {
    render(<AdvisorySignalCard rows={[ADVISORY_ROW]} horizon="7_days" />);

    expect(screen.getByText('Ranked hazard distribution')).toBeInTheDocument();
    expect(screen.getByText('98.3%')).toBeInTheDocument();
    expect(screen.getByText(/Kaggle_Daily_Advisory/)).toBeInTheDocument();
    expect(screen.getByText(/22\.3744, 89\.7390/)).toBeInTheDocument();
  });

  it('says so when the tier was derived locally rather than published', () => {
    const { advisory_tier: _omitted, ...withoutTier } = ADVISORY_ROW;
    render(<AdvisorySignalCard rows={[withoutTier]} horizon="7_days" />);

    // 0.76 is well above the WATCH band and the card still answers WATCH. That is the policy,
    // not a rounding choice: an unlabelled score cannot be promoted past the auto-publish
    // ceiling, because WARNING and SEVERE require a named duty officer. The card says the tier
    // was derived here, so nothing reads as the pipeline's own judgement.
    expect(screen.getByTestId('advisory-tier')).toHaveTextContent('Watch');
    expect(screen.getByText('Derived locally')).toBeInTheDocument();
  });

  it('renders nothing when the horizon has no records', () => {
    const { container } = render(<AdvisorySignalCard rows={[]} horizon="15_days" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only what a pre-advisory row carries, without inventing a tier', () => {
    const legacy: ForecastRow = {
      district_id: 19,
      district_name: 'Dhaka',
      horizon: '7_days',
      hazard_type: 'Flood',
      severity_score: 0.5,
      confidence: 0.9,
      target_date: '2026-09-19',
      prediction_date: '2026-09-12',
    };
    render(<AdvisorySignalCard rows={[legacy]} horizon="7_days" />);

    expect(screen.getByText('Final (fused)')).toBeInTheDocument();
    expect(screen.queryByText('Model (raw)')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranked hazard distribution')).not.toBeInTheDocument();
    expect(screen.getByText('Derived locally')).toBeInTheDocument();
  });
});
