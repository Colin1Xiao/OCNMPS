const { validateRecognitionResult, normalizeRecognitionResult, PRIMARY_INTENTS, TAGS } = require("../contracts/recognition_result");

function simpleContainsAny(text, arr = []) {
  return arr.some(x => text.includes(x));
}

function recognize(routeContext, config = {}) {
  const text = (routeContext?.text || "").trim();
  const lower = text.toLowerCase();

  let primaryIntent = "MAIN";
  let tags = [];
  let confidence = 0.35;
  let forcedByRule = false;
  let forcedReason = null;

  const scores = {
    MAIN: 1.5,
    CODE: 0,
    CODE_PLUS: 0,
    PATCH: 0,
    DEBUG: 0,
    REVIEW: 0,
    TEST: 0,
    REASON: 0,
    LONG: 0,
  };

  // === Tags Detection ===
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  if (hasChinese) tags.push("CN");
  if (simpleContainsAny(lower, ["简短", "一句话", "直接说结论", "先快速", "短一点", "quickly", "short", "直接"])) {
    tags.push("FAST");
  }

  // === Guardrail: Generic Short Questions → MAIN ===
  if (["为什么", "why", "有问题问你"].includes(lower) || ["为什么", "有问题问你"].includes(text)) {
    primaryIntent = "MAIN";
    confidence = 0.40;
    forcedByRule = true;
    forcedReason = "generic_short_question";
  }

  // === Intent Detection (Minimal V1) ===
  // CODE: explicit code-related verbs
  if (simpleContainsAny(lower, ["写代码", "生成代码", "实现一个", "写一个函数", "写个", "代码", "function", "implement"])) {
    scores.CODE += 3;
  }

  // REVIEW: code review, check, audit
  if (simpleContainsAny(lower, ["审查", "检查代码", "code review", "看看有没有问题", "审计"])) {
    scores.REVIEW += 3;
  }

  // DEBUG: debug, fix, troubleshoot
  if (simpleContainsAny(lower, ["调试", "debug", "排查问题", "修复 bug", "查找问题"])) {
    scores.DEBUG += 3;
  }

  // PATCH: fix, patch, hotfix
  if (simpleContainsAny(lower, ["修复", "补丁", "patch", "fix", "改正"])) {
    scores.PATCH += 2;
  }

  // REASON: explain, why, how, understand
  if (simpleContainsAny(lower, ["解释", "说明", "为什么", "如何", "理解", "explain", "understand"]) && text.length > 10) {
    scores.REASON += 2;
  }

  // LONG: detailed, comprehensive, deep dive
  if (simpleContainsAny(lower, ["详细", "深入", "全面", "完整", "detailed", "comprehensive", "deep dive"])) {
    scores.LONG += 3;
  }

  // TEST: test, unit test, coverage
  if (simpleContainsAny(lower, ["测试", "test", "单元测试", "coverage"])) {
    scores.TEST += 3;
  }

  // CODE_PLUS: refactor, optimize, scalability (complex code tasks)
  if (simpleContainsAny(lower, ["重构", "优化", "扩展性", "refactor", "optimize", "scalability", "性能优化"])) {
    scores.CODE_PLUS += 3;
  }

  // === Determine Primary Intent ===
  let maxScore = 0;
  for (const intent of PRIMARY_INTENTS) {
    if (scores[intent] > maxScore) {
      maxScore = scores[intent];
      primaryIntent = intent;
    }
  }

  // === Confidence Calculation (Simple V1) ===
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  if (maxScore >= 3) {
    confidence = 0.65 + Math.min(0.25, (maxScore - 3) * 0.05);
  } else if (maxScore >= 2) {
    confidence = 0.50 + (maxScore - 2) * 0.15;
  } else if (maxScore >= 1) {
    confidence = 0.35 + (maxScore - 1) * 0.15;
  } else {
    confidence = 0.35;
    primaryIntent = "MAIN";
  }

  // Cap confidence
  confidence = Math.min(0.95, Math.max(0.20, confidence));

  // === Build Result ===
  const result = {
    version: "v1",
    primaryIntent,
    tags,
    complexity: text.length > 50 ? "MEDIUM" : "LOW",
    confidence,
    ambiguity: {
      hasCompetition: false,
      runnerUpIntent: null,
      scoreGap: null
    },
    scores,
    signals: {
      explicitDirectives: [],
      strongMatches: [],
      actionMatches: [],
      objectMatches: [],
      antiMatches: [],
      tagMatches: tags,
      entityHints: []
    },
    guardrails: {
      fallbackToMain: forcedByRule,
      forcedByRule,
      forcedReason
    }
  };

  return normalizeRecognitionResult(result);
}

module.exports = {
  recognize,
};
