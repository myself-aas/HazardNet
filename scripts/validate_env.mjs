#!/usr/bin/env node
/**
 * Environment variable validation check for Firebase migration & HazardNet runtime.
 * Ensures required frontend VITE_FIREBASE_* and backend store configuration variables
 * are properly defined or have valid fallback configurations.
 */

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_FIREBASE_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
];

const RECOMMENDED_FIREBASE_VARS = [
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

function validateEnv() {
  console.log('🔍 Validating Firebase environment variables & configuration...');

  // 1. Check .env.example contains all required Firebase vars
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  if (fs.existsSync(envExamplePath)) {
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    const missingInExample = REQUIRED_FIREBASE_VARS.filter(
      (v) => !envExampleContent.includes(v)
    );
    if (missingInExample.length > 0) {
      console.error(
        `❌ .env.example is missing required declarations: ${missingInExample.join(', ')}`
      );
      process.exit(1);
    }
    console.log('  ✅ .env.example documents all required VITE_FIREBASE_* variables');
  }

  // 2. Validate frontend config.ts fallbacks and active environment bindings
  const configPath = path.resolve(process.cwd(), 'frontend/src/lib/config.ts');
  if (!fs.existsSync(configPath)) {
    console.error('❌ frontend/src/lib/config.ts missing');
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, 'utf8');
  for (const v of REQUIRED_FIREBASE_VARS) {
    if (!configContent.includes(v)) {
      console.error(`❌ frontend/src/lib/config.ts does not reference ${v}`);
      process.exit(1);
    }
  }
  console.log('  ✅ frontend/src/lib/config.ts properly maps all required Firebase variables');

  // 3. Validate FORECAST_STORE setting if provided
  const forecastStore = process.env.FORECAST_STORE || 'firestore';
  const validStores = ['firestore', 'local', 'memory', 'json'];
  if (!validStores.includes(forecastStore)) {
    console.error(
      `❌ Invalid FORECAST_STORE: "${forecastStore}". Allowed: ${validStores.join(', ')}`
    );
    process.exit(1);
  }
  console.log(`  ✅ FORECAST_STORE validated: "${forecastStore}"`);

  console.log('✅ Firebase environment variable validation passed successfully!');
}

validateEnv();
