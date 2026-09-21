import { detectGroundingIntent, executeMapsGrounding, executeSearchGrounding } from '../backend/utils/gemini_grounding.js';
import { getDistrictCoordinates } from '../backend/utils/districtCoordinates.js';

describe('Gemini Grounding Engine', () => {
  describe('detectGroundingIntent', () => {
    test('detects Maps grounding intent for facility, office, and location queries', () => {
      expect(detectGroundingIntent('Where is the nearest Upazila Agriculture Office in Sunamganj?')).toBe('maps');
      expect(detectGroundingIntent('Find cyclone shelters near Cox\'s Bazar')).toBe('maps');
      expect(detectGroundingIntent('Veterinary hospital location in Kurigram')).toBe('maps');
      expect(detectGroundingIntent('Any query', 'maps')).toBe('maps');
    });

    test('detects Search grounding intent for real-time bulletins and weather status', () => {
      expect(detectGroundingIntent('What is the latest flood situation in Sylhet today?')).toBe('search');
      expect(detectGroundingIntent('Current BMD warning signal for Chittagong port')).toBe('search');
      expect(detectGroundingIntent('Recent river danger level bulletin from FFWC')).toBe('search');
      expect(detectGroundingIntent('Any query', 'search')).toBe('search');
    });

    test('defaults to auto/standard for general queries', () => {
      expect(detectGroundingIntent('How to treat foot rot disease in dairy cattle?')).toBe('auto');
      expect(detectGroundingIntent('Recommended fertilizer dosage for BRRI dhan51')).toBe('auto');
    });
  });

  describe('getDistrictCoordinates', () => {
    test('resolves coordinates for all major districts of Bangladesh', () => {
      const sunamganj = getDistrictCoordinates('sunamganj');
      expect(sunamganj.latitude).toBeCloseTo(25.0658, 2);
      expect(sunamganj.longitude).toBeCloseTo(91.3950, 2);

      const kurigram = getDistrictCoordinates('Kurigram');
      expect(kurigram.latitude).toBeCloseTo(25.8058, 2);
      expect(kurigram.longitude).toBeCloseTo(89.6361, 2);

      const coxsbazar = getDistrictCoordinates("Cox's Bazar");
      expect(coxsbazar.latitude).toBeCloseTo(21.4272, 2);
    });
  });

  describe('executeMapsGrounding — structure & fallback', () => {
    test('returns grounded facilities with verified Google Maps URLs', async () => {
      const result = await executeMapsGrounding({
        query: 'Find nearest Upazila Agriculture Office and cyclone shelter',
        district: 'Kurigram'
      });

      expect(result).toHaveProperty('answer');
      expect(result.groundingType).toBe('maps');
      expect(Array.isArray(result.facilities)).toBe(true);
      expect(result.facilities.length).toBeGreaterThan(0);

      const facility = result.facilities[0];
      expect(facility).toHaveProperty('title');
      expect(facility).toHaveProperty('uri');
      expect(facility.uri).toMatch(/^https:\/\/(www\.)?google\.com\/maps/);
      expect(result.coordinates).toBeDefined();
    });
  });

  describe('executeSearchGrounding — structure & fallback', () => {
    test('returns grounded sources with verified web URLs', async () => {
      const result = await executeSearchGrounding({
        query: 'Latest flood situation in Kurigram',
        district: 'Kurigram'
      });

      expect(result).toHaveProperty('answer');
      expect(result.groundingType).toBe('search');
      expect(Array.isArray(result.sources)).toBe(true);
      expect(result.sources.length).toBeGreaterThan(0);

      const source = result.sources[0];
      expect(source).toHaveProperty('title');
      expect(source).toHaveProperty('uri');
      expect(source.uri).toMatch(/^https?:\/\//);
    });
  });
});
