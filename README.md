# OCNMPS

[中文](#zh) · [English](#en)

OpenClaw AI 智能体的意图驱动模型路由系统。自动将请求路由到最佳模型。

---

## <a id="zh"></a>概述

OCNMPS（OpenClaw Model Routing & Policy System）是 OpenClaw 网关的意图驱动模型路由插件。它在模型选择前拦截每个请求，分类意图，并路由到最合适的 AI 模型。

**解决的问题：** 将所有请求发送到同一模型浪费成本、速度和能力。OCNMPS 在多个专业模型间智能分配流量。

---

## 快速安装（5 分钟）

### 前置条件

- 已安装并运行 [OpenClaw](https://github.com/openclaw/openclaw)
- Node.js 18+
- OpenClaw 中至少配置了 2 个模型提供商

### 步骤 1：安装

```bash
git clone https://github.com/<your-username>/ocnmps-router.git
cp -r ocnmps-router ~/.openclaw/plugins/
```

### 步骤 2：配置

编辑 `~/.openclaw/plugins/ocnmps-router/config/ocnmps_plugin_config.json`，将模型名称改为你的提供商配置：

```json
{
  "enabled": true,
  "grayRatio": 0.3,
  "rolloutMode": "active",
  "modelMapping": {
    "MAIN": "你的提供商/你的主模型",
    "CODE": "你的提供商/你的代码模型"
  },
  "policyVersion": "v1.0"
}
```

> **注意：** 模型名称必须与 `openclaw.json` 中配置的提供商一致。

### 步骤 3：重启

```bash
openclaw gateway restart
```

### 步骤 4：验证

```bash
openclaw plugins info ocnmps-router
cd ocnmps-router
node tests/test_regression.js
```

---

## 工作原理

```
用户：「修复这个 Python 错误」
  │
  ▼
OCNMPS 拦截 → 分类意图：PATCH
  │
  ▼
路由到：grok-code-fast-1（优化代码修复）
  │
  ▼
OpenClaw 发送请求 → 模型响应 → 用户获得答案
```

整个过程增加 ~5ms 延迟，对用户透明。

---

## 意图路由

| 意图 | 触发时机 | 用途 |
|------|----------|------|
| `MAIN` | 通用问题、聊天、分析 | 最佳全能模型 |
| `CODE` | 编写新代码 | 代码专业模型 |
| `CODE_PLUS` | 复杂重构、架构 | 高级代码模型 |
| `PATCH` | 错误修复、一行变更 | 快速修复模型 |
| `DEBUG` | 调试错误、堆栈追踪 | 推理专注模型 |
| `REVIEW` | 代码审查、安全审计 | 强推理想模型 |
| `REASON` | 解释、逐步思考 | 思维链模型 |
| `LONG` | 长文档、文章 | 大上下文模型 |
| `TEST` | 编写单元测试 | 测试生成模型 |
| `CN` | 中文请求 | 中文优化模型 |

---

## 配置参考

### ocnmps_plugin_config.json

| 字段 | 类型 | 默认值 | 必需 | 说明 |
|------|------|--------|------|------|
| `enabled` | boolean | `true` | ✅ | 启用/禁用插件 |
| `grayRatio` | number | `0.3` | ✅ | 流量比例 (0.0 = 无，1.0 = 全部) |
| `rolloutMode` | string | `"active"` | ✅ | `shadow` (仅观察), `canary` (部分), `active` (全部) |
| `enabledIntents` | string[] | 全部意图 | — | 路由的意图。省略 = 路由全部 |
| `modelMapping` | object | — | ✅ | 意图 → 模型名称映射 |
| `activeKeys` | string[] | `[]` | — | 激活的策略键用于规则路由 |
| `canaryKeys` | string[] | `[]` | — | 金丝雀策略键用于渐进发布 |
| `policyVersion` | string | `"v1.0"` | ✅ | 变更追踪版本标签 |

### 示例：最小配置

```json
{
  "enabled": true,
  "grayRatio": 1.0,
  "rolloutMode": "active",
  "modelMapping": {
    "MAIN": "provider/chat-model",
    "CODE": "provider/code-model"
  },
  "policyVersion": "v1.0"
}
```

### 示例：金丝雀部署

```json
{
  "enabled": true,
  "grayRatio": 0.3,
  "rolloutMode": "canary",
  "activeKeys": ["summary|L1|technical"],
  "canaryKeys": ["review|L2|technical"],
  "modelMapping": {
    "MAIN": "provider/chat-model",
    "CODE": "provider/code-model",
    "REVIEW": "provider/reasoning-model"
  },
  "policyVersion": "v1.0"
}
```

---

## 发布策略

建议渐进发布：

| 阶段 | grayRatio | rolloutMode | 时长 | 目的 |
|------|-----------|-------------|------|------|
| 1. 观察 | `0.0` | `shadow` | 1 天 | 观察路由决策，不实际应用 |
| 2. 部分 | `0.3` | `canary` | 3 天 | 30% 流量路由，监控异常 |
| 3. 全量 | `1.0` | `active` | — | 全部流量路由 |

---

## 项目结构

```
├── src/
│   ├── plugin.js                 # 插件入口，网关钩子，配置治理
│   ├── ocnmps_core.js            # 核心路由：意图、灰度、模型、降级
│   ├── strategy_bridge.js        # 策略匹配，金丝雀，后置检查
│   ├── strategy_registry.json    # 策略规则（运行时）
│   ├── recognizer/               # 意图识别
│   └── contracts/                # 类型定义
├── config/
│   └── ocnmps_plugin_config.json # 主配置
├── scripts/
│   ├── verify_config_chain.sh    # 配置链验证器
│   └── verify_config_consistency.py  # 跨源一致性
├── tests/
│   ├── test_regression.js        # 回归测试套件
│   └── test_messages.txt         # 测试语料
└── docs/
    ├── ARCHITECTURE.md           # 系统架构
    └── DEVELOPMENT.md            # 开发历史
```

---

## CLI 命令

| 命令 | 说明 |
|------|------|
| `openclaw ocnmps-router stats` | 路由统计 |
| `openclaw ocnmps-router history` | 最近路由决策 |
| `openclaw ocnmps-router history --gray` | 仅灰度命中 |
| `openclaw ocnmps-router verify` | 运行验证脚本 |

---

## 安全机制

- **内部消息绕过** — 系统消息不影响路由统计
- **灰度发布** — 可配置流量分配，控制爆炸半径
- **降级链路** — 模型失败时优雅降级
- **配置审计** — 每次变更记录前后差异

---

## 许可证

MIT

---

## <a id="en"></a>Overview

OCNMPS (OpenClaw Model Routing & Policy System) is an OpenClaw Gateway plugin that intercepts every request before model selection, classifies its intent, and routes it to the most appropriate AI model.

**The problem:** Sending every request to the same model wastes cost, speed, and capability. OCNMPS distributes traffic across specialized models — routing code to code models, reasoning to reasoning models, and general chat to cost-efficient models.

**What it does:**
- Classifies intent from natural language prompts
- Routes to specialized models (code, reasoning, vision, etc.)
- Supports gradual rollout (gray/canary deployment)
- Falls back gracefully on failure
- Provides full audit trail for every configuration change

**What it is not:**
- Not a model — it routes between models
- Not a chatbot — it's infrastructure
- Not a prompt optimizer — it works with your existing prompts

---

## Quick Install (5 minutes)

### Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and running
- Node.js 18+
- At least 2 model providers configured in OpenClaw

### Step 1: Install

```bash
# Clone or download this repository
git clone https://github.com/<your-username>/ocnmps-router.git

# Copy to OpenClaw plugins directory
cp -r ocnmps-router ~/.openclaw/plugins/
```

### Step 2: Configure

Open `~/.openclaw/plugins/ocnmps-router/config/ocnmps_plugin_config.json` and adjust the model mapping to match your providers:

```json
{
  "enabled": true,
  "grayRatio": 0.3,
  "rolloutMode": "active",
  "modelMapping": {
    "MAIN": "your-provider/your-main-model",
    "CODE": "your-provider/your-code-model",
    "PATCH": "your-provider/your-patch-model"
  },
  "policyVersion": "v1.0"
}
```

> **Note:** Model names must match providers configured in your OpenClaw `openclaw.json`. See the [Configuration Reference](#configuration) below for all available options.

### Step 3: Restart

```bash
openclaw gateway restart
```

### Step 4: Verify

```bash
# Check plugin loaded
openclaw plugins info ocnmps-router

# Run regression tests
cd ocnmps-router
node tests/test_regression.js
```

You should see routing decisions logged. Every user request now passes through OCNMPS.

---

## How It Works

```
User: "Fix this Python bug"
  │
  ▼
OCNMPS intercepts → classifies intent as PATCH
  │
  ▼
Routes to: grok-code-fast-1 (optimized for code fixes)
  │
  ▼
OpenClaw sends request → model responds → user gets answer
```

The entire process adds ~5ms latency and is transparent to the user.

---

## Intent Routing

| Intent | When it triggers | Use for |
|--------|-----------------|---------|
| `MAIN` | General questions, chat, analysis | Your best all-around model |
| `CODE` | Writing new code | Code-specialized models |
| `CODE_PLUS` | Complex refactoring, architecture | Premium code models |
| `PATCH` | Bug fixes, one-line changes | Fast code-fix models |
| `DEBUG` | Debugging errors, stack traces | Reasoning-focused models |
| `REVIEW` | Code review, security audit | Strong reasoning models |
| `REASON` | Explanations, step-by-step thinking | Chain-of-thought models |
| `LONG` | Long documents, articles | Large-context models |
| `TEST` | Writing unit tests | Test-generation models |
| `CN` | Chinese-language requests | Chinese-optimized models |

---

## Configuration Reference

### ocnmps_plugin_config.json

| Field | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `enabled` | boolean | `true` | ✅ | Enable/disable the plugin |
| `grayRatio` | number | `0.3` | ✅ | Fraction of traffic to route (0.0 = none, 1.0 = all) |
| `rolloutMode` | string | `"active"` | ✅ | `shadow` (observe only), `canary` (partial), `active` (full) |
| `enabledIntents` | string[] | all intents | — | Which intents to route. Omitted = route all |
| `modelMapping` | object | — | ✅ | Intent → model name mapping |
| `activeKeys` | string[] | `[]` | — | Active strategy keys for rule-based routing |
| `canaryKeys` | string[] | `[]` | — | Canary strategy keys for gradual rollout |
| `policyVersion` | string | `"v1.0"` | ✅ | Version tag for change tracking |

### Example: Minimal Config

```json
{
  "enabled": true,
  "grayRatio": 1.0,
  "rolloutMode": "active",
  "modelMapping": {
    "MAIN": "provider/chat-model",
    "CODE": "provider/code-model"
  },
  "policyVersion": "v1.0"
}
```

### Example: Canary Deployment

```json
{
  "enabled": true,
  "grayRatio": 0.3,
  "rolloutMode": "canary",
  "activeKeys": ["summary|L1|technical"],
  "canaryKeys": ["review|L2|technical"],
  "modelMapping": {
    "MAIN": "provider/chat-model",
    "CODE": "provider/code-model",
    "REVIEW": "provider/reasoning-model"
  },
  "policyVersion": "v1.0"
}
```

---

## Rollout Strategy

We recommend a gradual rollout:

| Phase | grayRatio | rolloutMode | Duration | Purpose |
|-------|-----------|-------------|----------|---------|
| 1. Observe | `0.0` | `shadow` | 1 day | Verify routing decisions without applying |
| 2. Partial | `0.3` | `canary` | 3 days | Route 30% of traffic, monitor for issues |
| 3. Full | `1.0` | `active` | — | All traffic routed |

To adjust:

```bash
# Change grayRatio in config, then:
openclaw gateway restart
```

---

## Project Structure

```
├── src/
│   ├── plugin.js                 # Plugin entry, Gateway hook, config governance
│   ├── ocnmps_core.js            # Core routing: intent, gray, model, fallback
│   ├── strategy_bridge.js        # Strategy matching, canary, post-check
│   ├── strategy_registry.json    # Strategy rules (runtime)
│   ├── recognizer/               # Intent recognition
│   └── contracts/                # Type definitions
├── config/
│   └── ocnmps_plugin_config.json # Main configuration
├── scripts/
│   ├── verify_config_chain.sh    # Config chain validator
│   └── verify_config_consistency.py  # Cross-source consistency
├── tests/
│   ├── test_regression.js        # Regression test suite
│   └── test_messages.txt         # Test corpus
└── docs/
    ├── ARCHITECTURE.md           # System architecture
    └── DEVELOPMENT.md            # Development history
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `openclaw ocnmps-router stats` | Routing statistics |
| `openclaw ocnmps-router history` | Recent routing decisions |
| `openclaw ocnmps-router history --gray` | Gray hits only |
| `openclaw ocnmps-router verify` | Run verification script |

---

## Safety

- **Internal message bypass** — system/heartbeat messages don't affect routing
- **Gray rollout** — configurable traffic split prevents blast radius
- **Fallback chain** — graceful degradation on model failure
- **Config audit** — every change logged with before/after diff

---

## License

MIT