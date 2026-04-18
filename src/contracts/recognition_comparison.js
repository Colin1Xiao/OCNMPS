const DIVERGENCE_TYPES = [
  "same",
  "tag_conflict",
  "conservative_divergence",
  "dangerous_divergence",
  "confidence_divergence"
];

function validateRecognitionComparison(cmp) {
  if (!cmp || typeof cmp !== "object") return false;
  if (typeof cmp.routeId !== "string" || !cmp.routeId) return false;
  if (typeof cmp.legacyIntent !== "string") return false;
  if (typeof cmp.recogIntent !== "string") return false;
  if (typeof cmp.sameIntent !== "boolean") return false;
  if (!Array.isArray(cmp.legacyTags)) return false;
  if (!Array.isArray(cmp.recogTags)) return false;
  if (typeof cmp.sameTags !== "boolean") return false;
  if (!DIVERGENCE_TYPES.includes(cmp.divergenceType)) return false;
  return true;
}

function classifyDivergence(legacyDecision, recognitionResult) {
  const legacyIntent = legacyDecision.intent;
  const recogIntent = recognitionResult.primaryIntent;
  const legacyTags = legacyDecision.tags || [];
  const recogTags = recognitionResult.tags || [];
  const legacyConf = legacyDecision.confidence || 0;
  const recogConf = recognitionResult.confidence || 0;

  const sameIntent = legacyIntent === recogIntent;
  const sameTags = JSON.stringify(legacyTags.sort()) === JSON.stringify(recogTags.sort());

  if (sameIntent && sameTags) {
    return "same";
  }

  if (sameIntent && !sameTags) {
    return "tag_conflict";
  }

  // Dangerous: high-conf recognition disagrees with legacy on high-risk intents
  const highRiskIntents = ["PATCH", "DEBUG", "REVIEW", "CODE_PLUS"];
  if (recogConf >= 0.75 && highRiskIntents.includes(recogIntent) && legacyIntent !== recogIntent) {
    return "dangerous_divergence";
  }

  // Conservative: recognition falls back to MAIN when legacy had specific intent
  if (recogIntent === "MAIN" && legacyIntent !== "MAIN" && legacyConf >= 0.5) {
    return "conservative_divergence";
  }

  // Confidence divergence: large gap in confidence
  const confDelta = Math.abs(recogConf - legacyConf);
  if (confDelta >= 0.3) {
    return "confidence_divergence";
  }

  return "conservative_divergence";
}

module.exports = {
  validateRecognitionComparison,
  classifyDivergence,
  DIVERGENCE_TYPES,
};
