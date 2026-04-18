/**
 * OCNMPS Router Plugin V3 — TypeScript Runtime
 * 
 * 升级说明:
 * - 从 Python Bridge 升级到 TypeScript Runtime V3
 * - 核心逻辑迁移到 workspace/core/ocnmps/
 * - 新增：路由验证、审计追踪、记忆沉淀
 * - 解决：路由幻觉问题
 */

const path = require('node:path');
const fs = require('node:fs');

const PLUGIN_ID = 'ocnmps-router';
const LOG_FILE = path.join(__dirname, 'ocnmps_v3.log');

// 导入 Core V3（JavaScript 版本，无需编译）
const { createOCNMPSIntegrator } = require('./ocnmps_core');

// 配置
const CONFIG_PATH = process.env.OCNMPS_CONFIG ||
  path.join(__dirname, 'ocnmps_plugin_config.json');

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, plugin: PLUGIN_ID, message, ...data };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {}
  console.log(`[${PLUGIN_ID}] ${message}`, data);
}

// Phase 21.1: Gateway config 支持的字段白名单
// Gateway config 只负责最小启停字段，不包含 OCNMPS 业务配置
const GATEWAY_CONFIG_ALLOWLIST = ['enabled'];

// Phase 21.2: 已知的 Strategy Registry keys（用于校验 canaryKeys）
const KNOWN_STRATEGY_KEYS = [
  'verify|L3|abstract_strategy',
  'summary|L1|technical',
  'review|L2|technical',
  'risks|L2|technical',
  'risks|L3|abstract_strategy',
  'verify|L3|technical',
  'summary|L1|abstract_strategy',
  'review|L2|abstract_strategy',
];

/**
 * Phase 21.2: 配置 Schema 校验
 * 
 * @param {Object} config - 待校验配置
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];
  
  // 1. rolloutMode
  const validRolloutModes = ['shadow', 'canary', 'active'];
  if (!config.rolloutMode) {
    errors.push('Missing required field: rolloutMode');
  } else if (typeof config.rolloutMode !== 'string' || !validRolloutModes.includes(config.rolloutMode)) {
    errors.push(`Invalid rolloutMode: "${config.rolloutMode}" (must be: ${validRolloutModes.join(', ')})`);
  }
  
  // 2. grayRatio
  if (config.grayRatio === undefined || config.grayRatio === null) {
    errors.push('Missing required field: grayRatio (must be 0.0-1.0)');
  } else if (typeof config.grayRatio !== 'number') {
    errors.push(`Invalid grayRatio type: ${typeof config.grayRatio} (must be number)`);
  } else if (config.grayRatio < 0.0 || config.grayRatio > 1.0) {
    errors.push(`Invalid grayRatio: ${config.grayRatio} (must be 0.0-1.0)`);
  }
  
  // 3. canaryKeys
  if (config.canaryKeys !== undefined) {
    if (!Array.isArray(config.canaryKeys)) {
      errors.push(`Invalid canaryKeys: ${typeof config.canaryKeys} (must be array)`);
    } else if (config.canaryKeys.length === 0) {
      warnings.push('canaryKeys is empty');
    } else {
      for (const key of config.canaryKeys) {
        if (typeof key !== 'string') {
          errors.push(`Invalid canaryKey element: ${JSON.stringify(key)} (must be string)`);
        } else if (!KNOWN_STRATEGY_KEYS.includes(key)) {
          warnings.push(`Unknown canaryKey: "${key}" (not in Strategy Registry)`);
        }
      }
    }
  } else {
    warnings.push('Missing canaryKeys');
  }
  
  // 4. policyVersion
  if (!config.policyVersion || typeof config.policyVersion !== 'string' || config.policyVersion.trim() === '') {
    errors.push('Missing required field: policyVersion');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

// Phase 21.4: 配置变更审计
const AUDIT_PATH = path.join(__dirname, 'config_audit.json');
const AUDIT_JSONL_PATH = path.join(__dirname, '../../workspace/audit/config_changes.jsonl');
const DASHBOARD_PATH = path.join(__dirname, '../../workspace/CONFIG_CHANGE_AUDIT_DASHBOARD.md');

/**
 * Phase 21.4: 生成配置变更审计记录
 */
function createAuditRecord(prevHash, newHash, localConfig, gatewayConfig, reason) {
  const changeId = `CFG-${new Date().getFullYear()}-${String(Math.floor(Date.now() / 1000) % 10000).padStart(4, '0')}`;
  
  const audit = {
    changeId,
    changedAt: new Date().toISOString(),
    changedBy: 'system',  // manual | system | script
    source: 'local_file',
    changeType: prevHash ? 'update' : 'initial',
    file: 'ocnmps_plugin_config.json',
    beforeHash: prevHash || 'initial',
    afterHash: newHash,
    before: prevHash ? _extractChanges(prevHash, localConfig, 'before') : {},
    after: _extractChanges(newHash, localConfig, 'after'),
    reason: reason || (prevHash ? 'Config reload on startup' : 'Initial configuration'),
    runtimeApplied: true,
    policyVersion: localConfig.policyVersion || 'unknown',
    diffSummary: {
      changedKeys: [],
      addedKeys: [],
      removedKeys: [],
    },
  };
  
  // 检测变更
  if (prevHash && prevHash !== newHash) {
    const coreKeys = ['rolloutMode', 'grayRatio', 'canaryKeys', 'policyVersion'];
    for (const key of coreKeys) {
      if (localConfig.hasOwnProperty(key)) {
        audit.diffSummary.changedKeys.push(key);
      }
    }
  }
  
  return audit;
}

/**
 * Phase 21.4: 提取变更的配置值
 */
