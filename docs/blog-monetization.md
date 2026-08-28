# Blog Monetization Guide (AdSense, Affiliate & Passive Income)

HazardNet's blog (`/blogs` + `/blogs/:slug`) is the **only** monetized surface.
This guide covers what is already wired in the code and the playbook for
growing passive income from it.

---

## 1 · What's already implemented

### Google AdSense (blogs pages only)
- `frontend/src/lib/adsense.ts` + `frontend/src/components/blog/ads/BlogAdUnit.tsx`.
- The AdSense loader script is injected **only** on `/blogs` and `/blogs/:slug`
  — never on the map, dashboard or auth pages (keeps Core Web Vitals and the
  AdSense "site quality" review clean).
- Ad placements:
  | Slot | Where | Env var |
  | --- | --- | --- |
  | Index display | `/blogs`, between live articles and the archive | `VITE_ADSENSE_SLOT_BLOG_INDEX` |
  | In-article fluid | `/blogs/:slug`, after the 3rd content block | `VITE_ADSENSE_SLOT_ARTICLE_INLINE` |
  | End-of-article rectangle | `/blogs/:slug`, after tags/author box | `VITE_ADSENSE_SLOT_ARTICLE_FOOTER` |

**Go-live checklist**
1. Apply at [google.com/adsense](https://www.google.com/adsense/) with
   `hazardnet.live`. Have ≥20 quality articles published first.
2. Set env vars on Vercel: `VITE_ADSENSE_CLIENT=ca-pub-…` plus the three slot
   ids. Redeploy. The loader only ships once the client id exists.
3. Replace the placeholder in `frontend/public/ads.txt` with your numeric
   publisher id (`google.com, pub-XXXX…, DIRECT, f08c47fec0942fa0`).
4. Verify `ads.txt` resolves at the domain root (Vercel serves `public/`).
5. When the CSP in `vercel.json` flips from Report-Only to enforcing, add
   `https://pagead2.googlesyndication.com` to `script-src`,
   `https://googleads.g.doubleclick.net` to `connect-src`, and
   `https://googleads.g.doubleclick.net https://*.google.com` to `frame-src`.
6. Until configured, editors see dashed "dev placeholder" boxes in local dev
   only — production renders nothing.

### Affiliate readiness (Google & FTC compliant)
- The editor has an **affiliate-link toolbar button** that inserts
  `rel="sponsored nofollow noopener"` links automatically.
- Toggle **"Contains affiliate links"** per article → a disclosure notice
  renders at the top of the article and every outbound link is tagged
  `rel="sponsored nofollow"` (Google's affiliate guideline; keeps PageRank
  honest so SEO doesn't suffer).
- Editable disclosure text per article (defaults to a compliant template).

### SEO for Google Search Console (already wired)
- Per-article: SEO title, meta description, focus keyword, canonical URL,
  og:image, robots noindex, FAQ builder — with a **Google SERP preview** and a
  **live 13-point SEO checklist** (keyword placement, lengths, subheadings,
  internal/external links, alt text, word count ≥600).
- Article + FAQPage **JSON-LD structured data** is emitted automatically →
  eligible for rich results / "People also ask".
- `robots.txt` ships from `public/` (dashboard/profile/auth disallowed).

---

## 2 · Submit to Google Search Console

1. Add property `https://hazardnet.live` (Domain property recommended).
2. Verify via DNS TXT (Vercel domain) — one-time.
3. Submit sitemap: generate one from the `blog_articles` table (a scheduled
   GitHub Action or Supabase Edge Function writing `public/sitemap.xml` is the
   simplest path; the URL set is `/blogs` + every published `/blogs/:slug`).
4. Use **URL Inspection → Request Indexing** for each new article on publish
   day; GSC Performance reports then show queries/CTR per article — feed the
   winning queries back into the focus-keyword field.

---

## 3 · Affiliate programs that fit this audience

Bangladesh agri-climate audience (farmers, NGO coordinators, DAE officers,
researchers, agri-business). Apply once traffic ≈ 500+ monthly readers:

| Program | Fit | Typical payout |
| --- | --- | --- |
| **Amazon Associates** | Weather stations, soil-moisture meters, drip-irrigation kits, agri drones books | 1–4.5% |
| **Daraz Affiliate (AliExpress/Alibaba network)** | Bangladesh-relevant consumer agri-tech | up to ~7% |
| **Impact / CJ / ShareASale** | Solar pumps, sensors, weather gear brands (AcuRite, Davis Instruments, Netatmo) | 5–15% |
| **AliExpress Portals** | Cheap IoT sensors for student/fab-lab readers | 3–9% |
| ** agri-input startups (iFarmer, Agroshift, Fashol—ask for direct deals)** | Seeds/fertilizer/advisory bundles | flat CPA or 5–10% |
| **Web-hosting/data affiliates** (Cloudways, DigitalOcean) | For the "build your own pipeline" engineering posts | $50–150/signup |
| **Online-course affiliates** (Coursera GIS/satellite-remote-sensing, Udacity) | Researcher audience | 10–30% |

Content formats that convert: gear round-ups ("5 soil moisture sensors tested
in Barind conditions"), tool tutorials with tracked links, "what our field kit
contains" posts.

---

## 4 · Other passive income streams (ranked by effort→return)

1. **Newsletter sponsorship** — a monthly "Hazard Digest" (district outlooks)
   with one sponsor slot (agri-input companies, insurers). Start free
   (Buttondown/Mailchimp), charge ৳5–15k/sponsor once >1,000 subscribers.
2. **Sponsored / partner articles** — NGOs, development projects (World Bank
   gear-ups, FAO, BRAC) pay for technical case-study write-ups. Mark
   `containsAffiliateLinks`-style disclosure (use the same notice).
3. **Premium PDF reports** — sell downloadable "District Hazard Dossiers"
   (seasonal compilation per district) via Gumroad/Payoneer-linked checkout.
   Content exists already — just packaged.
4. **Ezoic / Mediavine upgrade path** — once >10k sessions/month, Ezoic
   typically beats raw AdSense 1.5–3×; Mediavine (50k sessions) much more.
   The ad slots already in place swap straight over.
5. **GitHub Sponsors / Buy Me a Coffee** — "support open climate research"
   widget on the blog footer; near-zero effort, works from day one.
6. **Affiliate API access** — for researcher readers, affiliate-link the data
   tools the articles use (Sentinel Hub paid tiers, Google Earth Engine
   books/courses).
7. **Job board / consultancy leads** — "Hire the field team" page fed by blog
   authority; a single NGO consulting contract outweighs a year of AdSense.
8. **Webinar replays** — free live webinar, paid replay + certificate
   (partners: agricultural universities, DAE training units).

### Realistic sequencing
- **0–3 months:** SEO checklist on every post, GSC indexing, no ads yet
  (approval odds improve with content depth).
- **3–6 months:** AdSense approval → enable the three slots; join Amazon
  Associates + Daraz; add GitHub Sponsors.
- **6–12 months:** newsletter + sponsor outreach; test Ezoic against AdSense;
  launch one paid district dossier and measure.
