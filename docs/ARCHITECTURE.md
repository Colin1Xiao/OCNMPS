# OCNMPS Architecture

**Version:** 1.1.0  
**Date:** 2026-04-18

---

## System Overview

OCNMPS operates as an OpenClaw Gateway plugin, intercepting model resolution requests before they reach the default model selector.

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                        │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────┐    │
│  │  User Message   │───▶│  before_model_resolve Hook  │    │
│  └─────────────────┘    └──────────────┬──────────────┘    │
│                                        │                    │
│                           ┌────────────▼─────────────┐     │
│                           │   OCNMPS Plugin (V3)     │     │
│                           │                          │     │
│                           │  1. Internal Msg Filter  │     │
│                           │  2. Intent Classification │     │
│                           │  3. Gray Rollout Gate    │     │
│                           │  4. Strategy Bridge      │     │
│                           │  5. Model Resolution     │     │
│                           │  6. Fallback Chain       │     │
│                           └────────────┬─────────────┘     │
│                                        │                    │
│                           ┌────────────▼─────────────┐     │
│                           │   Selected Model          │     │
│                           └──────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Map

### plugin.js — Plugin Entry Point

| Responsibility | Description |
|----------------|-------------|
| Gateway integration | Registers `before_model_resolve` hook |
| Config loading | Loads `ocnmps_plugin_config.json` as single source of truth |
| Config governance | Schema validation (Phase 21.2), diff detection (21.3), audit trail (21.4) |
| Lifecycle management | Plugin init, reload, shutdown |
| CLI commands | `stats`, `history`, `verify`, `set-gray` |

### ocnmps_core.js — Core Routing Engine

| Responsibility | Description |
|----------------|-------------|
| Intent classification | Classifies prompt into 11 intents + 2 tags |
| Gray calculation | Consistent hash-based traffic splitting |
| Model mapping | Intent → model resolution |
| Fallback chain | Degraded routing on primary failure |
| Stats collection | Routing metrics (user messages only) |
| Internal message filtering | System messages bypass routing |

### strategy_bridge.js — Strategy Matching

| Responsibility | Description |
|----------------|-------------|
| Strategy matching | Matches prompts against strategy registry |
| Registry loading | Reads `strategy_registry.json` |
| Rollout gate | shadow / canary / active modes |
| Post-check | Deferred verification after apply |
| Rollback | Automatic rollback on failure |

### recognizer/ — Intent Recognition

| File | Description |
|------|-------------|
| `recognize.js` | Primary intent recognition from prompt text |
| `recognition_compare.js` | Sidecar comparison (disabled in production) |

### contracts/ — Type Contracts

| File | Description |
|------|-------------|
| `recognition_result.js` | Recognition result schema |
| `recognition_comparison.js` | Comparison result schema |

---

## Data Flow

```
1. User sends message
   │
2. Gateway triggers before_model_resolve
   │
3. OCNMPS receives (prompt, sessionKey, metadata)
   │
4. Internal message check → bypass if system message
   │
5. Intent classification (recognize.js)
   │   Output: { intent, tags[] }
   │
6. Gray calculation (hash-based)
   │   Output: grayHit = true/false
   │
7. If grayHit = false → return default model
   │
8. Strategy Bridge match (strategy_bridge.js)
   │   Output: { matched, strategyKey, selectedModel }
   │
9. If matched → apply strategy (canary check, post-check scheduling)
   │
10. If not matched → legacy fallback
    │
11. Return { model, verificationOk }
    │
12. Gateway uses resolved model
```

---

## Configuration Hierarchy

| Source | Role | Priority |
|--------|------|----------|
| `ocnmps_plugin_config.json` | Single source of truth | Primary |
| `openclaw.json` plugins.entries | Gateway enable/disable | Override |
| `strategy_registry.json` | Strategy rules | Runtime |

---

## Rollout Modes

| Mode | Behavior |
|------|----------|
| `shadow` | Routes calculated but not applied (observation) |
| `canary` | Selected strategies apply gradually |
| `active` | All strategies apply to matched traffic |

---

## Safety Mechanisms

1. **Internal message bypass** — system messages don't affect routing stats
2. **Gray rollout** — traffic split prevents blast radius
3. **Canary deployment** — per-strategy gradual rollout
4. **Post-check verification** — validates after apply
5. **Automatic rollback** — on post-check failure
6. **Config audit** — every change logged with diff