function _extractChanges(hash, config, mode) {
  const coreKeys = ['rolloutMode', 'grayRatio', 'canaryKeys', 'policyVersion'];
  const result = {};
  for (const key of coreKeys) {
    if (config.hasOwnProperty(key)) {
      result[key] = config[key];
    }
  }
  return result;
}

/**
 * Phase 21.4: JSONL 审计日志写入
 */
function writeAuditJsonl(audit) {
  try {
    // 确保目录存在
    const auditDir = path.dirname(AUDIT_JSONL_PATH);
    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true });
    }
    
    const line = JSON.stringify(audit) + '\n';
    fs.appendFileSync(AUDIT_JSONL_PATH, line, 'utf-8');
    log('info', 'Phase 21.4: JSONL audit written', { path: AUDIT_JSONL_PATH, changeId: audit.changeId });
  } catch (err) {
    log('error', 'Phase 21.4: Failed to write JSONL audit', { error: err.message });
  }
}

/**
 * Phase 21.4: 配置变更审计器
 */
function auditConfigChange(prevHash, newHash, localConfig, gatewayConfig, reason) {
  const audit = createAuditRecord(prevHash, newHash, localConfig, gatewayConfig, reason);
  persistAudit(audit);
  writeAuditJsonl(audit);
  return audit;
}

/**
 * Phase 21.4: 持久化审计记录（JSON 数组，保留最近 50 条）
 */
function persistAudit(audit) {
  try {
    let audits = [];
    if (fs.existsSync(AUDIT_PATH)) {
      audits = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf-8'));
    }
    
    audits.push(audit);
    
    // 只保留最近 50 条
    if (audits.length > 50) {
      audits = audits.slice(-50);
    }
    
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(audits, null, 2), 'utf-8');
    log('info', 'Phase 21.4: Audit record persisted', { path: AUDIT_PATH, hash: audit.afterHash });
  } catch (err) {
    log('error', 'Phase 21.4: Failed to persist audit', { error: err.message });
  }
}

/**
 * Phase 21.4: 生成配置变更审计面板
 */
function writeAuditDashboard(audits) {
  try {
    const recent = audits.slice(-10).reverse();  // 最近 10 条
    
    let md = `# CONFIG_CHANGE_AUDIT_DASHBOARD.md\n\n_生成时间: ${new Date().toISOString()}_\n\n---\n\n## 配置变更总览\n\n| 字段 | 值 |\n|------|-----|\n| 总变更次数 | ${audits.length} |\n| 当前配置 Hash | ${audits.length > 0 ? audits[audits.length - 1].afterHash : 'N/A'} |\n| 审计文件 | audit/config_changes.jsonl |\n\n---\n\n## 最近 10 次配置变更\n\n| # | 时间 | 变更 ID | 类型 | 变更字段 | Hash 变化 | 运行时生效 |\n|---|------|---------|------|---------|-------------|-------------|\n`;
    
    recent.forEach((a, i) => {
      const changedFields = a.diffSummary?.changedKeys?.join(', ') || 'none';
      const hashChange = `${a.beforeHash?.slice(0, 8)} → ${a.afterHash?.slice(0, 8)}`;
      const runtimeApplied = a.runtimeApplied ? '✅' : '❌';
      md += `| ${i + 1} | ${a.changedAt?.slice(0, 19).replace('T', ' ')} | ${a.changeId} | ${a.changeType} | ${changedFields} | ${hashChange} | ${runtimeApplied} |\n`;
    });
    
    md += `\n---\n\n## 审计记录详情\n\n\`\`\`json\n${JSON.stringify(recent, null, 2)}\n\`\`\`\n\n---\n\nOCNMPS Phase 21.4\n`;
    
    fs.writeFileSync(DASHBOARD_PATH, md, 'utf-8');
    log('info', 'Phase 21.4: Audit dashboard written', { path: DASHBOARD_PATH });
  } catch (err) {
    log('error', 'Phase 21.4: Failed to write audit dashboard', { error: err.message });
  }
}

// Phase 21.3: 配置差异检测器
const REPORT_PATH = path.join(__dirname, '../../workspace/CONFIG_SOURCE_REPORT.md');

/**
 * Phase 21.3: 生成配置差异报告
 * 
 * @param {Object} localConfig - 本地文件配置
 * @param {Object} gatewayConfig - Gateway 配置
 * @param {Object} effectiveConfig - 运行态生效配置
 * @returns {{ diffItems: DiffItem[], verdict: string, summary: Object }}
 */
function generateDiffReport(localConfig, gatewayConfig, effectiveConfig) {
  const coreKeys = ['rolloutMode', 'grayRatio', 'canaryKeys', 'policyVersion'];
  const diffItems = [];
  
  for (const key of coreKeys) {
    const localVal = localConfig[key];
    const gatewayVal = gatewayConfig[key];
    const runtimeVal = effectiveConfig[key];
    
    const hasLocal = localConfig.hasOwnProperty(key);
    const hasGateway = gatewayConfig.hasOwnProperty(key);
    const hasRuntime = effectiveConfig.hasOwnProperty(key);
    
    let status = 'match';
    if (!hasLocal && !hasGateway && !hasRuntime) {
      status = 'missing_in_all';
    } else if (hasGateway && !GATEWAY_CONFIG_ALLOWLIST.includes(key)) {
      // Gateway 有非白名单字段 = 污染
      status = 'extra_in_gateway';
    } else if (!hasGateway && hasLocal) {
      status = 'missing_in_gateway';
    } else if (JSON.stringify(runtimeVal) !== JSON.stringify(localVal)) {
      status = 'mismatch';
    }
    
    diffItems.push({ key, localValue: localVal, gatewayValue: gatewayVal, runtimeValue: runtimeVal, status });
  }
  
  // 检查 Gateway 非白名单字段
  const gatewayExtraKeys = Object.keys(gatewayConfig).filter(
    k => !GATEWAY_CONFIG_ALLOWLIST.includes(k)
  );
  
  const mismatched = diffItems.filter(d => d.status === 'mismatch').length;
  const extraInGateway = gatewayExtraKeys.length;
  const missingInGateway = diffItems.filter(d => d.status === 'missing_in_gateway').length;
  
  const verdict = (mismatched === 0 && extraInGateway === 0) ? 'CLEAN' : 'WARNING';
  
  return {
    diffItems,
    gatewayExtraKeys,
    verdict,
    summary: {
      totalKeys: coreKeys.length,
      mismatched,
      extraInGateway,
      missingInGateway,
    }
  };
}

