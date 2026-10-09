const STATES = new Set(['explicit', 'estimated', 'to_taste', 'unknown', 'conflicting']);
const METHODS = new Set(['description', 'comment', 'caption', 'visual']);
const REF_KEYS = new Set(['source_method', 'source_provider', 'line_index', 'start_ms', 'end_ms', 'frame_ts_ms', 'snippet', 'locator_hash', 'evidence_id']);
const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function text(value, limit, field, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw new Error(`INVALID_QUANTITY_EVIDENCE: ${field}`);
  }
  return value;
}

function evidenceRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !REF_KEYS.has(key)) || !METHODS.has(value.source_method)) {
    throw new Error('INVALID_QUANTITY_EVIDENCE: reference');
  }
  const result = {
    source_method: value.source_method,
    source_provider: text(value.source_provider, 80, 'source_provider'),
    snippet: text(value.snippet, 200, 'snippet'),
  };
  for (const key of ['line_index', 'start_ms', 'end_ms', 'frame_ts_ms']) {
    if (!OWN(value, key)) continue;
    const number = value[key];
    if (number !== null && (!Number.isSafeInteger(number) || number < 0 || number > 86_400_000)) {
      throw new Error(`INVALID_QUANTITY_EVIDENCE: ${key}`);
    }
    result[key] = number;
  }
  if (result.start_ms !== null && result.start_ms !== undefined && result.end_ms !== null && result.end_ms !== undefined && result.end_ms < result.start_ms) {
    throw new Error('INVALID_QUANTITY_EVIDENCE: reversed interval');
  }
  if (OWN(value, 'locator_hash')) result.locator_hash = text(value.locator_hash, 128, 'locator_hash', true);
  if (OWN(value, 'evidence_id')) {
    if (typeof value.evidence_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/u.test(value.evidence_id)) {
      throw new Error('INVALID_QUANTITY_EVIDENCE: evidence_id');
    }
    result.evidence_id = value.evidence_id;
  }
  return result;
}

/** Copies only bounded evidence fields. Source membership is checked by the extraction ledger. */
export function sanitizeIngredientEvidence(ingredient) {
  const result = {};
  for (const [key, limit, nullable] of [
    ['originalName', 160, false], ['amountRawText', 160, true], ['amountBasis', 80, true],
  ]) {
    if (OWN(ingredient, key)) result[key] = text(ingredient[key], limit, key, nullable);
  }
  if (OWN(ingredient, 'nameAliases')) {
    if (!Array.isArray(ingredient.nameAliases) || ingredient.nameAliases.length > 6) {
      throw new Error('INVALID_QUANTITY_EVIDENCE: nameAliases');
    }
    result.nameAliases = ingredient.nameAliases.map((alias) => text(alias, 100, 'nameAliases'));
  }
  if (OWN(ingredient, 'alternativeNames')) {
    if (!Array.isArray(ingredient.alternativeNames) || ingredient.alternativeNames.length > 4) {
      throw new Error('INVALID_QUANTITY_EVIDENCE: alternativeNames');
    }
    result.alternativeNames = ingredient.alternativeNames.map((name) => text(name, 160, 'alternativeNames'));
  }
  if (OWN(ingredient, 'quantityState')) {
    if (!STATES.has(ingredient.quantityState)) throw new Error('INVALID_QUANTITY_EVIDENCE: quantityState');
    result.quantityState = ingredient.quantityState;
  }
  if (OWN(ingredient, 'evidenceRefs')) {
    if (!Array.isArray(ingredient.evidenceRefs) || ingredient.evidenceRefs.length > 6) {
      throw new Error('INVALID_QUANTITY_EVIDENCE: evidenceRefs');
    }
    result.evidenceRefs = ingredient.evidenceRefs.map(evidenceRef);
  }
  if (result.quantityState === 'explicit'
    && (ingredient.amount === null || ingredient.amount === undefined || ingredient.unit === null || ingredient.unit === undefined || !result.evidenceRefs?.length)) {
    throw new Error('INVALID_QUANTITY_EVIDENCE: explicit quantity requires amount, unit and references');
  }
  if (['unknown', 'conflicting', 'to_taste'].includes(result.quantityState)
    && ((ingredient.amount !== null && ingredient.amount !== undefined) || (ingredient.unit !== null && ingredient.unit !== undefined))) {
    throw new Error('INVALID_QUANTITY_EVIDENCE: nonnumeric state has numeric fields');
  }
  if (['source-approximate', 'source-adjustable'].includes(result.amountBasis)
    && (result.quantityState !== 'estimated' || ingredient.amount === null || ingredient.amount === undefined
      || !ingredient.unit || !result.amountRawText || !result.evidenceRefs?.some((ref) => ref.source_method !== 'visual' || ref.source_provider === 'macos-vision-ocr'))) {
    throw new Error('INVALID_QUANTITY_EVIDENCE: source-qualified amount requires numeric suggestion and literal source evidence');
  }
  return result;
}

/** Legacy missing evidence is accepted; malformed new fields fail before any persistence RPC. */
export function validateRuntimeQuantityEvidence(output) {
  if (!Array.isArray(output?.recipe?.ingredients)) return;
  for (const ingredient of output.recipe.ingredients) {
    if (!ingredient || typeof ingredient !== 'object' || Array.isArray(ingredient)) {
      throw new Error('INVALID_QUANTITY_EVIDENCE: ingredient');
    }
    sanitizeIngredientEvidence(ingredient);
  }
}
