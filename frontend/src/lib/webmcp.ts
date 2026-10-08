/**
 * WebMCP — Expose HazardNet tools to AI agents via the browser.
 *
 * Registers tools with the WebMCP API (document.modelContext.registerTool)
 * so browser agents can interact with HazardNet's key actions: searching
 * districts, retrieving forecasts, viewing alerts, and navigating pages.
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 * Chrome blog: https://developer.chrome.com/blog/webmcp-epp
 */

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
}

interface ModelContextLike {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => Promise<unknown>;
}

/**
 * Get the ModelContext API, preferring document.modelContext over navigator.modelContext.
 */
function getModelContext(): ModelContextLike | null {
  // Prefer the spec-compliant location
  const docCtx = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
  if (docCtx && typeof docCtx.registerTool === 'function') {
    return docCtx;
  }
  // Fall back to the older Chrome build location
  const navCtx = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;
  if (navCtx && typeof navCtx.registerTool === 'function') {
    return navCtx;
  }
  return null;
}

/**
 * Fetch JSON from the HazardNet API with error handling.
 */
async function fetchApi(path: string): Promise<unknown> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Register all HazardNet tools with the WebMCP API.
 */
export function registerWebMCPTools(): void {
  const ctx = getModelContext();
  if (!ctx) {
    // WebMCP not supported in this browser — that's fine, tools just won't be available
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[webmcp] Model Context API not available in this browser');
    }
    return;
  }

  // AbortController for unregistering all tools on page unload
  const ac = new AbortController();

  // Clean up tools when the page is unloaded
  window.addEventListener('pagehide', () => ac.abort(), { once: true });

  // ──────────────────────────────────────────────────────────────────────
  // Tool 1: search-district
  // Search for a Bangladesh district by name and navigate to its page.
  // ──────────────────────────────────────────────────────────────────────
  ctx.registerTool(
    {
      name: 'search-district',
      title: 'Search District',
      description:
        'Search for a district in Bangladesh by name and navigate to its hazard outlook page. ' +
        'Returns the district name, division, and a link to its detailed forecast page.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'District name or partial name to search for (e.g., "Dhaka", "Chittagong")',
          },
        },
        required: ['query'],
      },
      execute: async (input) => {
        const q = String(input.query || '').toLowerCase().trim();
        if (!q) return { error: 'Please provide a district name to search for.' };

        try {
          // Fetch the districts list from the content index
          const data = (await fetchApi('/data/content-index.json')) as {
            routes?: Array<{ path: string; title: string }>;
          };
          const districts = (data.routes || []).filter(
            (r) => r.path.startsWith('/districts/') && r.path !== '/districts'
          );

          // Fuzzy match against district names in the path
          const matches = districts
            .filter((r) => {
              const name = r.path.replace('/districts/', '').replace(/-/g, ' ');
              return name.includes(q) || r.title.toLowerCase().includes(q);
            })
            .slice(0, 5);

          if (matches.length === 0) {
            return {
              found: false,
              message: `No districts matching "${input.query}" were found. Try a different spelling.`,
            };
          }

          // Navigate to the first match
          const first = matches[0];
          window.location.href = first.path;

          return {
            found: true,
            district: first.title,
            path: first.path,
            url: `https://www.hazardnet.live${first.path}`,
            message: `Navigating to ${first.title}.`,
            otherMatches: matches.slice(1).map((m) => ({ name: m.title, path: m.path })),
          };
        } catch (err) {
          return { error: `Failed to search districts: ${(err as Error).message}` };
        }
      },
    },
    { signal: ac.signal }
  );

  // ──────────────────────────────────────────────────────────────────────
  // Tool 2: get-forecast
  // Retrieve the current hazard forecast for a district.
  // ──────────────────────────────────────────────────────────────────────
  ctx.registerTool(
    {
      name: 'get-forecast',
      title: 'Get Hazard Forecast',
      description:
        'Get the current multi-hazard forecast for a Bangladesh district. Returns hazard class, ' +
        'severity index, confidence, and physics cross-check for each horizon (7-day and 15-day).',
      inputSchema: {
        type: 'object',
        properties: {
          district: {
            type: 'string',
            description: 'District name (e.g., "Dhaka", "Chattogram", "Rajshahi")',
          },
          hazard: {
            type: 'string',
            description:
              'Optional hazard filter: flood, flash-flood, tropical-cyclone, drought, heat-wave, cold-wave, fire, severe-local-storm',
          },
        },
        required: ['district'],
      },
      execute: async (input) => {
        try {
          const data = (await fetchApi('/data/forecasts-latest.json')) as Record<string, unknown>;
          return {
            district: input.district,
            hazardFilter: input.hazard || null,
            forecast: data,
            note: 'Full forecast data returned. Filter by district name and hazard class in the response.',
          };
        } catch (err) {
          return { error: `Failed to retrieve forecast: ${(err as Error).message}` };
        }
      },
    },
    { signal: ac.signal }
  );

  // ──────────────────────────────────────────────────────────────────────
  // Tool 3: get-alerts
  // Retrieve current published hazard alerts.
  // ──────────────────────────────────────────────────────────────────────
  ctx.registerTool(
    {
      name: 'get-alerts',
      title: 'Get Hazard Alerts',
      description:
        'Get the current published hazard alerts for Bangladesh. Returns alert levels, ' +
        'affected districts, drivers, and review status for each active alert.',
      inputSchema: {
        type: 'object',
        properties: {
          hazard: {
            type: 'string',
            description: 'Optional: filter by hazard class',
          },
          level: {
            type: 'string',
            description: 'Optional: filter by alert level (WATCH, WARNING, DANGER)',
          },
        },
      },
      execute: async (input) => {
        try {
          const data = (await fetchApi('/data/alerts-latest.json')) as Record<string, unknown>;
          return {
            hazardFilter: input.hazard || null,
            levelFilter: input.level || null,
            alerts: data,
            source: 'https://www.hazardnet.live/alerts',
          };
        } catch (err) {
          return { error: `Failed to retrieve alerts: ${(err as Error).message}` };
        }
      },
    },
    { signal: ac.signal }
  );

  // ──────────────────────────────────────────────────────────────────────
  // Tool 4: navigate-to-page
  // Navigate to a specific page on the HazardNet site.
  // ──────────────────────────────────────────────────────────────────────
  ctx.registerTool(
    {
      name: 'navigate-to-page',
      title: 'Navigate to Page',
      description:
        'Navigate to a specific page on the HazardNet website. Available pages include: ' +
        '/ (home), /alerts, /hazards, /districts, /advisories, /docs, /status, /about, ' +
        '/blogs, /contact, /use-cases, /data-sources, /model-performance, /download.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The page path to navigate to (e.g., "/alerts", "/hazards", "/districts")',
          },
        },
        required: ['path'],
      },
      execute: async (input) => {
        const targetPath = String(input.path || '').trim();
        if (!targetPath) return { error: 'Please provide a page path to navigate to.' };

        // Normalize the path
        const normalized = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;

        // Navigate
        window.location.href = normalized;

        return {
          navigated: true,
          path: normalized,
          url: `https://www.hazardnet.live${normalized}`,
          message: `Navigating to ${normalized}`,
        };
      },
    },
    { signal: ac.signal }
  );

  // ──────────────────────────────────────────────────────────────────────
  // Tool 5: get-site-status
  // Get the current status of HazardNet's data sources and artifacts.
  // ──────────────────────────────────────────────────────────────────────
  ctx.registerTool(
    {
      name: 'get-site-status',
      title: 'Get Site Status',
      description:
        'Get the current operational status of HazardNet data sources. Returns freshness of ' +
        'each artifact (forecasts, alerts, weather data) and whether they are within their SLO.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const data = (await fetchApi('/data/freshness.json')) as Record<string, unknown>;
          return {
            status: data,
            source: 'https://www.hazardnet.live/status',
          };
        } catch (err) {
          return { error: `Failed to retrieve status: ${(err as Error).message}` };
        }
      },
    },
    { signal: ac.signal }
  );

  // ──────────────────────────────────────────────────────────────────────
  // Tool 6: get-hazard-info
  // Get methodology and information about a specific hazard class.
  // ──────────────────────────────────────────────────────────────────────
  ctx.registerTool(
    {
      name: 'get-hazard-info',
      title: 'Get Hazard Information',
      description:
        'Get methodology, drivers, confidence semantics, and limits for a specific hazard class. ' +
        'Available hazards: flood, flash-flood, tropical-cyclone, drought, heat-wave, cold-wave, fire, severe-local-storm.',
      inputSchema: {
        type: 'object',
        properties: {
          hazard: {
            type: 'string',
            description:
              'Hazard class: flood, flash-flood, tropical-cyclone, drought, heat-wave, cold-wave, fire, or severe-local-storm',
            enum: [
              'flood',
              'flash-flood',
              'tropical-cyclone',
              'drought',
              'heat-wave',
              'cold-wave',
              'fire',
              'severe-local-storm',
            ],
          },
        },
        required: ['hazard'],
      },
      execute: async (input) => {
        const hazard = String(input.hazard || '').trim();
        if (!hazard) return { error: 'Please provide a hazard class.' };

        // Navigate to the hazard page
        const hazardPath = `/hazards/${hazard}`;
        window.location.href = hazardPath;

        return {
          hazard,
          path: hazardPath,
          url: `https://www.hazardnet.live${hazardPath}`,
          message: `Navigating to the ${hazard} methodology page.`,
        };
      },
    },
    { signal: ac.signal }
  );

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[webmcp] Registered 6 tools with Model Context API');
  }
}

// Auto-register on module load
registerWebMCPTools();
