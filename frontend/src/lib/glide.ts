/**
 * frontend/src/lib/glide.ts
 *
 * Client-side Multilateral GLIDE Link Resolution Algorithm (TRD §2.5, §5.2, §6.4)
 */

export const GLIDE_REGEX = /^[A-Z]{2}-\d{4}-\d{6}-[A-Z]{3}$/;

export interface MultilateralGlideLinks {
  reliefweb: string;
  fao_giews: string;
  who_emergencies: string;
  adrc_registry: string;
  ifrc_go: string;
}

export function isValidGlide(glideId: string): boolean {
  if (!glideId || typeof glideId !== 'string') return false;
  return GLIDE_REGEX.test(glideId.trim());
}

/**
 * Generate multilateral disaster response links from an official GLIDE identifier.
 */
export function generateGlideLinks(glideId: string): MultilateralGlideLinks {
  const clean = (glideId || '').trim();
  if (!GLIDE_REGEX.test(clean)) {
    throw new Error(`Invalid GLIDE format: ${glideId}`);
  }

  return {
    reliefweb: `https://reliefweb.int/disaster/${encodeURIComponent(clean)}`,
    fao_giews: 'https://www.fao.org/giews/countrybrief/country.jsp?code=BGD',
    who_emergencies: 'https://extranet.who.int/public-emergencies',
    adrc_registry: `https://www.glidenumber.net/glide/public/search/search.jsp?glide=${encodeURIComponent(clean)}`,
    ifrc_go: `https://go.ifrc.org/emergencies?search=${encodeURIComponent(clean)}`,
  };
}

export default {
  GLIDE_REGEX,
  isValidGlide,
  generateGlideLinks,
};
