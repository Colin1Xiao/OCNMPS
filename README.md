# 🚀 OCNMPS

> **Smart AI Model Router for OpenClaw**  
> **OpenClaw 智能 AI 模型路由器**

<p align="center">
  <img src="https://img.shields.io/badge/version-1.5.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/python-3.9+-green?style=for-the-badge" alt="Python">
  <img src="https://img.shields.io/badge/license-MIT-yellow?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/status-production%20ready-brightgreen?style=for-the-badge" alt="Status">
</p>

---

## 🌐 Language | 语言

**[🇺🇸 English](#english)** | **[🇨🇳 中文](#中文)**

---

# 🇺🇸 English

## 📖 What is OCNMPS?

> **Think of it as a smart traffic controller for AI models.** 🚦
>
> OCNMPS automatically picks the best AI model for your task - coding, analysis, writing, or Chinese conversations.

### ✨ Quick Examples

| You Ask | Plugin Picks | Why |
|---------|--------------|-----|
| "Write a Python function" | 🧑‍💻 Code Model | Best for programming |
| "Analyze this logic" | 🤔 Reasoning Model | Best for analysis |
| "Write a long article" | 📝 Long-text Model | Best for writing |
| "用中文写文章" | 🇨🇳 Chinese Model | Best for Chinese |

---

## 🚀 Quick Start

### 1️⃣ Install

```bash
# Clone the repository
git clone https://github.com/Colin1Xiao/OCNMPS.git
cd OCNMPS

# Copy to OpenClaw plugins directory
mkdir -p ~/.openclaw/plugins/ocnmps-router
cp *.js *.py *.json ~/.openclaw/plugins/ocnmps-router/
```

### 2️⃣ Enable

Edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "ocnmps-router": {
        "enabled": true
      }
    }
  }
}
```

### 3️⃣ Restart

```bash
openclaw gateway restart
```

### 4️⃣ Test

```bash
echo '{"task": "写一个 Python 函数"}' | \
  python3 ~/.openclaw/plugins/ocnmps-router/ocnmps_bridge_v2.py --json
```

**Expected Output:**
```json
{
  "gray_hit": true,
  "intent": "CODE",
  "recommended_model": "bailian/qwen3-coder-next"
}
```

---

## ⚙️ Configuration

File: `~/.openclaw/plugins/ocnmps-router/ocnmps_plugin_config.json`

```json
{
  "enabled": true,
  "grayRatio": 0.3,
  "enabledIntents": ["CODE", "REASON", "LONG", "CN"],
  "modelMapping": {
    "CODE": { "provider": "bailian", "model": "qwen3-coder-next" },
    "REASON": { "provider": "xai", "model": "grok-4-1-fast-reasoning" },
    "LONG": { "provider": "bailian", "model": "qwen3.5-plus" },
    "CN": { "provider": "bailian", "model": "MiniMax-M2.5" },
    "MAIN": { "provider": "bailian", "model": "kimi-k2.5" }
  }
}
```

### 📋 Config Options

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Turn plugin on/off | `true` |
| `grayRatio` | % of requests to route (0.3 = 30%) | `0.3` |
| `enabledIntents` | Which intents to handle | All |

---

## 🧠 Model Selection

| Intent | Model | Best For |
|--------|-------|----------|
| **CODE** | `qwen3-coder-next` | Programming, debugging |
| **REASON** | `grok-4-1-fast-reasoning` | Analysis, logic |
| **LONG** | `qwen3.5-plus` | Long articles, docs |
| **CN** | `MiniMax-M2.5` | Chinese conversations |
| **MAIN** | `kimi-k2.5` | General tasks |

---

## 📊 Performance

| Metric | Value | Status |
|--------|-------|--------|
| ⚡ Average Latency | 93ms | ✅ Fast |
| 🎯 Intent Accuracy | 100% | ✅ Perfect |
| 📈 Gray Release Hit | ~30% | ✅ Stable |
| 🛡️ Availability | 100% | ✅ Reliable |

---

## 🔧 How It Works

```
User Request → Plugin Intercept → Python Bridge → Gray Check → Model Select → Apply Override → AI Respond
```

---

## 🐛 Troubleshooting

### Plugin Not Working?

```bash
# 1. Check files exist
ls ~/.openclaw/plugins/ocnmps-router/

# 2. Check Python
python3 --version

# 3. Test manually
echo '{"task": "test"}' | \
  python3 ~/.openclaw/plugins/ocnmps-router/ocnmps_bridge_v2.py --json

