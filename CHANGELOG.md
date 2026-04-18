# Changelog

All notable changes to OCNMPS will be documented in this file.

---

## [1.1.0] — 2026-04-18

### Added
- Phase 23: grayRatio 0.8 → 1.0 full deployment (PASSED)
- Phase 21: Configuration governance (schema validation, diff detection, audit trail)
- Phase 19: Runtime integration (Plugin V3, Gateway `before_model_resolve` hook)
- Phase 18: Production hardening (canary rollout, continuous observation)
- Phase 17: Auto-apply engine with snapshot and rollback
- Phase 15–16: Operations automation (review mechanism, change proposals)
- Strategy Registry productization (8 registered keys)

### Changed
- Internal message bypass (system messages no longer pollute routing stats)
- Config source: local file as single source of truth
- Intent classification: 11 intents + 2 auxiliary tags
- Recognition v1 sidecar disabled (not used in production)

### Fixed
- Post-check verifier timeout (overdue 27.6% → 0%)
- Strategy Bridge partial key matching
- Config chain consistency

### Removed
- Python Bridge (migrated to TypeScript Runtime V3)
- classifier.js (replaced by intent recognition)

---

## [1.0.0] — 2026-03-15

### Initial Release
- Intent classification (9 intents)
- Model mapping (multi-provider)
- Gray rollout system (10% → 50% → 100%)
- Routing Policy V2 (28-model capability profiles)
- Child spawn adapter
- L3 strategy templates (6 keys)