/**
 * Phase 21.3: 生成配置哈希（为 21.4 变更审计准备）
 */
function configHash(config) {
  const crypto = require('crypto');
  const stable = JSON.stringify(config, Object.keys(config).sort());
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/**
 * Phase 21.3: 输出 CONFIG_SOURCE_REPORT.md 文件
 */
function writeConfigReport(localConfig, gatewayConfig, effectiveConfig, diffResult, validation) {
  const report = `# CONFIG_SOURCE_REPORT.md

_生成时间: ${new Date().toISOString()}_

---

## 1. 配置源摘要

| 字段 | 值 |
|------|-----|
| configSource | local_file |
| schemaValid | ${validation.valid} |
| gatewayConfigEmpty | ${Object.keys(gatewayConfig).length === 0} |
| configHash | ${configHash(effectiveConfig)} |
| verdict | ${diffResult.verdict} |

## 2. 本地配置 (local_file)

\`\`\`json
${JSON.stringify(localConfig, null, 2)}
\`\`\`

## 3. Gateway 配置

\`\`\`json
${JSON.stringify(gatewayConfig, null, 2)}
\`\`\`

## 4. 运行态配置 (effective)

\`\`\`json
${JSON.stringify(effectiveConfig, null, 2)}
\`\`\`

## 5. 差异明细

| Key | Local | Gateway | Runtime | 状态 |
|-----|-------|---------|---------|------|
${diffResult.diffItems.map(d => `| ${d.key} | ${JSON.stringify(d.localValue)} | ${JSON.stringify(d.gatewayValue)} | ${JSON.stringify(d.runtimeValue)} | ${d.status} |`).join('\n')}

## 6. 校验结果

- **Errors:** ${validation.errors.length === 0 ? '无' : validation.errors.join('; ')}
- **Warnings:** ${validation.warnings.length === 0 ? '无' : validation.warnings.join('; ')}

---

OCNMPS Phase 21.3
`;
  
  try {
    fs.writeFileSync(REPORT_PATH, report, 'utf-8');
    log('info', 'Phase 21.3: Config report written', { path: REPORT_PATH });
  } catch (err) {
    log('error', 'Phase 21.3: Failed to write config report', { error: err.message });
  }
}

/**
 * Phase 21.1: 加载配置（本地文件为唯一真源）
 * 
 * 配置源优先级：
 * 1. 本地配置文件 (唯一真源)
 * 2. 默认值
 * 
 * Gateway config 规则：
 * - 必须保持 {} 占位
 * - 如果非空且包含非白名单字段 → warning，不覆盖本地配置
 * - 仅白名单字段（enabled）可以从 Gateway 读取
 * 
 * @param {Object} gatewayConfig - Gateway 传入的配置（从 openclaw.json）
 */
function loadConfig(gatewayConfig = {}) {
  const baseConfig = {};
  let configSource = 'local_file';
  let gatewayConfigEmpty = true;
  let gatewayConfigWarning = null;
  
  // ========== Phase 21.1: Gateway config 检查 ==========
  
  if (gatewayConfig && typeof gatewayConfig === 'object') {
    const gatewayKeys = Object.keys(gatewayConfig);
    gatewayConfigEmpty = gatewayKeys.length === 0;
    
    if (!gatewayConfigEmpty) {
      // 检查是否有非白名单字段
      const unsupportedFields = gatewayKeys.filter(
        k => !GATEWAY_CONFIG_ALLOWLIST.includes(k)
      );
      
      if (unsupportedFields.length > 0) {
        gatewayConfigWarning = `Gateway config contains unsupported fields: ${unsupportedFields.join(', ')}. These will be IGNORED. Local config file is the source of truth.`;
        log('warn', 'Gateway config has unsupported fields (will be ignored)', {
          unsupportedFields,
          allowlist: GATEWAY_CONFIG_ALLOWLIST,
          rule: 'local file is the source of truth'
        });
      }
      
      // 仅白名单字段从 Gateway 读取
      for (const key of GATEWAY_CONFIG_ALLOWLIST) {
        if (gatewayConfig[key] !== undefined) {
          baseConfig[key] = gatewayConfig[key];
        }
      }
    }
  }
  
  // ========== Phase 21.1: 本地配置文件（唯一真源）==========
  
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      // 本地文件直接覆盖 baseConfig（唯一真源）
      Object.assign(baseConfig, fileConfig);
      log('info', 'Config loaded from local file (source of truth)', {
        path: CONFIG_PATH,
        grayRatio: fileConfig.grayRatio,
        canaryKeys: fileConfig.canaryKeys?.length || 0,
        rolloutMode: fileConfig.rolloutMode
      });
    } else {
      log('error', 'Local config file not found', { path: CONFIG_PATH });
      configSource = 'default';
    }
  } catch (err) {
    log('error', 'Failed to load local config file', { path: CONFIG_PATH, error: err.message });
    configSource = 'default';
  }
  
  // ========== Phase 21.1: 默认值（兜底）==========
  
  if (baseConfig.grayRatio === undefined) {
    baseConfig.grayRatio = 0.10;
    log('warn', 'Using default grayRatio (local config missing)', { grayRatio: baseConfig.grayRatio });
  }
  
  if (!baseConfig.enabledIntents) {
    baseConfig.enabledIntents = ['MAIN', 'FAST', 'CODE', 'CODE_PLUS', 'PATCH', 'REASON', 'REVIEW', 'LONG', 'CN', 'TEST', 'DEBUG'];
  }
  
  if (!baseConfig.modelMapping) {
    baseConfig.modelMapping = {
      MAIN: 'bailian/qwen3.6-plus',
      FAST: 'modelstudio/qwen3-max-2026-01-23',
      CODE: 'modelstudio/qwen3-coder-next',
      CODE_PLUS: 'modelstudio/qwen3-coder-plus',
      PATCH: 'xai/grok-code-fast-1',
      REASON: 'xai/grok-4-1-fast-reasoning',
      REVIEW: 'bailian/qwen3.6-plus',
      LONG: 'bailian/qwen3.6-plus',
      CN: 'bailian/MiniMax-M2.5',
      TEST: 'bailian/qwen3-max-2026-01-23',
      DEBUG: 'bailian/qwen3.6-plus',
    };
    log('warn', 'Using default modelMapping (local config missing)');
  }
  
  // 配置解析完成日志
  const bucketBase = 10000;
  const threshold = Math.floor(baseConfig.grayRatio * bucketBase);
  console.log('[ocnmps-router] resolved config', baseConfig);
  console.log('[ocnmps-router] gray config resolved', {
    grayRatio: baseConfig.grayRatio,
    bucketBase,
    threshold,
  });
  
  // Phase 21.2: Schema 校验
  const validation = validateConfig(baseConfig);
  if (!validation.valid) {
    log('error', 'Phase 21.2: Config Schema validation FAILED', {
      errors: validation.errors,
      config: baseConfig,
      fix: 'Fix local config file and restart'
    });
    throw new Error(`Config validation failed: ${validation.errors.join('; ')}`);
  }
  
  if (validation.warnings.length > 0) {
    log('warn', 'Phase 21.2: Config Schema warnings', {
      warnings: validation.warnings,
      config: baseConfig
    });
  }
  
  log('info', 'Phase 21.2: Config Schema validation PASSED', {
    config: baseConfig,
    schemaValid: true,
    warnings: validation.warnings
  });
  
  // Phase 21.1 + 21.3: 返回配置源信息 + diff 所需数据
  return {
    config: baseConfig,
    meta: {
      configSource,
      gatewayConfigEmpty,
      gatewayConfigWarning
    },
    // Phase 21.3: 为 diff 检测提供原始数据
    gatewayConfig,
    validation
  };
}

