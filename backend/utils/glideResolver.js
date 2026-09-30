/**
 * backend/utils/glideResolver.js
 *
 * Implements Multilateral GLIDE Link Resolution Algorithm (TRD §2.5, §5.2, §6.4)
 */

export const GLIDE_REGEX = /^[A-Z]{2}-\d{4}-\d{6}-[A-Z]{3}$/;

/**
 * Generate multilateral disaster response links from an official GLIDE identifier.
 *
 * @param {string} glideId - Official GLIDE identifier (e.g., FL-2026-000109-BGD)
 * @returns {object} Object with links to ReliefWeb, FAO GIEWS, WHO Emergency, ADRC, and IFRC GO
 * @throws {Error} If GLIDE format does not conform to ^[A-Z]{2}-\d{4}-\d{6}-[A-Z]{3}$
 */
export function generateGlideLinks(glideId) {
  if (!glideId || typeof glideId !== 'string') {
    throw new Error('GLIDE identifier must be a non-empty string');
  }

  const clean = glideId.trim();
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
  generateGlideLinks,
  GLIDE_REGEX,
};
