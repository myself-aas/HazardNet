/**
 * Zod Contracts & Schemas for HazardNet API & Core Data Objects
 */

import { z } from 'zod';

export const ForecastRowSchema = z.object({
  district_id: z.union([z.number(), z.string()]),
  district_name: z.string().min(1),
  horizon: z.string(),
  hazard_type: z.string().min(1),
  severity_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  target_date: z.string(),
  prediction_date: z.string(),
  temperature_mean: z.number().optional(),
  temperature_max: z.number().optional(),
  temperature_min: z.number().optional(),
  precipitation_mm: z.number().optional(),
  wind_max_kmh: z.number().optional(),
  dewpoint_mean: z.number().optional(),
  solar_radiation_mj_m2: z.number().optional(),
  evapotranspiration_mm: z.number().optional(),
  created_at: z.string().optional(),
  model_severity: z.number().optional(),
  physics_severity: z.number().optional(),
  division: z.string().optional(),
  pcode: z.string().optional(),
  dataset_version: z.string().optional(),
  admin_level: z.number().optional(),
  adm2_name: z.string().optional(),
  adm2_pcode: z.string().optional(),
});

export const AlertLevelSchema = z.enum(['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE']);

export const AlertItemSchema = z.object({
  id: z.string(),
  district_name: z.string(),
  hazard_type: z.string(),
  level: AlertLevelSchema,
  severity_score: z.number(),
  confidence: z.number(),
  prediction_date: z.string(),
  target_date: z.string(),
  horizon: z.string(),
  published_at: z.string().optional(),
  reviewed_by: z.string().optional(),
  state: z.string().optional(),
});

export type ForecastRowType = z.infer<typeof ForecastRowSchema>;
export type AlertLevelType = z.infer<typeof AlertLevelSchema>;
export type AlertItemType = z.infer<typeof AlertItemSchema>;
