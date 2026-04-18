# OCNMPS 开发历史 / Development History

**Project:** OCNMPS (OpenClaw Model Routing & Policy System)  
**Timeline:** 2026-03 → 2026-04  
**Status:** Production — Phase 23 Complete ✅

---

## Phase 1–8: Infrastructure Foundation

| Phase | Description | Key Deliverable |
|-------|-------------|-----------------|
| 1–2 | Intent classification skeleton | Basic intent → model mapping |
| 3–4 | Gray rollout system | 10% observation → 50% → 100% |
| 5 | Gray 100% deployment | Daily reports, observation complete |
| 6–7 | Routing Policy V2 | 28-model capability profiles, child spawn adapter |
| **8** | **Full routing + L3 templates** | **6 L3 templates, resilience validation** ✅ |

---

## Phase 9: Self-Learning Routing

| Sub-Phase | Description |
|-----------|-------------|
| 9.0 | Self-learning infrastructure |
| 9.1 | Learning validation |
| 9.2 | Learning scale-up + Route competition |
| 9.3 | Sprint window 50/50 + Override first-response mechanism |
| 9.4 | Complexity-aware routing |

**Key achievement:** Introduced route competition and override gates, allowing the system to learn from real routing outcomes.

---

## Phase 10: Strategy Engine Productization

| Sub-Phase | Description |
|-----------|-------------|
| 10.0 | Strategy engine productization + partial key fix |
| 10.1 | Learning chain validation + threshold calibration (62→50) |
| 10.2 | Strategy Registry expanded to 5 keys + L1 skeleton |
| 10.3-R1 | L2 coverage pushed to 86% |
| 10.3-R2 | L3 review productized, L3 coverage 50% |
| 10.3-R3 | L3 risks productized, L3 coverage 67% |
| 10.3-R4 | verify\|L3\|abstract_strategy audit complete |
| 10.4 | Strategy boundary consolidation |
| 10.5 | Strategy Registry productization governance |
| 10.6 | verify type layering prototype |
| 10.7 | verify\|L3 subtype-aware routing |

**Key achievement:** Strategy Registry became the central source of truth for routing policies.

---

## Phase 11–14: Strategy Deepening

| Phase | Description |
|-------|-------------|
| 11 | Conditional Strategy Expansion (complexity + subtype) |
| 12 | Strategy DSL & Governance Deepening |
| 13-R1 | L2 full coverage (patch\|L2\|technical → PATCH) |
| 13-R2 | extract\|L3\|abstract_strategy → FAST |
| 13-R3 | patch\|L3\|abstract_strategy audit & productization |
| 14-P1+P2 | Full panel + risks\|L2 fileCount dimension |
| 14-P3 | v1.1 freeze observation report |
| 14-P4 | risks\|L2\|technical v1.1 accepted |
| 14-P5 | verify\|L3 subtype review — all 3 subtypes stable |

---

## Phase 15–16: Operations Automation

| Phase | Description |
|-------|-------------|
| 15.2 | Strategy review mechanism |
| 15.3 | Change proposal mechanism |
| 16.1 | Strategy effectiveness baseline panel |
| 16.2 | Anomaly detection rules |
| 16.3 | Auto-proposal candidate generation |
| 16.4 | **Operations automation closure report** |

---

## Phase 17: Auto-Apply Engine

| Phase | Description |
|-------|-------------|
| 17.1 | Candidate-to-draft proposal generation |
| 17.2 | Auto-proposal draft generator + auto-review rules |
| 17.3 | **Auto-apply engine with snapshot and rollback** |

**Key achievement:** Strategies could now be automatically applied with safety guarantees.

---

## Phase 18: Production Hardening

| Phase | Description |
|-------|-------------|
| 18.1 | Production hardening — real apply with feature flag + canary + audit |
| 18.2-A | Canary rollout for verify\|L3 — passed ✅ |
| 18.2-B | Low-frequency auto canary — passed ✅ |
| 18.2-C | **Continuous observation — stable** ✅ |

---

## Phase 19: Runtime Integration

**Plugin V3 migration** — Python Bridge → TypeScript Runtime

- Gateway `before_model_resolve` hook integration
- Post-check deferred verification (19.4-C)
- Config governance foundation

---

## Phase 20: Canary Expansion

- Canary expansion to additional strategies
- Stability freeze report
- Production readiness validation

---

## Phase 21: Configuration Governance

| Phase | Description |
|-------|-------------|
| 21.1 | Config source management (local file as single source of truth) |
| 21.2 | Config schema validation |
| 21.3 | Config diff detection (local vs gateway vs effective) |
| 21.4 | **Config change audit** (JSONL log + Dashboard) |

---

## Phase 22: Sample Execution

- Sample execution framework
- Active first batch execution
- Observation board + fusion report

---

## Phase 23: Full Deployment

| Phase | Description | Result |
|-------|-------------|--------|
| 23.1 | Post-Check Verifier fix | overdue 27.6%→0%, P90 855s→0 ✅ |
| **23.2** | **grayRatio 0.8→1.0 full deployment** | **PASSED WITH MINOR WATCH ITEM** ✅ |

### Phase 23.2-A Final Metrics

| Metric | Value |
|--------|-------|
| applied_count | 2 |
| verifier_pass | 3 |
| verifier_fail | 0 |
| rollback | 0 |
| pending | 0 |
| timeout | 0 |
| borderline_convergence | 1 (446s, not recurred) |

---

## Current State (2026-04-18)

| Component | Status |
|-----------|--------|
| Version | 1.1.0 |
| grayRatio | 1.0 (full) |
| Intents | 11 active |
| Strategy Keys | 8 registered |
| Rollout Mode | active |
| Phase 23 | Complete |
| Status | **BAU (Business As Usual)** |

---

## Lessons Learned

1. **Config source must be single** — multi-source causes drift
2. **Internal messages must bypass** — system messages pollute routing stats
3. **Gray rollout must be gradual** — 10%→50%→100% with observation windows
4. **Post-check is essential** — applied strategies need verification
5. **Audit trail is non-negotiable** — every config change must be logged