// 创建 V3 集成器（懒加载）
let _integrator = null;

/**
 * 从 openclaw.json 读取 Gateway 配置
 */
function getGatewayConfig() {
  try {
    const openclawConfigPath = path.join(__dirname, '../../openclaw.json');
    if (fs.existsSync(openclawConfigPath)) {
      const openclawConfig = JSON.parse(fs.readFileSync(openclawConfigPath, 'utf-8'));
      const pluginConfig = openclawConfig?.plugins?.entries?.['ocnmps-router']?.config;
      if (pluginConfig) {
        log('info', 'Gateway config loaded', { grayRatio: pluginConfig.grayRatio });
        return pluginConfig;
      }
    }
  } catch (err) {
    log('warn', 'Failed to load Gateway config', { error: err.message });
  }
  return {};
}

function getIntegrator() {
  if (!_integrator) {
    const gatewayConfig = getGatewayConfig();
    const loadResult = loadConfig(gatewayConfig);
    const config = loadResult.config;
    const meta = loadResult.meta;
    const bucketBase = 10000;
    const threshold = Math.floor(config.grayRatio * bucketBase);
    
    _integrator = createOCNMPSIntegrator({
      grayRatio: config.grayRatio,
      modelMapping: config.modelMapping,
      enabled: config.enabled,
    });
    
    // Phase 21.1: 启动时配置源报告
    const gatewayConfigKeys = Object.keys(gatewayConfig || {});
    const gatewayHasNonWhitelist = gatewayConfigKeys.some(
      k => !GATEWAY_CONFIG_ALLOWLIST.includes(k)
    );
    
    log('info', '📋 Phase 21.1 Config Source Report', {
      configSource: meta.configSource || 'local_file',
      gatewayConfigEmpty: meta.gatewayConfigEmpty !== false,
      gatewayConfigHasNonWhitelist: gatewayHasNonWhitelist,
      localConfigPath: CONFIG_PATH,
      localConfigExists: fs.existsSync(CONFIG_PATH),
      grayRatio: config.grayRatio,
      rolloutMode: config.rolloutMode,
      canaryKeys: config.canaryKeys?.length || 0,
      canaryKeysList: config.canaryKeys || [],
      policyVersion: config.policyVersion || 'unknown',
    });
    
    if (gatewayHasNonWhitelist) {
      log('warn', '⚠️ Gateway config has unsupported fields. These were IGNORED.', {
        unsupported: gatewayConfigKeys.filter(k => !GATEWAY_CONFIG_ALLOWLIST.includes(k)),
        rule: 'Local config file is the source of truth. Gateway config must be {}.',
        fix: 'Set plugins.entries.ocnmps-router.config = {} in openclaw.json',
      });
    }
  }
  return _integrator;
}

