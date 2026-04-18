const PRIMARY_INTENTS = [
  "MAIN", "CODE", "CODE_PLUS", "PATCH", "DEBUG",
  "REVIEW", "TEST", "REASON", "LONG"
];

const TAGS = ["CN", "FAST"];

function validateRecognitionResult(result) {
  if (!result || typeof result !== "object") return false;
  if (result.version !== "v1") return false;
  if (!PRIMARY_INTENTS.includes(result.primaryIntent)) return false;
  if (!Array.isArray(result.tags)) return false;
  if (!result.tags.every(tag => TAGS.includes(tag))) return false;
  if (typeof result.confidence !== "number") return false;
  if (!result.scores || typeof result.scores !== "object") return false;
  if (!result.signals || typeof result.signals !== "object") return false;
  if (!result.guardrails || typeof result.guardrails !== "object") return false;
  return true;
}

function normalizeRecognitionResult(result) {
  return {
    version: result.version || "v1",
    primaryIntent: result.primaryIntent || "MAIN",
    tags: result.tags || [],
    complexity: result.complexity || "LOW",
    confidence: typeof result.confidence === "number" ? result.confidence : 0.35,
    ambiguity: result.ambiguity || { hasCompetition: false, runnerUpIntent: null, scoreGap: null },
    scores: result.scores || {
      MAIN: 1.5, CODE: 0, CODE_PLUS: 0, PATCH: 0,
      DEBUG: 0, REVIEW: 0, TEST: 0, REASON: 0, LONG: 0
    },
    signals: result.signals || {
      explicitDirectives: [], strongMatches: [], actionMatches: [],
      objectMatches: [], antiMatches: [], tagMatches: [], entityHints: []
    },
    guardrails: result.guardrails || { fallbackToMain: false, forcedByRule: false, forcedReason: null }
  };
}

module.exports = {
  validateRecognitionResult,
  normalizeRecognitionResult,
  PRIMARY_INTENTS,
  TAGS,
};
