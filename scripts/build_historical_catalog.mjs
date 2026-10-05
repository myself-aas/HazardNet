/**
 * scripts/build_historical_catalog.mjs
 *
 * Implements TASK-015: Historical Data Bundling & Catalog Generator (TRD §2.4, §4.8)
 *
 * Ingests 5 analytical CSVs:
 * 1. BGD_climatic_hazards_dataset_2000_2026.csv (exact 3,062 rows)
 * 2. hazardnet_district_vulnerability_index.csv (exact 64 districts)
 * 3. HazardNet_Master_Dataset_Final.csv (70 master events)
 * 4. hazardnet_yearly_temporal_trends.csv (2000–2026 temporal trajectory)
 * 5. hazardnet_hazard_type_analysis.csv (proportional distribution)
 *
 * Emits optimized JSON files to frontend/public/data/historical/:
 * - districts-vulnerability.json
 * - temporal-trends.json
 * - hazard-distribution.json
 * - events-master.json
 * - hazard-catalog-index.json
 */

import fs from 'node:fs';
import path from 'node:path';

export const GLIDE_REGEX = /^[A-Z]{2}-\d{4}-\d{6}-(BGD|[A-Z]{3})$/;

export function generateGlideLinks(glideId) {
  if (!glideId || glideId === 'N/A' || !GLIDE_REGEX.test(glideId)) {
    return {
      reliefweb: null,
      fao_giews: 'https://www.fao.org/giews/countrybrief/country.jsp?code=BGD',
      who_emergencies: 'https://extranet.who.int/public-emergencies',
      adrc_registry: null,
      ifrc_go: null,
    };
  }

  return {
    reliefweb: `https://reliefweb.int/disaster/${encodeURIComponent(glideId)}`,
    fao_giews: 'https://www.fao.org/giews/countrybrief/country.jsp?code=BGD',
    who_emergencies: 'https://extranet.who.int/public-emergencies',
    adrc_registry: `https://www.glidenumber.net/glide/public/search/search.jsp?glide=${encodeURIComponent(glideId)}`,
    ifrc_go: `https://go.ifrc.org/emergencies?search=${encodeURIComponent(glideId)}`,
  };
}

/** Robust CSV parser supporting quotes, commas, and multiline cells */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let inQuotes = false;
  let cur = '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim());
      cur = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      cur += c;
    }
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

export function locateSourceDirectory() {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'historical-sources'),
    path.resolve(process.cwd(), 'manuscript', 'kaggle-notebooks', '1-HazardNet_BGD_climatic_hazards', '1-HazardNet_BGD_climatic_hazards'),
    path.resolve(process.cwd(), 'kaggle-notebooks', '1-HazardNet_BGD_climatic_hazards', '1-HazardNet_BGD_climatic_hazards'),
    path.resolve(process.cwd(), 'manuscript', 'kaggle-notebooks', '1-HazardNet_BGD_climatic_hazards'),
    path.resolve(process.cwd(), 'backend', 'data', 'historical'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, 'hazardnet_district_vulnerability_index.csv'))) {
      return c;
    }
  }

  throw new Error(`Could not locate historical CSV directory. Checked: ${candidates.join(', ')}`);
}

