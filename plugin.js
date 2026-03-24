/**
 * OCNMPS Router Plugin for OpenClaw 2026.3.23
 * 
 * 使用 before_model_resolve hook 进行模型路由
 * 这是官方推荐的模型覆盖方式
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PLUGIN_ID = "ocnmps-router";
const PYTHON_BIN = process.env.OCNMPS_PYTHON || "python3";
const BRIDGE_SCRIPT = process.env.OCNMPS_BRIDGE_SCRIPT || 
  path.join(__dirname, "ocnmps_bridge_v2.py");
const CONFIG_PATH = process.env.OCNMPS_CONFIG ||
  path.join(__dirname, "ocnmps_plugin_config.json");
const LOG_FILE = path.join(__dirname, "ocnmps_plugin.log");

const MODEL_MAP = {
  "CODE": { provider: "bailian", model: "qwen3-coder-next" },
  "CODE-PLUS": { provider: "bailian", model: "qwen3-coder-plus" },
  "REASON": { provider: "xai", model: "grok-4-1-fast-reasoning" },
  "LONG": { provider: "bailian", model: "qwen3.5-plus" },
  "CN": { provider: "bailian", model: "MiniMax-M2.5" },
  "MAIN": { provider: "bailian", model: "kimi-k2.5" },
  "FAST": { provider: "bailian", model: "qwen3-max-2026-01-23" },
  "GROK-CODE": { provider: "xai", model: "grok-code-fast-1" },
};

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, plugin: PLUGIN_ID, message, ...data };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", { flag: "a" });
  } catch (err) {}
  console.log(`[${PLUGIN_ID}] ${message}`, data);
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (err) {}
  return { enabled: true, grayRatio: 0.3, enabledIntents: ["CODE", "REASON", "LONG", "CN"] };
}

function parseModelRef(modelRef) {
  if (!modelRef) return null;
  if (modelRef.includes("/")) {
    const [provider, ...rest] = modelRef.split("/");
    return provider && rest.length ? { provider, model: rest.join("/") } : null;
  }
  return MODEL_MAP[modelRef] || null;
}

function callBridge(taskText, meta = {}) {
  const payload = { task: taskText, agent_id: meta.agentId || null, session_id: meta.sessionId || null };
  const startTime = Date.now();
  try {
    const proc = spawnSync(PYTHON_BIN, [BRIDGE_SCRIPT, "--json"], {
      input: JSON.stringify(payload),
      encoding: "utf-8",
      timeout: 5000,
      cwd: __dirname,
    });
    const latencyMs = Date.now() - startTime;
    if (proc.error || proc.status !== 0) {
      return { ok: false, error: proc.error?.message || proc.stderr, latencyMs };
    }
    return { ok: true, data: JSON.parse(proc.stdout), latencyMs };
  } catch (err) {
    return { ok: false, error: err.message, latencyMs: Date.now() - startTime };
  }
}

// before_model_resolve hook handler
function handleBeforeModelResolve(event, context, config) {
  try {
    // 获取 prompt
    const prompt = event?.prompt || event?.text || event?.messages?.slice(-1)?.[0]?.content || "";
    
    log("info", "before_model_resolve triggered", {
      hasPrompt: !!prompt,
      promptLength: prompt.length,
      sessionKey: context?.sessionKey,
      eventKeys: Object.keys(event || {}).slice(0, 8),
    });
    
    if (!prompt || prompt.length < 5) return {};
    
    const sessionKey = context?.sessionKey || "";
    const agentId = context?.agentId || "";
    
    log("info", "Processing for model routing", {
      sessionKey, agentId, promptLength: prompt.length,
      preview: prompt.slice(0, 100) + "..."
    });
    
    const bridge = callBridge(prompt, { agentId, sessionId: sessionKey, config });
    
    if (!bridge.ok || !bridge.data) {
      log("warn", "Bridge failed", { error: bridge.error });
      return {};
    }
    
    const result = bridge.data;
    
    if (!result.gray_hit) {
      log("info", "Gray release miss", { intent: result.intent });
      return {};
    }
    
    const selection = parseModelRef(result.recommended_model);
    if (!selection) {
      log("warn", "Failed to parse model", { recommended_model: result.recommended_model });
      return {};
    }
    
    if (result.intent && config.enabledIntents?.length > 0 && !config.enabledIntents.includes(result.intent)) {
      log("info", "Intent not enabled", { intent: result.intent });
      return {};
    }
    
    log("info", "✅ Model override applied", {
      intent: result.intent,
      model: `${selection.provider}/${selection.model}`,
      latency_ms: bridge.latencyMs
    });
    
    // 返回模型覆盖
    return { 
      providerOverride: selection.provider, 
      modelOverride: selection.model 
    };
    
  } catch (err) {
    log("error", "Handler error", { error: err.message });
    return {};
  }
}

module.exports = {
  id: PLUGIN_ID,
  name: "OCNMPS Router",
  version: "1.5.0",
  description: "Model router plugin using OCNMPS bridge",
  
  register(api) {
    const config = loadConfig();
    if (!config.enabled) return;
    
    log("info", "Registering plugin", { grayRatio: config.grayRatio, enabledIntents: config.enabledIntents });
    
    // 使用 before_model_resolve (官方推荐)
    if (typeof api.on === 'function') {
      api.on('before_model_resolve', (event, context) => handleBeforeModelResolve(event, context, config));
      log("info", "Registered: before_model_resolve ✅");
    }
    
    log("info", "Plugin registered", { pluginId: PLUGIN_ID });
  }
};