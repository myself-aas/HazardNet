# Task Assignments — HazardNet v3.0
Generated: 2026-09-17 · Companion: `prd_hazardnet_v3_20260917.md`

| Task ID | Description | Type | Assigned Sub-Agent | Dependencies | Effort | Status |
|---|---|---|---|---|---|---|
| TASK-001 | Derive split metadata; generate grouped_kfold + rolling_origin splits | ML/Data | data-agent | None | 4h | **Blocked** (dataset artifacts absent from repo — RUNBOOK_LOG discrepancy #1) |
| TASK-002 | Run grouped_kfold evaluation; archive tier verification | ML | ml-agent | TASK-001 | 6 GPU-h | To Do |
| TASK-002b | Run rolling_origin (chained fine-tune); gate decision | ML | ml-agent | TASK-002 | 6 GPU-h | To Do |
| TASK-003 | Apply BD thresholds; 57/57 proofs in CI | ML | ml-agent | TASK-001 | 1h | **Done** (2026-09-17: 57/57 pass, `results/bd_thresholds_validation.log`, CI `v3-ml-contracts.yml`; normalizer deficit-space repair recorded in RUNBOOK_LOG) |
| TASK-004 | Fit calibrator + OOD guard + conformal; ECE report | ML | ml-agent | TASK-002b | 4 GPU-h | To Do |
| TASK-005 | Fusion integration test; version-mismatch refusal | ML/Backend | ml-agent | TASK-004 | 6h | To Do |
| TASK-006 | Core API + PostGIS schema + RBAC + audit | Backend | backend-agent | None | 16h | To Do |
| TASK-007 | Alert state machine + review console endpoints | Backend | backend-agent | TASK-006, TASK-005 | 12h | To Do |
| TASK-008 | Claims registry CI gate | DevOps | devops-agent | None | 4h | **Done** (2026-09-17: `docs/CLAIMS.md` + `scripts/check-claims.mjs` in `ci.yml`; 58 unregistered metrics triaged, fabrications removed, INT-CLAIM-01 green) |
| TASK-009 | Landing rebuild (NASA layout, BD content, bn/en) | Frontend | frontend-agent | TASK-007 (API contract only) | 20h | To Do |
| TASK-010 | District map + alert archive pages | Frontend | frontend-agent | TASK-007 | 16h | To Do |
| TASK-011 | /validation + status pages | Frontend | frontend-agent | TASK-006 | 8h | To Do |
| TASK-012 | Accessibility + performance pass | Frontend/QA | frontend-agent | TASK-009, TASK-010 | 8h | To Do |
| TASK-013 | Security P0 checklist | DevOps | devops-agent | TASK-006 | 8h | To Do |
| TASK-014 | SEO foundations + structured data | Frontend | frontend-agent | TASK-009 | 6h | To Do |
| TASK-015 | Hindcast (out-of-fold) + tabletop + soft launch | QA/Ops | qa-agent | TASK-012, TASK-013, TASK-008 | 12h | To Do |

**Status logic (2026-09-17):** TASK-003 + TASK-008 Done; TASK-001 Blocked on the missing dataset artifacts (owner escalation, RUNBOOK_LOG); the rest To Do pending their dependencies.
**Critical path:** TASK-001 → TASK-002 → TASK-002b → TASK-004 → TASK-005 → TASK-007 → TASK-009 → TASK-012 → TASK-015.
**Parallel streams:** Stream ML (001→002→002b→003→004→005); Stream Web (006→007→009/010→012); Stream Ops (008, 013, 014); converge at TASK-015.
**Error log:** none — all statuses consistent with dependency analysis.