export function buildHistoricalCatalog(options = {}) {
  const sourceDir = options.sourceDir || locateSourceDirectory();
  const outputDir = options.outputDir || path.resolve(process.cwd(), 'frontend', 'public', 'data', 'historical');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Ingest hazardnet_district_vulnerability_index.csv
  const vulnPath = path.join(sourceDir, 'hazardnet_district_vulnerability_index.csv');
  const vulnRaw = fs.readFileSync(vulnPath, 'utf8');
  const vulnRows = parseCsv(vulnRaw);
  const vulnHeader = vulnRows[0];
  const vulnData = vulnRows.slice(1);

  if (vulnData.length !== 64) {
    throw new Error(`Expected exactly 64 districts in vulnerability index, found ${vulnData.length}`);
  }

  const districtsVulnerability = vulnData.map((row, idx) => ({
    rank: idx + 1,
    district: row[0],
    unique_hazard_types: parseInt(row[1], 10) || 0,
    total_events: parseInt(row[2], 10) || 0,
    avg_severity: parseFloat(row[3]) || 0.0,
    cumulative_affected: parseFloat(row[4]) || 0.0,
    vulnerability_score: parseFloat(row[5]) || 0.0,
  }));

  // Sort by vulnerability_score descending
  districtsVulnerability.sort((a, b) => b.vulnerability_score - a.vulnerability_score);
  districtsVulnerability.forEach((d, idx) => { d.rank = idx + 1; });

  // 2. Ingest hazardnet_yearly_temporal_trends.csv
  const trendsPath = path.join(sourceDir, 'hazardnet_yearly_temporal_trends.csv');
  const trendsRaw = fs.readFileSync(trendsPath, 'utf8');
  const trendsRows = parseCsv(trendsRaw);
  const temporalTrends = trendsRows.slice(1).map((row) => ({
    year: parseInt(row[0], 10),
    event_frequency: parseInt(row[1], 10) || 0,
    annual_affected_population: parseFloat(row[2]) || 0.0,
  })).sort((a, b) => a.year - b.year);

  // 3. Ingest hazardnet_hazard_type_analysis.csv
  const hazardAnalysisPath = path.join(sourceDir, 'hazardnet_hazard_type_analysis.csv');
  const hazardRaw = fs.readFileSync(hazardAnalysisPath, 'utf8');
  const hazardRows = parseCsv(hazardRaw);
  const totalEventsSum = hazardRows.slice(1).reduce((acc, r) => acc + (parseInt(r[1], 10) || 0), 0);

  const hazardDistribution = hazardRows.slice(1).map((row) => {
    const count = parseInt(row[1], 10) || 0;
    return {
      hazard_type: row[0],
      event_count: count,
      percentage: totalEventsSum > 0 ? Math.round((count / totalEventsSum) * 1000) / 10 : 0,
      mean_severity: parseFloat(row[2]) || 0.0,
      std_severity: parseFloat(row[3]) || 0.0,
      max_severity: parseFloat(row[4]) || 0.0,
      total_affected: parseFloat(row[5]) || 0.0,
    };
  }).sort((a, b) => b.event_count - a.event_count);

  // 4. Ingest HazardNet_Master_Dataset_Final.csv
  const masterPath = path.join(sourceDir, 'HazardNet_Master_Dataset_Final.csv');
  const masterRaw = fs.readFileSync(masterPath, 'utf8');
  const masterRows = parseCsv(masterRaw);
  const masterHeader = masterRows[0];
  const masterData = masterRows.slice(1);

  const eventsMaster = masterData.map((row) => {
    const glide = row[1];
    return {
      event_id: parseInt(row[0], 10) || row[0],
      glide,
      date: row[2],
      year: parseInt(row[3], 10) || parseInt(String(row[2]).slice(0, 4), 10),
      hazard_type: row[4],
      hazard_class: row[5],
      location_districts: row[6] ? row[6].split('|').map((s) => s.trim()) : [],
      full_description: row[9] || '',
      gee_start: row[10] || null,
      gee_end: row[11] || null,
      ifrc_severity: row[12] || null,
      gdacs_active_alert: parseInt(row[14], 10) || 0,
      validated_affected: parseFloat(row[16]) || 0.0,
      links: generateGlideLinks(glide),
    };
  });

  // 5. Ingest BGD_climatic_hazards_dataset_2000_2026.csv
  const catalogPath = path.join(sourceDir, 'BGD_climatic_hazards_dataset_2000_2026.csv');
  const catalogRaw = fs.readFileSync(catalogPath, 'utf8');
  const catalogRows = parseCsv(catalogRaw);
  const catalogData = catalogRows.slice(1);

  if (catalogData.length !== 3062) {
    throw new Error(`Expected exactly 3,062 rows in BGD_climatic_hazards_dataset_2000_2026.csv, found ${catalogData.length}`);
  }

  const hazardCatalogIndex = catalogData.map((row) => ({
    id: row[0],
    glide: row[1],
    date: row[2],
    year: parseInt(String(row[2]).slice(0, 4), 10),
    district: row[3],
    latitude: parseFloat(row[4]) || 0.0,
    longitude: parseFloat(row[5]) || 0.0,
    hazard_type: row[6],
    gee_start: row[7],
    gee_end: row[8],
    severity_index_name: row[9],
    severity_score: parseFloat(row[10]) || 0.0,
    validated_affected: parseFloat(row[11]) || 0.0,
    summary: (row[12] || '').slice(0, 200),
  }));

  // 6. Ingest hazardnet_general_summary_stats.csv — the national baseline
  // headline stats the PRD promises (Metric,Value pairs). Values stay as
  // authored strings; a numeric twin is added when the value parses, so the
  // UI can render tabular figures without re-parsing prose.
  const statsPath = path.join(sourceDir, 'hazardnet_general_summary_stats.csv');
  let nationalSummary = { metrics: [] };
  if (fs.existsSync(statsPath)) {
    const statsRows = parseCsv(fs.readFileSync(statsPath, 'utf8'));
    nationalSummary = {
      metrics: statsRows.slice(1)
        .filter((row) => row[0])
        .map((row) => {
          const numeric = Number(row[1]);
          return {
            metric: row[0],
            value: row[1] ?? '',
            ...(Number.isFinite(numeric) && row[1] !== '' ? { numeric } : {}),
          };
        }),
    };
  }

  // 7. Ingest hazardnet_statistical_correlations.csv — a Pearson matrix over
  // Severity_Score / Validated_Affected / Latitude / Longitude. Empty upper
  // triangle cells become null; the UI renders the lower triangle only.
  const corrPath = path.join(sourceDir, 'hazardnet_statistical_correlations.csv');
  let correlations = { variables: [], matrix: [] };
  if (fs.existsSync(corrPath)) {
    const corrRows = parseCsv(fs.readFileSync(corrPath, 'utf8'));
    const variables = corrRows[0].slice(1).filter(Boolean);
    correlations = {
      variables,
      matrix: corrRows.slice(1).filter((row) => row[0]).map((row) =>
        variables.map((_, colIdx) => {
          const cell = (row[colIdx + 1] ?? '').trim();
          if (cell === '') return null;
          const num = Number(cell);
          return Number.isFinite(num) ? num : null;
        }),
      ),
    };
  }

  // 8. Cross-validate HazardNet_Events_For_GEE.csv against the 3,062-row
  // archive: same schema, so every GEE hand-off row must agree with the
  // catalog on GLIDE, district, hazard and the GEE observation window.
  // Drift is reported, never silently absorbed.
  const geePath = path.join(sourceDir, 'HazardNet_Events_For_GEE.csv');
  let geeValidation = null;
  if (fs.existsSync(geePath)) {
    const geeRows = parseCsv(fs.readFileSync(geePath, 'utf8')).slice(1);
    const byId = new Map(hazardCatalogIndex.map((row) => [row.id, row]));
    let matched = 0;
    const mismatches = [];
    for (const row of geeRows) {
      const [id, glide, date, district, lat, lng, hazard, geeStart, geeEnd] = row;
      const twin = byId.get(id);
      if (!twin) {
        mismatches.push({ id, field: 'missing_in_catalog' });
        continue;
      }
      const drift =
        twin.glide !== glide ? 'glide'
        : twin.district !== district ? 'district'
        : twin.hazard_type !== hazard ? 'hazard_type'
        : twin.gee_start !== geeStart ? 'gee_start'
        : twin.gee_end !== geeEnd ? 'gee_end'
        : null;
      if (drift) mismatches.push({ id, field: drift });
      else matched += 1;
    }
    geeValidation = {
      gee_rows: geeRows.length,
      catalog_rows: hazardCatalogIndex.length,
      matched,
      mismatched: mismatches.length,
      sample_mismatches: mismatches.slice(0, 10),
    };
  }

  // Write all artifacts to outputDir
  const artifacts = [
    { filename: 'national-summary.json', data: nationalSummary },
    { filename: 'correlations.json', data: correlations },
    ...(geeValidation ? [{ filename: 'gee-validation.json', data: geeValidation }] : []),
    { filename: 'districts-vulnerability.json', data: districtsVulnerability },
    { filename: 'temporal-trends.json', data: temporalTrends },
    { filename: 'hazard-distribution.json', data: hazardDistribution },
    { filename: 'events-master.json', data: eventsMaster },
    { filename: 'hazard-catalog-index.json', data: hazardCatalogIndex },
  ];

  for (const art of artifacts) {
    const filePath = path.join(outputDir, art.filename);
    fs.writeFileSync(filePath, JSON.stringify(art.data, null, 2), 'utf8');
    console.log(`[historical-catalog] Wrote ${art.filename} (${art.data.length} items) -> ${filePath}`);
  }

  // Also mirror to dist if dist exists
  const distHistoricalDir = path.resolve(process.cwd(), 'dist', 'data', 'historical');
  if (fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    fs.mkdirSync(distHistoricalDir, { recursive: true });
    for (const art of artifacts) {
      fs.writeFileSync(path.join(distHistoricalDir, art.filename), JSON.stringify(art.data, null, 2), 'utf8');
    }
  }

  return {
    districtsVulnerabilityCount: districtsVulnerability.length,
    temporalTrendsCount: temporalTrends.length,
    hazardDistributionCount: hazardDistribution.length,
    eventsMasterCount: eventsMaster.length,
    hazardCatalogIndexCount: hazardCatalogIndex.length,
  };
}

// CLI Execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  try {
    const summary = buildHistoricalCatalog();
    console.log('[historical-catalog] Successfully bundled all historical hazard artifacts:', summary);
  } catch (err) {
    console.error('[historical-catalog] Build failed:', err);
    process.exit(1);
  }
}
