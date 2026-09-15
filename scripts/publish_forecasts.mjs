#!/usr/bin/env node
// No HTTP server, bearer key, browser credentials, or repository writes needed.
import fs from 'node:fs';
import { getAdminDb } from '../backend/admin.js';
import { publishForecasts } from '../backend/forecastPublication.js';

const file = process.argv[2] || '.forecast-run/publication.json';
const publication = JSON.parse(fs.readFileSync(file, 'utf8'));
const result = await publishForecasts(getAdminDb(), publication);
console.log(JSON.stringify(result));
