/**
 * OCNMPS Core V3 - JavaScript 版本
 * 
 * 路由核心逻辑（无需 TypeScript 编译）
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'ocnmps_v3.log');

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message, ...data };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {}
  console.log(`[OCNMPS-V3] ${message}`, data);
}

/**
 * 一致性哈希（MD5 分桶）
 */
function hashFunction(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * 判断是否为内部消息（不应路由）
 * 仅匹配真正的系统通知，不匹配带信封的用户消息
 */
function isInternalMessage(text = '') {
  const s = text.trim();
  
  // 真正的系统消息特征
  const internalPatterns = [
    /^System:\s*\[/,                       // [System: ...]
    /__openclaw_mem/,                       // 内存操作
    /^\[cron:/,                             // Cron 任务
    /heartbeat/i,                           // 心跳消息
    /^Exec (completed|failed)/,             // 命令完成通知
    /^Config (overwrite|patch|get)/,        // 配置操作通知
    /^Gateway restart/,                     // Gateway 重启通知
    /An async command you ran earlier/,     // 异步命令完成
  ];
  
  return internalPatterns.some(pattern => pattern.test(s));
}

/**
 * 提取用户正文（从封套消息中）
 */
function extractUserBody(text) {
  // 尝试提取 Actual message: 后的内容
  const actualMatch = text.match(/Actual message:\s*(.+)/i);
  if (actualMatch) {
    return actualMatch[1].trim();
  }
  
  // 尝试提取 webchat 格式的用户正文：[YYYY-MM-DD HH:MM:SS GMT...] 之后的内容
  const webchatMatch = text.match(/\[[\d-:\s+GMT+\]]+\]\s*(.+)/);
  if (webchatMatch) {
    return webchatMatch[1].trim();
  }
  
  // 尝试提取 content 字段
  const contentMatch = text.match(/"content":\s*"([^"]+)"/);
  if (contentMatch) {
    return contentMatch[1].trim();
  }
  
  return null;
}

/**
 * 意图识别（10 意图完整支持）
 * 优先级：DEBUG > PATCH, REVIEW > CODE
 */
function classifyIntent(text) {
  // Pre-filter: 排除内部消息
  if (isInternalMessage(text)) {
    log('info', 'Bypass internal message', { 
      reason: 'internal_message',
      preview: text.slice(0, 120) 
    });
    return null; // 不路由内部消息
  }
  
  // 尝试提取用户正文
  const userBody = extractUserBody(text);
  const textToClassify = userBody || text;
  
  const lower = textToClassify.toLowerCase();
  
  // DEBUG: 调试问题（优先于 PATCH）
  // 排查/调试信号优先于报错信号
  const hasDebugSignal = lower.includes('debug') || lower.includes('trace') || 
                         lower.includes('breakpoint') || lower.includes('调试') || 
                         lower.includes('断点') || lower.includes('排查') || 
                         lower.includes('定位') || lower.includes('调用栈');
  const hasFixSignal = lower.includes('fix') || lower.includes('修复') || 
                       lower.includes('patch') || lower.includes('hotfix');
  
  if (hasDebugSignal && !hasFixSignal) {
    return 'DEBUG';
  }
  
  // REVIEW: 代码审查（优先于 CODE）
  // 审查/安全信号优先于代码对象词
  const hasReviewSignal = lower.includes('review') || lower.includes('audit') || 
                          lower.includes('审查') || lower.includes('代码审查') || lower.includes('检查代码') ||
                          lower.includes('检查有没有') || lower.includes('漏洞') || 
                          lower.includes('安全') || lower.includes('风险') || 
                          lower.includes('安全性') || lower.includes('code review');
  const isCodeObject = lower.includes('代码') || lower.includes('写一个') || 
                       lower.includes('写') || lower.includes('实现');
  
  if (hasReviewSignal) {
    return 'REVIEW';
  }
  
  // CODE: 代码编写/生成
  if (lower.includes('write code') || lower.includes('create function') || 
      lower.includes('implement') || lower.includes('代码') || lower.includes('写一个')) {
    return 'CODE';
  }
  
  // CODE_PLUS: 复杂代码任务
  if (lower.includes('complex code') || lower.includes('optimize') || 
      lower.includes('refactor') || lower.includes('重构') || lower.includes('优化')) {
    return 'CODE_PLUS';
  }
  
  // PATCH: 代码修复/补丁（DEBUG 未命中时）
  if (lower.includes('fix') || lower.includes('bug') || lower.includes('patch') ||
      lower.includes('error') || lower.includes('not working') || lower.includes('修复') ||
      lower.includes('报错') || lower.includes('异常')) {
    return 'PATCH';
  }
  
  // TEST: 测试相关
  if (lower.includes('test') || lower.includes('unit test') || lower.includes('testing') ||
      lower.includes('测试') || lower.includes('单元测试')) {
    return 'TEST';
  }
  
  // REASON: 推理/解释
  if (lower.includes('why') || lower.includes('explain') || lower.includes('reason') ||
      lower.includes('because') || lower.includes('分析') || lower.includes('为什么') ||
      lower.includes('原因')) {
    return 'REASON';
  }
  
  // LONG: 长文本/详细解释
  if (text.length > 500 || lower.includes('in detail') || lower.includes('comprehensive') ||
      lower.includes('详细') || lower.includes('全面')) {
    return 'LONG';
  }
  
  // FAST: 快速简单问题
  if (text.length < 20 || lower.includes('weather') || lower.includes('time') ||
      lower.includes('quick')) {
    return 'FAST';
  }
  
  // MAIN: 默认（包含中文普通问答）
  return 'MAIN';
}

/**
 * 提取标签（tags）- 独立于主意图
 */
function extractTags(text) {
  const tags = [];
  const lower = text.toLowerCase();
  
  // CN: 中文内容标签
  if (/[\u4e00-\u9fff]/.test(text)) {
    tags.push('CN');
  }
  
  // FAST: 快速问题标签 - 仅当明确表达"快/短"意图时才添加
  // 不再仅凭长度触发，避免误标正常技术请求
  const hasFastIntent = lower.includes('简短') || lower.includes('简单一点') || 
                        lower.includes('一句话') || lower.includes('别展开') || 
                        lower.includes('先快速说') || lower.includes('直接说结论') || 
                        lower.includes('短一点') || lower.includes('简单说') ||
                        lower.includes('quick') || lower.includes('brief');
  
  if (hasFastIntent) {
    tags.push('FAST');
  }
  
  return tags;
}

/**
 * OCNMPS Router V3 类
 */
class OCNMPSRouterV3 {
  constructor(config = {}) {
    this.grayRatio = config.grayRatio ?? 0.30; // 默认 30% 灰度
    this.modelMapping = config.modelMapping || {
      MAIN: 'bailian/qwen3.6-plus',
      FAST: 'modelstudio/qwen3-max-2026-01-23',
      CODE: 'modelstudio/qwen3-coder-next',
      CODE_PLUS: 'modelstudio/qwen3-coder-plus',
      PATCH: 'xai/grok-code-fast-1',
      REASON: 'xai/grok-4-1-fast-reasoning',
      REVIEW: 'xai/grok-4-1-fast-reasoning',
      LONG: 'bailian/qwen3.6-plus',
      CN: 'modelstudio/MiniMax-M2.5',
      TEST: 'modelstudio/qwen3-max-2026-01-23',
      DEBUG: 'xai/grok-4-1-fast-reasoning',
    };
    this.routingHistory = [];
    this.taskCounter = 0;
    
    log('info', 'OCNMPS V3 Router initialized', {
      grayRatio: this.grayRatio,
      models: Object.keys(this.modelMapping),
    });
  }

  /**
   * 路由决策
   */
  route(text, sessionId, defaultModel = 'bailian/qwen3.6-plus') {
    const startTime = Date.now();
    const taskId = `w_${Date.now()}_${(++this.taskCounter).toString(36)}`;
    
    // 1. 意图识别 + 标签提取
    const intent = classifyIntent(text);
    
    // 1.1 内部消息 bypass：不参与正常路由统计
    if (intent === null) {
      log('info', 'Routing bypass - internal message', { 
        taskId, 
        reason: 'internal_message_bypass',
        textLength: text.length 
      });
      
      // 返回 bypass 决策，不进入正常统计
      return {
        taskId,
        input: text.substring(0, 100) + '...',
        intent: null,
        tags: [],
        confidence: 0,
        recommendedModel: null,
        finalModel: null,
        grayHit: false,
        hashBucket: 0,
        threshold: Math.floor(this.grayRatio * 10000),
        fallbackReason: 'internal_message_bypass',
        verification: { ok: true, checklist: [], summary: 'bypass' },
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
        bypass: true, // 标记为 bypass
      };
    }
    
    const tags = extractTags(text);
    log('info', 'Intent classified', { taskId, intent, tags, textLength: text.length });
    
    // 2. 灰度计算（只对用户消息）
    const hash = hashFunction(text).substring(0, 8);
    const hashBucket = parseInt(hash, 16) % 10000;
    const threshold = Math.floor(this.grayRatio * 10000);
    const grayHit = hashBucket < threshold;
    
    log('info', 'Gray calculation', { taskId, hashBucket, threshold, grayHit });
    
    // 3. 推荐模型
    const recommendedModel = this.modelMapping[intent] ?? defaultModel;
    
    // 4. 最终模型决策
    let finalModel = defaultModel;
    let fallbackReason = null;
    
    if (grayHit) {
      finalModel = recommendedModel;
      log('info', 'Gray hit - model switched', { taskId, from: defaultModel, to: finalModel });
    } else {
      fallbackReason = 'gray_miss';
      log('info', 'Gray miss - using default', { taskId, model: defaultModel });
    }
    
    // 5. 路由验证
    const verification = this.verifyRouting({ intent, recommendedModel, finalModel, grayHit });
    
    // 6. 记录历史（只记录正常用户请求）
    const decision = {
      taskId,
      input: text.substring(0, 100) + '...',
      intent,
      tags, // 提取的标签
      confidence: 0.5, // 添加 confidence（默认值）
      recommendedModel,
      finalModel,
      grayHit,
      hashBucket,
      threshold,
      fallbackReason,
      verification,
      timestamp: Date.now(),
      latencyMs: Date.now() - startTime,
      bypass: false,
      // Phase 19.2: Strategy telemetry fields
      strategyMatched: false,
      strategyKey: null,
      strategyType: null,
      selectedRoute: null,
      selectedModel: null,
      fallbackToLegacy: true,
      strategyMissReason: 'strategy_miss_or_not_checked',
      policyVersion: 'v1.0',
    };
    
    this.routingHistory.push(decision);
    
    // 7. 限制历史大小
    if (this.routingHistory.length > 1000) {
      this.routingHistory = this.routingHistory.slice(-1000);
    }
    
    log('info', 'Routing decision', {
      taskId,
      intent,
      finalModel,
      grayHit,
      verificationOk: verification.ok,
      latencyMs: decision.latencyMs,
      strategyMatched: false,
      fallbackToLegacy: true,
      policyVersion: 'v1.0',
    });
    
    return decision;
  }

  /**
   * 验证路由决策
   */
  verifyRouting(decision) {
    const checklist = [];
    
    // 检查 1: 意图是否有效
    const validIntents = ['CODE', 'CODE_PLUS', 'REASON', 'LONG', 'CN', 'FAST', 'MAIN'];
    if (validIntents.includes(decision.intent)) {
      checklist.push({ item: 'Intent is valid', status: 'pass' });
    } else {
      checklist.push({ item: 'Intent is valid', status: 'warn', note: `Unknown: ${decision.intent}` });
    }
    
    // 检查 2: 灰度命中时模型是否切换
    if (decision.grayHit && decision.recommendedModel !== decision.finalModel) {
      checklist.push({ item: 'Gray hit model switch', status: 'fail', note: 'Model not switched' });
    } else {
      checklist.push({ item: 'Gray hit model switch', status: 'pass' });
    }
    
    // 检查 3: 模型映射是否存在
    if (this.modelMapping[decision.intent] || decision.intent === 'MAIN') {
      checklist.push({ item: 'Model mapping exists', status: 'pass' });
    } else {
      checklist.push({ item: 'Model mapping exists', status: 'warn', note: `No mapping for ${decision.intent}` });
    }
    
    // 检查 4: 最终模型是否指定
    if (decision.finalModel) {
      checklist.push({ item: 'Final model specified', status: 'pass' });
    } else {
      checklist.push({ item: 'Final model specified', status: 'fail', note: 'No final model' });
    }
    
    const passCount = checklist.filter(c => c.status === 'pass').length;
    const warnCount = checklist.filter(c => c.status === 'warn').length;
    const failCount = checklist.filter(c => c.status === 'fail').length;
    
    return {
      ok: failCount === 0,
      checklist,
      summary: `${passCount} pass, ${warnCount} warn, ${failCount} fail`,
    };
  }

  /**
   * 获取路由历史
   */
  getHistory(options = {}) {
    let results = [...this.routingHistory];
    
    if (options.grayHitOnly) {
      results = results.filter(r => r.grayHit);
    }
    
    if (options.limit) {
      results = results.slice(0, options.limit);
    }
    
    return results;
  }

  /**
   * 获取统计
   */
  getStats() {
    const total = this.routingHistory.length;
    const grayHits = this.routingHistory.filter(r => r.grayHit).length;
    
    const byIntent = {};
    const byModel = {};
    
    for (const r of this.routingHistory) {
      byIntent[r.intent] = (byIntent[r.intent] ?? 0) + 1;
      byModel[r.finalModel] = (byModel[r.finalModel] ?? 0) + 1;
    }
    
    return {
      total,
      grayHits,
      grayHitRate: total > 0 ? (grayHits / total * 100).toFixed(2) + '%' : '0%',
      byIntent,
      byModel,
    };
  }
}

/**
 * 创建 Router 实例
 */
function createOCNMPSRouterV3(config) {
  return new OCNMPSRouterV3(config);
}

/**
 * 创建集成器（Plugin 使用）
 */
function createOCNMPSIntegrator(config = {}) {
  const router = createOCNMPSRouterV3({
    grayRatio: config.grayRatio ?? 0.30, // 默认 30% 灰度
    modelMapping: config.modelMapping,
  });
  
  return {
    async handleMessage(options) {
      const decision = router.route(options.text, options.sessionId, options.defaultModel);
      
      // 将模型对象转为字符串格式 "provider/model"（防御性处理）
      let modelStr = decision.finalModel;
      
      if (!modelStr) {
        modelStr = options.defaultModel || 'bailian/qwen3.6-plus';
      } else if (typeof modelStr === 'object' && modelStr !== null) {
        if (modelStr.provider && modelStr.model) {
          modelStr = `${modelStr.provider}/${modelStr.model}`;
        } else if (modelStr.name) {
          modelStr = modelStr.name;
        } else {
          modelStr = String(modelStr);
        }
      } else if (typeof modelStr !== 'string') {
        modelStr = String(modelStr);
      }
      
      return {
        success: true,
        model: modelStr, // 保证是字符串
        intent: decision.intent,
        tags: decision.tags || [], // 添加 tags
        confidence: decision.confidence || 0.5, // 添加 confidence
        grayHit: decision.grayHit,
        routingTaskId: decision.taskId,
        verification: decision.verification,
      };
    },
    
    getStats() {
      return router.getStats();
    },
    
    getHistory(options) {
      return router.getHistory(options);
    },
    
    setGrayRatio(ratio) {
      router.grayRatio = ratio;
      log('info', 'Gray ratio updated', { ratio: ratio * 100 + '%' });
    },
    
    setEnabled(enabled) {
      log('info', 'Integrator enabled', { enabled });
    },
  };
}

module.exports = {
  OCNMPSRouterV3,
  createOCNMPSRouterV3,
  createOCNMPSIntegrator,
  classifyIntent,
  hashFunction,
};
