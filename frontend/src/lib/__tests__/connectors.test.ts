// lib/connectors imports the real Supabase client (which reads
// import.meta.env — unavailable under the CJS jest transform); stub it.
jest.mock('../supabase', () => ({
  supabase: {},
  isSupabaseConfigured: false,
}))

import {
  CONNECTOR_CATALOG,
  CONNECTOR_CATEGORIES,
  CONNECTOR_KEYS,
  getConnector,
} from '../connectors'

describe('connector catalog', () => {
  it('has unique keys and full metadata for every connector', () => {
    expect(new Set(CONNECTOR_KEYS).size).toBe(CONNECTOR_CATALOG.length)
    for (const connector of CONNECTOR_CATALOG) {
      expect(connector.name).toBeTruthy()
      expect(connector.tagline.length).toBeGreaterThan(10)
      expect(CONNECTOR_CATEGORIES).toContain(connector.category)
      expect(connector.docsUrl).toMatch(/^https:/)
      expect(connector.accent).toMatch(/^#/)
    }
  })

  it('spans all four categories', () => {
    const used = new Set(CONNECTOR_CATALOG.map((connector) => connector.category))
    for (const category of CONNECTOR_CATEGORIES) {
      expect(used.has(category)).toBe(true)
    }
  })

  it('config-prompting connectors define a labeled ask', () => {
    for (const connector of CONNECTOR_CATALOG.filter((entry) => entry.asksFor)) {
      expect(connector.asksFor?.label).toBeTruthy()
      expect(connector.asksFor?.placeholder).toBeTruthy()
    }
  })

  it('getConnector resolves by key', () => {
    expect(getConnector('open_meteo')?.name).toBe('Open-Meteo')
    expect(getConnector('nonexistent')).toBeUndefined()
  })
})