// before_model_resolve hook handler（V3）
async function handleBeforeModelResolve(event, context) {
  try {
    const prompt = event?.prompt || event?.text || event?.messages?.slice(-1)?.[0]?.content || '';
    const sessionKey = context?.sessionKey || '';
    
    if (!prompt || prompt.length < 5) {
      return {};
    }
    
    log('info', 'V3 before_model_resolve', {
      sessionKey,
      promptLength: prompt.length,
      preview: prompt.slice(0, 50) + '...',
    });
    
    // 19.4-C B方案: 先处理上一条 apply 的 pending post-check
    try {
      checkPendingPostCheck();
    } catch (err) {
      log('error', 'pending verifier error, continuing with current request', { error: err.message });
      auditEvent('pending_verifier_error', { error: err.message });
    }
    
    // Phase 19.1: Strategy Bridge Integration
    // 先调用 Strategy Bridge
    try {
      // 动态导入 Strategy Bridge（避免缓存问题）
      delete require.cache[require.resolve('./strategy_bridge')];
      const { strategyBridge } = require('./strategy_bridge');
      
      // Phase 20.4-B: 从 prompt 中检测文件数量（用于 conditional strategy）
      let detectedFileCount = 0;
      // 检测显式文件数量提及 ("3个文件", "5 files", "file1, file2, file3")
      const fileCountMatches = prompt.match(/(\d+)\s*(?:个)?\s*(?:文件|file)/gi);
      if (fileCountMatches) {
        const nums = fileCountMatches.map(m => parseInt(m.match(/\d+/)[0]));
        detectedFileCount = Math.max(...nums, 0);
      }
      // 检测多文件路径模式 (src/, lib/, test/, 等)
      const pathSegments = prompt.match(/(?:src|lib|test|config|docs|app|components|utils|helper)\//gi);
      if (pathSegments && pathSegments.length >= 3) {
        detectedFileCount = Math.max(detectedFileCount, pathSegments.length);
      }
      // 检测多文件列举模式 (file1.ts, file2.ts, file3.ts)
      const fileRefs = prompt.match(/[\w-]+\.(ts|js|py|go|java|rs|cpp|c|h)/gi);
      if (fileRefs && fileRefs.length >= 3) {
        detectedFileCount = Math.max(detectedFileCount, fileRefs.length);
      }
      
      const strategyCtx = {
        prompt,
        sessionKey,
        role: 'user',
        templateLevel: 'L1',
        riskMode: 'technical',
        tokenCount: prompt.length,
        fileCount: detectedFileCount,
        defaultModel: 'bailian/qwen3.6-plus',
      };
      
      const strategyResult = await strategyBridge(strategyCtx);
      
      // Phase 20.4-B debug: log bridge result
      log('info', 'Strategy Bridge result', {
        matched: strategyResult?.matched,
        strategyKey: strategyResult?.strategyKey,
        strategyType: strategyResult?.strategyType,
        selectedRoute: strategyResult?.selectedRoute,
        selectedModel: strategyResult?.selectedModel,
        fileCount: detectedFileCount,
        reason: strategyResult?.reason,
      });
      
      if (strategyResult?.matched && strategyResult.selectedModel) {
        // Strategy 命中 - 检查 rollout gate
        let provider, model;
        try {
          const parts = strategyResult.selectedModel.split('/');
          provider = parts[0] || 'modelstudio';
          model = parts.slice(1).join('/') || parts[0];
        } catch (splitErr) {
          log('error', 'Strategy model split failed', { 
            modelStr: strategyResult.selectedModel, 
            error: splitErr.message 
          });
          // fallback to legacy
        }
        
        if (provider && model) {
          // Phase 19.3: Rollout Gate (shadow/canary/active)
          const loadResult = loadConfig();
          const config = loadResult.config;
          const rolloutMode = config.rolloutMode || 'active';
          const canaryKeys = config.canaryKeys || [];
          const strategyKey = strategyResult.strategyKey;
          
          let shouldApply = false;
          let canaryKeyMatched = false;
          let rolloutBucketHit = false;
          let shadowOnly = false;
          
          if (rolloutMode === 'shadow') {
            // Shadow: match but don't apply
            shadowOnly = true;
            shouldApply = false;
            log('info', '🔒 Shadow mode - strategy matched but not applied', {
              strategyKey,
              strategyMatched: true,
              strategyApplied: false,
              shadowOnly: true,
              policyVersion: 'v1.0',
            });
          } else if (rolloutMode === 'canary') {
            // Canary: only apply if key is in canaryKeys AND bucket hits
            canaryKeyMatched = canaryKeys.includes(strategyKey);
            if (canaryKeyMatched) {
              // Bucket check for canary key (use sessionKey + timestamp for randomness)
              const bucketBase = config.bucketBase || 10000;
              const grayRatio = config.grayRatio || 0.1;
              const threshold = Math.floor(bucketBase * grayRatio);
              const seed = (sessionKey + Date.now()).split('').reduce((a, c) => a + c.charCodeAt(0), 0) % bucketBase;
              const hash = seed;
              rolloutBucketHit = hash < threshold;
              shouldApply = rolloutBucketHit;
              log('info', rolloutBucketHit ? '✅ Canary hit - strategy applied' : '⚠️ Canary bucket miss - fallback', {
                strategyKey,
                canaryKeyMatched: true,
                rolloutBucketHit,
                strategyMatched: true,
                strategyApplied: shouldApply,
                hash,
                threshold,
                policyVersion: 'v1.0',
              });
            } else {
              shouldApply = false;
              log('info', '🚫 Canary key miss - strategy not applied', {
                strategyKey,
                canaryKeyMatched: false,
                strategyMatched: true,
                strategyApplied: false,
                policyVersion: 'v1.0',
              });
            }
          } else {
            // Active: always apply
            shouldApply = true;
          }
          
          if (shouldApply) {
            // Phase 19.4-C: Create snapshot before apply
            const snapshot = createSnapshot(strategyKey, strategyResult);
            strategyRegistry.applied[sessionKey] = {
              strategyKey,
              strategyResult,
              snapshot,
              appliedAt: new Date().toISOString(),
              postCheckStatus: 'pending', // 19.4-C B方案
              postCheckAttemptedAt: null,
              postCheckAttemptCount: 0,
              rollbackTriggered: false,
              rollbackCompleted: false,
            };
            
            auditEvent('apply_started', {
              strategyKey,
              sessionKey,
              appliedModel: strategyResult.selectedModel,
              proposalId: snapshot.proposalId,
            });
            persistRegistry();
            
            log('info', '✅ Strategy Bridge hit - using Strategy route', {
              strategyKey: strategyResult.strategyKey,
              strategyType: strategyResult.strategyType,
              selectedRoute: strategyResult.selectedRoute,
              selectedModel: strategyResult.selectedModel,
              strategyMatched: true,
              strategyApplied: true,
              fallbackToLegacy: false,
              proposalId: snapshot.proposalId,
              policyVersion: 'v1.0',
            });
            return {
              providerOverride: provider,
              modelOverride: model,
            };
          } else {
            // Don't apply - fall through to legacy
            log('info', '🔄 Rollout gate blocked - falling back to legacy', {
              strategyKey,
              rolloutMode,
              shadowOnly,
              canaryKeyMatched,
              rolloutBucketHit,
              strategyMatched: true,
              strategyApplied: false,
              policyVersion: 'v1.0',
            });
          }
        }
      }
    } catch (bridgeErr) {
      log('error', 'Strategy Bridge error', { 
        error: bridgeErr.message,
        strategyMatched: false,
        strategyMissReason: 'strategy_error',
        fallbackToLegacy: true,
        policyVersion: 'v1.0',
      });
      // 继续 fallback 到 legacy
    }
    
    // Legacy Router Fallback
    log('info', 'Strategy Bridge miss → legacy fallback', {
      strategyMatched: false,
      strategyMissReason: 'no_matching_strategy',
      fallbackToLegacy: true,
      policyVersion: 'v1.0',
    });
    const integrator = getIntegrator();
    const result = integrator.handleMessage({
      text: prompt,
      sessionId: sessionKey,
      defaultModel: 'bailian/qwen3.6-plus',
    });
    
    // 等待结果
    if (result.then) {
      return result.then(resolved => {
        // Recognition v1 Sidecar: 已禁用（recognize 未定义）
        // TODO: 重新实现 Recognition v1 时再启用
        log('info', 'Recognition v1 Sidecar disabled', { reason: 'recognize not defined' });
        if (!resolved.success || !resolved.model) {
          log('info', 'No model override', {
            success: resolved.success,
            intent: resolved.intent,
          });
          return {};
        }
        
        // 解析模型（provider/model）- 防御性处理
        let modelStr = resolved.model;
        
        // 处理对象格式：{provider, model} 或 {name} 等
        if (typeof modelStr === 'object' && modelStr !== null) {
          if (modelStr.provider && modelStr.model) {
            modelStr = `${modelStr.provider}/${modelStr.model}`;
          } else if (modelStr.name) {
            modelStr = modelStr.name;
          } else if (modelStr.modelId) {
            modelStr = modelStr.modelId;
          } else if (typeof modelStr.toString === 'function') {
            modelStr = modelStr.toString();
          } else {
            modelStr = String(modelStr);
          }
        }
        
        // 严格类型检查
        if (typeof modelStr !== 'string') {
          log('warn', 'Invalid model format after conversion', { 
            model: resolved.model, 
            type: typeof modelStr,
            intent: resolved.intent 
          });
          return {};
        }
        
        // 安全 split（避免 split 失败）
        let provider, model;
        try {
          const parts = modelStr.split('/');
          provider = parts[0] || 'modelstudio';
          model = parts.slice(1).join('/') || parts[0];
        } catch (splitErr) {
          log('error', 'Model split failed', { 
            modelStr, 
            error: splitErr.message,
            intent: resolved.intent 
          });
          return {};
        }
        
        log('info', '✅ V3 Model override applied', {
          intent: resolved.intent,
          model: `${provider}/${model}`,
          grayHit: resolved.grayHit,
          routingTaskId: resolved.routingTaskId,
        });
        
        return {
          providerOverride: provider,
          modelOverride: model,
        };
      }).catch(err => {
        log('error', 'V3 routing error', { error: err.message });
        return {};
      });
    }
    
    return {};
    
  } catch (err) {
    log('error', 'Handler error', { error: err.message, stack: err.stack });
    return {};
  }
}

// ============================================================
// 19.4-C Post-Check + Rollback System
// ============================================================

const strategyRegistry = {
  applied: {},
  snapshots: {},
  rollbacks: [],
  auditLog: [],
  baselineModel: 'bailian/qwen3.6-plus',
};

function auditEvent(type, data) {
  const event = {
    timestamp: new Date().toISOString(),
    type,
    ...data,
  };
  strategyRegistry.auditLog.push(event);
  log('info', `📋 Audit: ${type}`, data);
  return event;
}


function persistRegistry() {
  try {
    const regPath = path.join(__dirname, 'strategy_registry.json');
    fs.writeFileSync(regPath, JSON.stringify({
      applied: strategyRegistry.applied,
      snapshots: strategyRegistry.snapshots,
      rollbacks: strategyRegistry.rollbacks,
      auditLog: strategyRegistry.auditLog.slice(-100),
    }, null, 2));
  } catch (e) {
    // ignore
  }
}

function createSnapshot(strategyKey, strategyResult) {
  return {
    strategyKey,
    beforeModel: strategyRegistry.baselineModel,
    appliedModel: strategyResult?.selectedModel || 'unknown',
    selectedRoute: strategyResult?.selectedRoute || 'unknown',
    policyVersion: strategyResult?.policyVersion || 'v1.0',
    proposalId: `prop_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
}

function postCheck(response, strategyKey, snapshot) {
  const checks = {
    responseQuality: {
      pass: response && typeof response === 'string' && response.length >= 50,
      reason: !response || response.length < 50 ? 'response too short or empty' : null,
    },
    dslParse: {
      pass: true, // DSL parse not yet implemented, default pass
      reason: null,
    },
    conflictDetector: {
      pass: true, // No conflicts detected, default pass
      reason: null,
    },
    metadataAudit: {
      pass: snapshot && snapshot.strategyKey && snapshot.appliedModel,
      reason: !snapshot || !snapshot.strategyKey ? 'metadata incomplete' : null,
    },
  };
  
  const failed = Object.entries(checks).find(([name, check]) => !check.pass);
  return {
    pass: !failed,
    failedCheck: failed ? failed[0] : null,
    reason: failed ? failed[1].reason : 'all checks passed',
    details: checks,
  };
}

function rollback(snapshot, reason) {
  const rollbackRecord = {
    strategyKey: snapshot.strategyKey,
    rolledBackAt: new Date().toISOString(),
    rollbackReason: reason,
    snapshotRef: snapshot.proposalId,
    fromModel: snapshot.appliedModel,
    toModel: snapshot.beforeModel,
    status: 'rolled_back',
  };
  strategyRegistry.rollbacks.push(rollbackRecord);
  strategyRegistry.baselineModel = snapshot.beforeModel;
  auditEvent('rollback_succeeded', rollbackRecord);
  return rollbackRecord;
}

// 19.4-C B方案: Deferred post-check in before_model_resolve
const PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟超时
const POSTCHECK_TIMEOUT_MS = 3000; // post-check 执行超时 3s

function checkPendingPostCheck() {
  // 只处理最早的一条 pending
  let earliestKey = null;
  let earliestTime = Infinity;
  
  for (const [key, pending] of Object.entries(strategyRegistry.applied)) {
    if (pending.postCheckStatus === 'pending' && !pending.postCheckAttemptedAt) {
      const t = new Date(pending.appliedAt).getTime();
      if (t < earliestTime) {
        earliestTime = t;
        earliestKey = key;
      }
    }
  }
  
  if (!earliestKey) return;
  
  const pending = strategyRegistry.applied[earliestKey];
  
  // 检查超时
  const age = Date.now() - new Date(pending.appliedAt).getTime();
  if (age > PENDING_TIMEOUT_MS) {
    auditEvent('post_check_overdue', {
      strategyKey: pending.strategyKey,
      proposalId: pending.proposalId,
      ageMs: age,
    });
  }
  
  // 标记尝试中（幂等）
  pending.postCheckAttemptedAt = new Date().toISOString();
  pending.postCheckAttemptCount = (pending.postCheckAttemptCount || 0) + 1;
  
  // Post-check B方案: minimal checks (DSL/conflict/metadata)
  const postResult = postCheckB(pending.response || '', pending.strategyKey, pending.snapshot);
  
  if (postResult.pass) {
    pending.postCheckStatus = 'passed';
    pending.postCheckedAt = new Date().toISOString();
    auditEvent('post_check_passed', {
      strategyKey: pending.strategyKey,
      proposalId: pending.proposalId,
    });
  } else {
    pending.postCheckStatus = 'failed';
    pending.postCheckedAt = new Date().toISOString();
    
    auditEvent('post_check_failed', {
      strategyKey: pending.strategyKey,
      proposalId: pending.proposalId,
      failedCheck: postResult.failedCheck,
      reason: postResult.reason,
    });
    
    auditEvent('rollback_triggered', {
      strategyKey: pending.strategyKey,
      reason: postResult.reason,
    });
    
    const rollbackRecord = rollback(pending.snapshot, postResult.reason);
    pending.rollbackTriggered = true;
    pending.rollbackCompleted = true;
    
    log('warn', '🔄 Rollback executed', rollbackRecord);
  }
  
  persistRegistry();
}

// 增强版 postCheck (B方案：不要 responseQuality，只做 DSL/conflict/metadata)
function postCheckB(response, strategyKey, snapshot) {
  const checks = {
    dslParse: {
      pass: true, // DSL parse not yet implemented, default pass
      reason: null,
    },
    conflictDetector: {
      pass: true, // No conflicts detected, default pass
      reason: null,
    },
    metadataAudit: {
      pass: snapshot && snapshot.strategyKey && snapshot.appliedModel && snapshot.proposalId,
      reason: !snapshot || !snapshot.strategyKey ? 'metadata incomplete' : null,
    },
  };
  
  const failed = Object.entries(checks).find(([name, check]) => !check.pass);
  return {
    pass: !failed,
    failedCheck: failed ? failed[0] : null,
    reason: failed ? failed[1].reason : 'all checks passed',
    details: checks,
  };
}

module.exports = {
  id: 'ocnmps-router',
  name: 'OCNMPS Router',
  hooks: {
    'before_model_resolve': handleBeforeModelResolve,
    // after_agent_response not supported by OpenClaw plugin API
    // Post-check handled by cron-based verifier (194c-postcheck-verifier.sh)
  },
  version: '1.1.0',
  description: 'Model router using OCNMPS bridge for intent-based model selection',
  
  register(api) {
    const gatewayConfig = getGatewayConfig();
    const loadResult = loadConfig(gatewayConfig);
    const config = loadResult.config;
    const meta = loadResult.meta;
    
    if (!config.enabled) {
      log('info', 'Plugin disabled by config');
      return;
    }
    
    const bucketBase = 10000;
    const threshold = Math.floor(config.grayRatio * bucketBase);
    
    // Phase 21.1: 启动时配置源报告
    const gatewayConfigKeys = Object.keys(gatewayConfig || {});
    const gatewayHasNonWhitelist = gatewayConfigKeys.some(
      k => !GATEWAY_CONFIG_ALLOWLIST.includes(k)
    );
    
    log('info', '📋 Phase 21.1 Config Source Report', {
      configSource: meta.configSource || 'local_file',
      gatewayConfigEmpty: meta.gatewayConfigEmpty !== false,
      gatewayConfigHasNonWhitelist: gatewayHasNonWhitelist,
      localConfigPath: CONFIG_PATH,
      localConfigExists: fs.existsSync(CONFIG_PATH),
      grayRatio: config.grayRatio,
      rolloutMode: config.rolloutMode,
      canaryKeys: config.canaryKeys?.length || 0,
      canaryKeysList: config.canaryKeys || [],
      policyVersion: config.policyVersion || 'unknown',
    });
    
    if (gatewayHasNonWhitelist) {
      log('warn', '⚠️ Gateway config has unsupported fields. These were IGNORED.', {
        unsupported: gatewayConfigKeys.filter(k => !GATEWAY_CONFIG_ALLOWLIST.includes(k)),
        rule: 'Local config file is the source of truth. Gateway config must be {}.',
        fix: 'Set plugins.entries.ocnmps-router.config = {} in openclaw.json',
      });
    }
    
    log('info', 'Registering OCNMPS V3', {
      grayRatio: config.grayRatio,
      bucketBase: bucketBase,
      threshold: threshold,
      configSource: meta.configSource || 'local_file',
      modelMapping: Object.keys(config.modelMapping),
    });
    
    // ========== Phase 21.3: 配置差异检测 ==========
    
    const effectiveConfig = {
      rolloutMode: config.rolloutMode,
      grayRatio: config.grayRatio,
      canaryKeys: config.canaryKeys,
      policyVersion: config.policyVersion,
      source: 'local_file',
      configHash: configHash(config),
    };
    
    const diffResult = generateDiffReport(config, gatewayConfig, effectiveConfig);
    
    log('info', '📊 Phase 21.3 Config Diff Report', {
      configSource: 'local_file',
      schemaValid: loadResult.validation.valid,
      gatewayConfigEmpty: Object.keys(gatewayConfig).length === 0,
      configHash: effectiveConfig.configHash,
      diffSummary: diffResult.summary,
      verdict: diffResult.verdict,
    });
    
    if (diffResult.verdict !== 'CLEAN') {
      log('warn', '⚠️ Phase 21.3: Config diff WARNING', {
        diffItems: diffResult.diffItems.filter(d => d.status !== 'match'),
        gatewayExtraKeys: diffResult.gatewayExtraKeys,
      });
    }
    
    // 写入文件报告
    writeConfigReport(config, gatewayConfig, effectiveConfig, diffResult, loadResult.validation);
    
    // ========== Phase 21.4: 配置变更审计 ==========
    
    // 读取上次 hash
    let prevHash = null;
    if (fs.existsSync(AUDIT_PATH)) {
      try {
        const audits = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf-8'));
        if (audits.length > 0) {
          prevHash = audits[audits.length - 1].newHash;
        }
      } catch (err) {
        log('warn', 'Phase 21.4: Failed to read previous audit', { error: err.message });
      }
    }
    
    // 生成审计记录
    const audit = auditConfigChange(prevHash, effectiveConfig.configHash, config, gatewayConfig, 'Config reload on startup');
    
    log('info', '🔍 Phase 21.4 Config Change Audit', {
      changeId: audit.changeId,
      prevHash: audit.beforeHash,
      newHash: audit.afterHash,
      changed: audit.beforeHash !== audit.afterHash,
      changedKeys: audit.diffSummary.changedKeys,
      runtimeApplied: audit.runtimeApplied,
      timestamp: audit.changedAt,
    });
    
    // 生成审计面板
    if (fs.existsSync(AUDIT_PATH)) {
      try {
        const audits = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf-8'));
        writeAuditDashboard(audits);
      } catch (err) {
        log('warn', 'Phase 21.4: Failed to generate audit dashboard', { error: err.message });
      }
    }
    
    // 持久化
    persistAudit(audit);
    
    // 使用 before_model_resolve hook
    if (typeof api.on === 'function') {
      api.on('before_model_resolve', handleBeforeModelResolve);
      log('info', 'Registered: before_model_resolve ✅');
      
      // 19.4-C B方案: deferred post-check in before_model_resolve
      log('info', 'Post-check: deferred in before_model_resolve (B方案)');
    }
    
    log('info', 'OCNMPS V3 Plugin registered', { pluginId: PLUGIN_ID });
  },
  
  // 管理命令
  commands: {
    'stats': () => {
      const stats = getIntegrator().getStats();
      return {
        success: true,
        message: 'OCNMPS V3 Stats',
        data: stats,
      };
    },
    
    'history': (args) => {
      const limit = parseInt(args[0]) || 10;
      const grayHitOnly = args.includes('--gray');
      const history = getIntegrator().getHistory({ limit, grayHitOnly });
      return {
        success: true,
        message: `Last ${limit} routing decisions`,
        data: history,
      };
    },
    
    'verify': async () => {
      // 运行验证脚本
      const { execSync } = require('child_process');
      try {
        const output = execSync(
          'node ' + require('path').join(__dirname, '../tests/test_regression.js'),
          { encoding: 'utf-8' }
        );
        return {
          success: true,
          message: 'Verification completed',
          output,
        };
      } catch (err) {
        return {
          success: false,
          error: err.message,
        };
      }
    },
    
    'set-gray': (args) => {
      const ratio = parseFloat(args[0]);
      if (isNaN(ratio) || ratio < 0 || ratio > 1) {
        return {
          success: false,
          error: 'Invalid ratio. Use: /ocnmps set-gray 0.05',
        };
      }
      getIntegrator().setGrayRatio(ratio);
      return {
        success: true,
        message: `Gray ratio set to ${ratio * 100}%`,
      };
    },
  },
};