# 4. Check logs
tail -f ~/.openclaw/logs/gateway.log | grep ocnmps
```

### Model Not Switching?

- `grayRatio: 0.3` means only 30% of requests are routed
- Set `grayRatio: 1.0` to route all requests for testing

---

## 🔒 Security

- ✅ No data collection
- ✅ No external API calls
- ✅ All processing local
- ✅ No sensitive info

---

## 📄 License

MIT License - Free to use, modify, and distribute.

---

**[⬆ Back to Top](#-ocnmps)**

---

# 🇨🇳 中文

## 📖 OCNMPS 是什么？

> **就像一个聪明的交通指挥员，引导不同的 AI 模型处理不同的任务。** 🚦
>
> OCNMPS 能根据你的任务类型，自动选择最合适的 AI 模型。

### ✨ 快速示例

| 你说 | 插件选择 | 原因 |
|------|----------|------|
| "写个 Python 函数" | 🧑‍💻 编程模型 | 最擅长写代码 |
| "分析这个逻辑" | 🤔 推理模型 | 最擅长分析 |
| "写篇长文章" | 📝 长文模型 | 最擅长写作 |
| "用中文聊天" | 🇨🇳 中文模型 | 最擅长中文 |

---

## 🚀 快速开始

### 1️⃣ 安装

```bash
# 克隆仓库
git clone https://github.com/Colin1Xiao/OCNMPS.git
cd OCNMPS

# 复制到 OpenClaw 插件目录
mkdir -p ~/.openclaw/plugins/ocnmps-router
cp *.js *.py *.json ~/.openclaw/plugins/ocnmps-router/
```

### 2️⃣ 启用

编辑 `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "ocnmps-router": {
        "enabled": true
      }
    }
  }
}
```

### 3️⃣ 重启

```bash
openclaw gateway restart
```

### 4️⃣ 测试

```bash
echo '{"task": "写一个 Python 函数"}' | \
  python3 ~/.openclaw/plugins/ocnmps-router/ocnmps_bridge_v2.py --json
```

**预期输出:**
```json
{
  "gray_hit": true,
  "intent": "CODE",
  "recommended_model": "bailian/qwen3-coder-next"
}
```

---

## ⚙️ 配置说明

文件：`~/.openclaw/plugins/ocnmps-router/ocnmps_plugin_config.json`

```json
{
  "enabled": true,
  "grayRatio": 0.3,
  "enabledIntents": ["CODE", "REASON", "LONG", "CN"],
  "modelMapping": {
    "CODE": { "provider": "bailian", "model": "qwen3-coder-next" },
    "REASON": { "provider": "xai", "model": "grok-4-1-fast-reasoning" },
    "LONG": { "provider": "bailian", "model": "qwen3.5-plus" },
    "CN": { "provider": "bailian", "model": "MiniMax-M2.5" },
    "MAIN": { "provider": "bailian", "model": "kimi-k2.5" }
  }
}
```

### 📋 配置选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `enabled` | 启用/禁用插件 | `true` |
| `grayRatio` | 路由比例 (0.3 = 30%) | `0.3` |
| `enabledIntents` | 启用的意图类型 | 全部 |

---

## 🧠 模型选择

| 意图 | 模型 | 适用场景 |
|------|------|----------|
| **CODE** | `qwen3-coder-next` | 编程开发 |
| **REASON** | `grok-4-1-fast-reasoning` | 分析推理 |
| **LONG** | `qwen3.5-plus` | 长文写作 |
| **CN** | `MiniMax-M2.5` | 中文对话 |
| **MAIN** | `kimi-k2.5` | 通用对话 |

---

## 📊 性能指标

| 指标 | 数值 | 状态 |
|------|------|------|
| ⚡ 平均延迟 | 93ms | ✅ 快速 |
| 🎯 意图准确率 | 100% | ✅ 完美 |
| 📈 灰度命中率 | ~30% | ✅ 稳定 |
| 🛡️ 可用性 | 100% | ✅ 可靠 |

---

## 🔧 工作原理

```
用户请求 → 插件拦截 → Python 桥接 → 灰度检查 → 模型选择 → 应用覆盖 → AI 响应
```

---

## 🐛 故障排除

### 插件不工作？

```bash
# 1. 检查文件是否存在
ls ~/.openclaw/plugins/ocnmps-router/

# 2. 检查 Python
python3 --version

# 3. 手动测试
echo '{"task": "test"}' | \
  python3 ~/.openclaw/plugins/ocnmps-router/ocnmps_bridge_v2.py --json

# 4. 查看日志
tail -f ~/.openclaw/logs/gateway.log | grep ocnmps
```

### 模型未切换？

- `grayRatio: 0.3` 表示只有 30% 的请求会被路由
- 设置 `grayRatio: 1.0` 可路由所有请求进行测试

---

## 🔒 安全

- ✅ 不收集数据
- ✅ 不调用外部 API
- ✅ 本地处理
- ✅ 无敏感信息

---

## 📄 许可证

MIT 许可证 - 可自由使用、修改和分发。

---

**[⬆ 返回顶部](#-ocnmps)**

---

<p align="center">
  <strong>🌐 GitHub:</strong> <a href="https://github.com/Colin1Xiao/OCNMPS">Colin1Xiao/OCNMPS</a>
</p>

<p align="center">
  <em>Last updated: 2026-03-24</em>
</p>
