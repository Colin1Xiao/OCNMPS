// strategy_bridge.js - Phase 19.1 Real Implementation
// Bridge: OCNMPS before_model_resolve → Strategy Engine
// Minimal fixed-strategy matching (until Strategy Engine is compiled)

// Fixed strategy table (Phase 10)
const FIXED_STRATEGY_TABLE = {
  'summary|L1|technical': { route: 'FAST', type: 'fixed' },
  'review|L2|technical': { route: 'REVIEW', type: 'fixed' },
  'summary|L3|abstract_strategy': { route: 'REASON', type: 'fixed' },
  'verify|L3|abstract_strategy': { route: 'REASON', type: 'fixed' },
};

// Conditional strategy table (Phase 20.4-B)
const CONDITIONAL_STRATEGY_TABLE = {
  'risks|L2|technical': {
    type: 'conditional',
    evaluate: (ctx) => {
      const fileCount = ctx.fileCount || 0;
      // 0-2 files → REVIEW (single file risk analysis)
      // 3+ files → DEBUG (multi-file cross-file risk analysis)
      return fileCount >= 3 ? 'DEBUG' : 'REVIEW';
    }
  }
};

// Route → Model mapping (safe, validated)
const ROUTE_MODEL_MAP = {
  'FAST': 'bailian/qwen3-max-2026-01-23',
  'MAIN': 'bailian/qwen3.6-plus',
  'REASON': 'xai/grok-4-1-fast-reasoning',
  'REVIEW': 'bailian/qwen3.6-plus',  // Phase 20.2: temporary fix for xai compatibility
  'PATCH': 'xai/grok-code-fast-1',
  'DEBUG': 'bailian/qwen3.6-plus',    // Phase 20.4-B: conditional risks uses stable model
  'LONG': 'bailian/qwen3.6-plus',
  'CN': 'bailian/MiniMax-M2.5',
  'TEST': 'bailian/qwen3-max-2026-01-23',
  'IMAGE': 'bailian/kimi-k2.5',
};

/**
 * Safe model ref parser (avoid split errors)
 */
function parseModelRef(modelRef, defaultModel) {
  if (!modelRef || typeof modelRef !== 'string') {
    return defaultModel;
  }
  
  try {
    const parts = modelRef.split('/');
    if (parts.length >= 2) {
      return modelRef; // valid format
    }
  } catch (e) {
    console.error('[strategy-bridge] parseModelRef error:', e.message);
  }
  
  return defaultModel;
}

/**
 * Main bridge function
 */
async function strategyBridge(ctx) {
  const { prompt, sessionKey, defaultModel = 'bailian/qwen3.6-plus' } = ctx;
  
  // Skip verify strategy for cron sessions (heartbeat templates)
  if (sessionKey && sessionKey.includes('cron:')) {
    return null;
  }
  
  if (!prompt || prompt.length < 5) {
    return null;
  }
  
  try {
    // Phase 19.1: Fixed strategy matching (Phase 10 table)
    let strategyKey = null;
    let strategyResult = null;
    
    // Try exact key matching based on content
    if (prompt.includes('总结') || prompt.includes('summary')) {
      if (prompt.includes('技术') || prompt.includes('technical')) {
        strategyKey = 'summary|L1|technical';
      } else if (prompt.includes('抽象') || prompt.includes('abstract')) {
        strategyKey = 'summary|L3|abstract_strategy';
      }
    } else if (prompt.includes('审查') || prompt.includes('review')) {
      strategyKey = 'review|L2|technical';
    } else if (prompt.includes('风险') || prompt.includes('risks')) {
      strategyKey = 'risks|L2|technical';
    } else if (prompt.includes('验证') || prompt.includes('verify')) {
      strategyKey = 'verify|L3|abstract_strategy';
    }
    
    if (strategyKey && FIXED_STRATEGY_TABLE[strategyKey]) {
      strategyResult = FIXED_STRATEGY_TABLE[strategyKey];
      
      const selectedModel = parseModelRef(
        ROUTE_MODEL_MAP[strategyResult.route], 
        defaultModel
      );
      
      console.log('[strategy-bridge] matched', {
        strategyKey,
        strategyType: strategyResult.type,
        selectedRoute: strategyResult.route,
        selectedModel,
        policyVersion: 'v1.0',
      });
      
      return {
        matched: true,
        strategyKey,
        strategyType: strategyResult.type,
        selectedRoute: strategyResult.route,
        selectedModel,
        reason: 'strategy_hit',
        policyVersion: 'v1.0',
      };
    }
    
    // Phase 20.4-B: Conditional strategy matching
    console.log('[strategy-bridge] checking conditional', { strategyKey, hasConditional: !!CONDITIONAL_STRATEGY_TABLE[strategyKey], fileCount: ctx.fileCount });
    if (strategyKey && CONDITIONAL_STRATEGY_TABLE[strategyKey]) {
      const conditionalDef = CONDITIONAL_STRATEGY_TABLE[strategyKey];
      const resolvedRoute = conditionalDef.evaluate(ctx);
      
      const selectedModel = parseModelRef(
        ROUTE_MODEL_MAP[resolvedRoute], 
        defaultModel
      );
      
      console.log('[strategy-bridge] conditional matched', {
        strategyKey,
        strategyType: 'conditional',
        fileCount: ctx.fileCount || 0,
        selectedRoute: resolvedRoute,
        selectedModel,
        policyVersion: 'v1.0',
      });
      
      return {
        matched: true,
        strategyKey,
        strategyType: 'conditional',
        selectedRoute: resolvedRoute,
        selectedModel,
        reason: 'conditional_strategy_hit',
        policyVersion: 'v1.0',
      };
    }
  } catch (e) {
    console.error('[strategy-bridge] error', e.message || String(e));
    return { 
      matched: false, 
      reason: 'strategy_error', 
      fallback: 'legacy_router',
      policyVersion: 'v1.0',
    };
  }
  
  console.log('[strategy-bridge] miss', { 
    reason: 'no_matching_strategy', 
    fallback: 'legacy_router',
    policyVersion: 'v1.0',
  });
  return null; // No match → legacy fallback
}

module.exports = { strategyBridge };