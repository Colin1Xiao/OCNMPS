const { validateRecognitionComparison, classifyDivergence, DIVERGENCE_TYPES } = require("../contracts/recognition_comparison");

function sameTagSet(tags1, tags2) {
  if (!Array.isArray(tags1) || !Array.isArray(tags2)) return false;
  if (tags1.length !== tags2.length) return false;
  return JSON.stringify(tags1.sort()) === JSON.stringify(tags2.sort());
}

function compareRecognition(legacyDecision, recognitionResult) {
  const legacyIntent = legacyDecision.intent;
  const legacyTags = legacyDecision.tags || [];
  const recogIntent = recognitionResult.primaryIntent;
  const recogTags = recognitionResult.tags || [];

  const sameIntent = legacyIntent === recogIntent;
  const sameTags = sameTagSet(legacyTags, recogTags);

  const divergenceType = classifyDivergence(legacyDecision, recognitionResult);

  return {
    routeId: legacyDecision.routeId || "unknown",
    legacyIntent,
    recogIntent,
    sameIntent,
    legacyTags,
    recogTags,
    sameTags,
    confidenceDelta: recognitionResult.confidence - (legacyDecision.confidence || 0),
    divergenceType,
    notes: []
  };
}

module.exports = {
  compareRecognition,
  sameTagSet,
  DIVERGENCE_TYPES,
};
