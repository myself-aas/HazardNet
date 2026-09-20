#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {
  ensureDataLoaded,
  getEventsSummary,
} from '../backend/services/eventsService.js';

async function buildArtifacts() {
  console.log('⚡ Generating climatic hazards and forecast artifacts...');
  const publicDataDir = path.resolve(process.cwd(), 'frontend/public/data');
  if (!fs.existsSync(publicDataDir)) {
    fs.mkdirSync(publicDataDir, { recursive: true });
  }

  const { events, forecasts } = await ensureDataLoaded();
  console.log(`Loaded ${events.length} events and ${forecasts.length} forecast rows.`);

  // 1. Overall Summary
  const summary = await getEventsSummary();
  fs.writeFileSync(
    path.join(publicDataDir, 'climatic_hazards_summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // 2. Compact Events (all 3062 events)
  const compactEvents = events.map(e => ({
    id: e.id,
    glide: e.glide,
    date: e.date,
    year: e.year,
    month: e.month,
    district: e.district,
    division: e.division,
    lat: e.latitude,
    lng: e.longitude,
    hazard: e.hazardType,
    severity: e.severityScore,
    desc: e.description ? e.description.slice(0, 240) : '',
    affected: e.validatedAffected
  }));
  fs.writeFileSync(
    path.join(publicDataDir, 'climatic_hazards_events.json'),
    JSON.stringify(compactEvents)
  );

  // 3. Forecasts Latest JSON
  fs.writeFileSync(
    path.join(publicDataDir, 'hazardnet_forecasts_latest.json'),
    JSON.stringify(forecasts, null, 2)
  );

  // 4. Also copy the raw CSVs into frontend/public/data so direct HTTP fetch to the CSVs works
  const rawEventsCsv = path.resolve(process.cwd(), 'data/events/BGD_climatic_hazards_dataset_2000_2026.csv');
  const rawForecastsCsv = path.resolve(process.cwd(), 'data/hazardnet_forecasts_latest.csv');
  if (fs.existsSync(rawEventsCsv)) {
    fs.copyFileSync(rawEventsCsv, path.join(publicDataDir, 'BGD_climatic_hazards_dataset_2000_2026.csv'));
  }
  if (fs.existsSync(rawForecastsCsv)) {
    fs.copyFileSync(rawForecastsCsv, path.join(publicDataDir, 'hazardnet_forecasts_latest.csv'));
  }

  console.log('✅ Climatic data artifacts built successfully in frontend/public/data/');
}

buildArtifacts().catch((err) => {
  console.error('Error generating artifacts:', err);
  process.exit(1);
});
