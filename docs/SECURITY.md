# Security Policy — HazardNet

Version: 4.1 · Updated: 2026-09-29  
Companion documents: `docs/PRD.md`, `docs/TRD.md`, `PUBLICATION_POLICY.md`

HazardNet provides multi-hazard forecasts, automated agrometeorological advisories,
and 26-year historical disaster intelligence for all 64 districts in Bangladesh. In
this operational context, security is directly coupled to human safety and agricultural
resilience: an unauthorized, forged, corrupted, or suppressed hazard advisory poses severe
risks to vulnerable rural communities, agricultural extension officers, and humanitarian
responders.

This policy defines our security architecture, vulnerability reporting procedures,
scope of evaluation, defensive controls, and coordinated disclosure commitments.

---

## 1. Reporting a Vulnerability

**Do not file public GitHub issues for security vulnerabilities.**

Please report security issues using either of our secure reporting channels:

| Channel | Destination / Endpoint |
|---|---|
| **GitHub Private Advisory** (Preferred) | [Submit a Security Advisory](https://github.com/myself-aas/HazardNet/security/advisories/new) |
| **Email** | [shuvoasifahmed@gmail.com](mailto:shuvoasifahmed@gmail.com) |

These channels are also published at [`https://www.hazardnet.live/.well-known/security.txt`](https://www.hazardnet.live/.well-known/security.txt) conforming to **RFC 9116**.

### What to Include in Your Report
To accelerate investigation and remediation, please include:
1. Target URL, API endpoint, component, or workflow.
2. Step-by-step reproduction instructions or a minimal proof-of-concept.
3. Observed impact vs. expected behavior.
4. An assessment of potential real-world harm (e.g., alert forgery, data tampering, information disclosure).
5. Confirmation that the issue has not been disclosed publicly.

---

## 2. Response Commitments & Safe Harbour

### Response Timetable

| Stage | Target Response Time |
|---|---|
| **Initial Acknowledgement** | Within 3 working days |
| **Triage & Severity Assessment** | Within 10 working days |
| **Fix or Mitigation (High/Critical)** | Within 30 calendar days |
| **Coordinated Disclosure & Credit** | Upon release in release notes |

HazardNet is maintained by an academic research initiative (Department of Agrometeorology,
Bangladesh Agricultural University). If unforeseen technical constraints cause a timeline to
slip, reporters will be proactively notified with an updated schedule.

### Safe Harbour
Good-faith security research conducted against HazardNet is welcomed and protected under safe harbour,
provided you:
- Do not engage in volumetric denial-of-service (DDoS) or disrupt operational alerting.
- Do not modify, corrupt, or destroy active forecast records, alerts, or audit trails.
- Do not access, harvest, or expose private personal data or operational credentials.
- Adhere to the coordinated disclosure guidelines and allow the remediation window before public disclosure.

---

## 3. Scope Boundaries

### In Scope

- **Public Web Application (`hazardnet.live`, `www.hazardnet.live`)**:
  - React/Vite client surfaces, routing, state hydration, and internationalization (`/`, `/archive`, `/district/[id]`, `/validation`, `/status`).
  - Interactive components: `<DistrictRiskMap />`, `<DistrictVulnerabilityTable />`, `<HistoricalHazardCatalog />`, `<TemporalTrendChart />`, and `<EventReportModal />`.
- **API Endpoints (`/api/v1/**`)**:
  - Forecast endpoints: `GET /api/v1/forecasts/bulk`, `GET /api/v1/forecasts/metadata`.
  - Historical endpoints: `GET /api/v1/historical/hazards`, `GET /api/v1/historical/vulnerability`, `GET /api/v1/historical/trends`, `GET /api/v1/historical/events/:id`.
  - Alert review & management: `POST /v1/alerts/{id}/review`, `POST /v1/feedback`.
- **Daily Advisory Automation Pipeline**:
  - GitHub Actions ingestion workflow (`.github/workflows/daily_advisory_ingest.yml`).
  - Kaggle API authentication, output artifact retrieval, schema validation, and staleness guards.
  - Snapshot generation and atomic Firestore replacement (`scripts/ingest_forecast_csv.mjs`).
- **Data Integrity & Provenance**:
  - Preventing tampering with the 2000–2026 historical catalog (3,062 events) and 64-district vulnerability rankings.
  - Preventing alert falsification or unauthorized state transitions (`DRAFT → PUBLISHED`).
- **Multilateral GLIDE Outbound Link Resolution**:
  - Ensuring URL resolution for ReliefWeb, FAO GIEWS, WHO Emergency, ADRC, and IFRC GO is strictly sanitized and guarded against open redirects or SSRF.
- **Access Control & RBAC**:
  - Role enforcement: `public`, `analyst`, `reviewer`, `admin`.
  - Ensuring publishing requires explicit `alert.review` standing.
- **Confidentiality & Publication Policy Compliance**:
  - Preventing the exposure of proprietary model weights, private architectures, or internal training datasets protected under `PUBLICATION_POLICY.md`.

### Out of Scope

- Attacks requiring pre-existing physical access to an authenticated administrator's workstation.
- Self-XSS, tab-nabbing, or missing headers on static documentation pages without state-changing actions.
- Denial-of-service through volumetric request flooding (handled at Cloudflare / Vercel edge).
- Issues in upstream third-party infrastructure (Vercel edge, Firebase hosting, Kaggle platform, Open-Meteo API).

---

## 4. Defensive Controls & Implementation Architecture

### 4.1 Strict Content Security Policy (CSP) & Security Headers
HazardNet enforces a centralized, strict header suite implemented in `backend/security/csp.js`
and `backend/middleware/securityHeaders.js`:
- **Content-Security-Policy**:
  - Eliminates `unsafe-inline` and `unsafe-eval` for scripts.
  - Restricts `default-src 'self'`.
  - Restricts `connect-src` to authenticated API endpoints, Firebase, and Open-Meteo.
  - Enforces `frame-ancestors 'none'` to eliminate clickjacking.
- **Strict-Transport-Security (HSTS)**: `max-age=63072000; includeSubDomains; preload`.
- **Cross-Origin Protections**: `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 4.2 Automated Ingestion Integrity & Staleness Guard
The daily forecast automation pipeline executes rigorous validation before public ingestion:
- **Schema Enforcement**: Ingestion fails-fast if the Kaggle output deviates from the 22 required columns or does not contain exactly 128 rows (64 districts × 2 horizons).
- **Staleness Guard**: Rejects datasets where `generated_at` exceeds 36 hours. If stale, ingestion aborts, existing valid data is preserved, and an ops incident alert is raised.
- **Atomic Swap**: Firestore and static snapshot stores are updated atomically, preventing partial or inconsistent state visibility.

### 4.3 Multilateral GLIDE Link Sanitization
GLIDE identifiers are validated against standard format `^[A-Z]{2}-\d{4}-\d{6}-BGD$` before URL generation.
Outbound links to ReliefWeb, FAO, WHO, ADRC, and IFRC GO are:
- Strictly constrained to verified institutional domains.
- Encoded using standard URI component encoding.
- Decorated with `target="_blank" rel="noopener noreferrer"` to prevent window manipulation and referrer leakage.

### 4.4 Human-in-the-Loop (HITL) Alert Authorization & RBAC
- Public hazard alerts cannot be published directly by automated pipelines or unauthenticated users.
- State machine enforcement: `DRAFT → PENDING_REVIEW → PUBLISHED → UPDATED → EXPIRED/ALL_CLEAR`.
- Transitioning to `PUBLISHED` strictly requires the `alert.review` role authenticated via verified JWT claims or `BACKEND_API_KEY`.
- All administrative and review actions generate immutable audit log entries recording actor, action, timestamp, and payload diff.

### 4.5 Secrets Management & CI/CD Protection
- Zero credentials or API keys in tracked repository code.
- Operational secrets (`KAGGLE_USERNAME`, `KAGGLE_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `VERCEL_TOKEN`) reside exclusively in encrypted GitHub Actions secrets.
- Automated secret scanning (`scripts/check-secrets.sh`) runs on every commit and pull request.
- Automated dependency auditing (`scripts/npm-audit-ci.mjs`) fails CI on unresolved high/critical vulnerabilities.

### 4.6 Operational Transparency & Monitoring
- Real-time deployment provenance and data freshness are published at `/status` and `/validation`.
- Freshness drift exceeding 36 hours triggers automated banners across all public pages.
- Real-time pipeline health and ingestion anomalies alert maintainers via Slack `#hazardnet-ops`.

---

## 5. Coordinated Disclosure & Attribution

When a security vulnerability is identified and remediated:
1. A release note summary is published outlining the nature of the issue, affected versions, and mitigation details.
2. For any user-facing or advisory integrity issue, an update note is recorded in the project change log.
3. Contributing researchers who discover and report vulnerabilities in accordance with this policy will be credited in the release notes and project acknowledgements (unless anonymity is requested).
