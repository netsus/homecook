/** Local preparation only: callers must provide trusted, already batch-scaled inputs. */
export const COOKED_WEIGHT_PREDICTION_VERSION = "bounded-weight-v2";

export interface CookedWeightFact<T extends string | number> {
  readonly value: T | null;
  readonly status: "confirmed" | "inferred" | "unknown";
  readonly evidenceRef: string | null;
}

type PreparationState = "raw" | "dry_raw" | "cooked";
type RowRole = "food" | "cooking_water" | "cooking_oil";
type CookingMethod = "no_heat" | "pan_browning" | "boiling" | "soup" | "reheating" | "other";
type FoodBoundary = "entire_edible" | "drained_edible";
type Drainage = "none" | "retained" | "drained" | "colander";
type AddedMedia = "none" | "water" | "oil" | "water_and_oil";

export interface CookedWeightRow {
  readonly rowKey: string;
  readonly sourceKind: "ingredient" | "food_product";
  readonly sourceId: string;
  readonly sourceVersion: string | null;
  readonly amount: number | null;
  readonly unit: string | null;
  readonly quantityKind: "quantitative" | "to_taste";
  readonly quantityOrigin: "planned" | "reported_actual" | "unknown";
  readonly grams: number | null;
  /** confirmed means the upstream resolver verified eligibility, not a scale measurement. */
  readonly gramsEvidence: {
    readonly kind: "direct_mass" | "ingredient_conversion" | "product_relation";
    readonly status: "confirmed" | "inferred" | "unknown";
    readonly evidenceId: string | null;
    readonly version: string | null;
    readonly quality: "exact" | "estimated";
  } | null;
  readonly preparationState: CookedWeightFact<PreparationState>;
  readonly role: CookedWeightFact<RowRole>;
  readonly foodIdentity: CookedWeightFact<string>;
}

export interface CookedWeightSegment {
  readonly id: string;
  readonly rowKeys: readonly string[];
  readonly method: CookedWeightFact<CookingMethod>;
  readonly boundary: CookedWeightFact<FoodBoundary>;
  readonly drainage: CookedWeightFact<Drainage>;
  readonly addedMedia: CookedWeightFact<AddedMedia>;
  readonly protocol: CookedWeightFact<string>;
  /** Exactly one transformation per independent, non-overlapping cooking boundary. */
  readonly transformation:
    | { readonly kind: "closed_mix" }
    | { readonly kind: "inferred_closed_mix" }
    | { readonly kind: "known_external_loss"; readonly grams: CookedWeightFact<number>; readonly coverage: CookedWeightFact<"all_external_outflow"> }
    | { readonly kind: "yield"; readonly ruleId: string };
}

export interface CookedWeightInput {
  readonly recipeSnapshotId: string;
  readonly cookingServings: number;
  readonly rows: readonly CookedWeightRow[];
  readonly segments: readonly CookedWeightSegment[];
}

export interface CookedWeightYieldRule {
  readonly id: string;
  readonly version: string;
  readonly availability: "reviewed_candidate" | "inactive" | "test_fixture";
  readonly factor: number;
  readonly foodIdentity: string;
  readonly inputState: PreparationState;
  readonly method: CookingMethod;
  readonly boundary: FoodBoundary;
  readonly drainage: Drainage;
  readonly addedMedia: "none" | "water";
  readonly protocol: string;
  readonly sourceUrl: string;
  readonly sourceChecksum: string | null;
  readonly rights: "CC0-1.0" | "not_confirmed" | "test_fixture";
}

/** One reviewed row, not a global beef, soup, or finished-dish yield. No Bognár rule is registered. */
export const USDA_2014_BEEF_CRUMBLES_RULE: CookedWeightYieldRule = Object.freeze({
  id: "usda-2014-ndb23565-crumbles", version: "usda-release2-2014",
  availability: "reviewed_candidate", factor: 0.69, foodIdentity: "usda_ndb:23565", inputState: "raw",
  method: "pan_browning", boundary: "drained_edible", drainage: "colander", addedMedia: "none",
  protocol: "usda2014-ground-beef-crumbles-preheated-pan-5.3min-no-added-fat-colander",
  sourceUrl: "https://ndownloader.figshare.com/files/43365402",
  sourceChecksum: "e6144d36488781c3eab2428bd4fd576d85092a93fc709aa05868d20fe6ba1f4f",
  rights: "CC0-1.0",
});

type ReasonCode =
  | "invalid_context" | "input_limit_exceeded" | "empty_input" | "missing_segments"
  | "duplicate_row" | "duplicate_segment" | "overlapping_boundary" | "unknown_row_reference" | "uncovered_row"
  | "invalid_segment" | "conflicting_transformations"
  | "invalid_quantity" | "invalid_source" | "unquantified_ingredient" | "quantity_origin_unknown"
  | "quantity_conversion_missing" | "invalid_grams_evidence" | "row_role_unconfirmed"
  | "boundary_unconfirmed" | "boundary_condition_mismatch" | "external_loss_unconfirmed" | "invalid_external_loss"
  | "rule_not_found" | "ambiguous_rule" | "rule_inactive" | "invalid_rule"
  | "rule_condition_unconfirmed" | "rule_condition_mismatch" | "mass_exceeds_input" | "invalid_total";

interface PredictionReason {
  readonly code: ReasonCode;
  readonly rowKey: string | null;
  readonly segmentId: string | null;
}

export interface CookedWeightPrediction {
  readonly modelVersion: typeof COOKED_WEIGHT_PREDICTION_VERSION | "ingredient-mass-75-v1" | "recipe-mass-proxy-v1";
  readonly status: "estimated" | "unavailable";
  readonly totalGrams: number | null;
  /** Test-supplied coefficients remain explicitly outside a service candidate. */
  readonly scope: "candidate" | "test_fixture";
  readonly learningEligible: false;
  readonly input: CookedWeightInput | null;
  readonly appliedRules: readonly CookedWeightYieldRule[];
  readonly reasons: readonly PredictionReason[];
  readonly assumptions: readonly string[];
  readonly massProxy?: import("@/lib/server/cooked-weight-mass-proxy").MassProxyEvidence;
}

interface ValidatedRow { readonly row: CookedWeightRow; readonly grams: number }

const MAX_ROWS = 200; // Matches the existing nutrition predecessor's ingredient bound.
const MAX_RULES = 32;

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function confirmedValue<T extends string | number>(fact: CookedWeightFact<T>): T | null {
  if (fact.status !== "confirmed" || !hasText(fact.evidenceRef)) return null;
  return typeof fact.value === "string" && !hasText(fact.value) ? null : fact.value;
}

function reason(code: ReasonCode, rowKey: string | null = null, segmentId: string | null = null): PredictionReason {
  return Object.freeze({ code, rowKey, segmentId });
}

function copyFact<T extends string | number>(fact: CookedWeightFact<T>): CookedWeightFact<T> {
  const value = typeof fact.value === "number" && !Number.isFinite(fact.value) ? null : fact.value;
  return Object.freeze({ value, status: fact.status, evidenceRef: fact.evidenceRef });
}

function finiteOrNull(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : null;
}

function copyInput(input: CookedWeightInput): CookedWeightInput {
  const rows = input.rows.map(row => Object.freeze({
    rowKey: row.rowKey, sourceKind: row.sourceKind, sourceId: row.sourceId, sourceVersion: row.sourceVersion,
    amount: finiteOrNull(row.amount), unit: row.unit, quantityKind: row.quantityKind,
    quantityOrigin: row.quantityOrigin, grams: finiteOrNull(row.grams),
    gramsEvidence: row.gramsEvidence ? Object.freeze({ kind: row.gramsEvidence.kind,
      status: row.gramsEvidence.status, evidenceId: row.gramsEvidence.evidenceId,
      version: row.gramsEvidence.version, quality: row.gramsEvidence.quality }) : null,
    preparationState: copyFact(row.preparationState), role: copyFact(row.role), foodIdentity: copyFact(row.foodIdentity),
  }));
  const segments = input.segments.map(segment => Object.freeze({
    id: segment.id, rowKeys: Object.freeze([...segment.rowKeys]), method: copyFact(segment.method),
    boundary: copyFact(segment.boundary), drainage: copyFact(segment.drainage),
    addedMedia: copyFact(segment.addedMedia), protocol: copyFact(segment.protocol),
    transformation: Object.freeze(segment.transformation.kind === "known_external_loss"
      ? { kind: segment.transformation.kind, grams: copyFact(segment.transformation.grams), coverage: copyFact(segment.transformation.coverage) }
      : segment.transformation.kind === "yield"
        ? { kind: segment.transformation.kind, ruleId: segment.transformation.ruleId }
        : { kind: segment.transformation.kind }),
  }));
  return Object.freeze({ recipeSnapshotId: input.recipeSnapshotId, cookingServings: input.cookingServings,
    rows: Object.freeze(rows), segments: Object.freeze(segments) });
}

function result(input: CookedWeightInput | null, totalGrams: number | null,
  appliedRules: CookedWeightYieldRule[], reasons: PredictionReason[]): CookedWeightPrediction {
  return Object.freeze({ modelVersion: COOKED_WEIGHT_PREDICTION_VERSION,
    status: totalGrams === null ? "unavailable" : "estimated", totalGrams,
    scope: appliedRules.some(rule => rule.availability === "test_fixture") ? "test_fixture" : "candidate",
    learningEligible: false, input,
    appliedRules: Object.freeze(appliedRules.map(rule => Object.freeze({ id: rule.id, version: rule.version,
      availability: rule.availability, factor: rule.factor, foodIdentity: rule.foodIdentity, inputState: rule.inputState,
      method: rule.method, boundary: rule.boundary, drainage: rule.drainage, addedMedia: rule.addedMedia,
      protocol: rule.protocol, sourceUrl: rule.sourceUrl, sourceChecksum: rule.sourceChecksum, rights: rule.rights }))),
    reasons: Object.freeze(reasons),
    assumptions: Object.freeze(totalGrams !== null && input?.segments.some(segment => segment.transformation.kind === "inferred_closed_mix")
      ? ["mix_tags_imply_no_heat", "all_declared_inputs_retained", "unreported_drainage_leftovers_container_added_media_unknown"] : []),
  });
}

function validGramEvidence(row: CookedWeightRow, grams: number) {
  const evidence = row.gramsEvidence;
  if (!evidence || evidence.status !== "confirmed") return false;
  if (evidence.kind === "direct_mass") {
    const unit = row.unit?.trim().toLowerCase();
    if ((unit !== "g" && unit !== "kg") || row.amount === null) return false;
    const expected = row.amount * (unit === "kg" ? 1000 : 1);
    return Number.isFinite(expected) && Math.abs(expected - grams) <= Number.EPSILON * Math.max(1, expected) * 8;
  }
  if (!hasText(evidence.evidenceId) || !hasText(evidence.version)) return false;
  return row.sourceKind === "food_product"
    ? evidence.kind === "product_relation" && evidence.version === row.sourceVersion
    : evidence.kind === "ingredient_conversion";
}

function validateRow(row: CookedWeightRow, inferredMixOnly = false): ReasonCode | null {
  if (row.sourceKind !== "ingredient" && row.sourceKind !== "food_product") return "invalid_source";
  if (!hasText(row.rowKey) || !hasText(row.sourceId)
    || (row.sourceKind === "food_product" && !hasText(row.sourceVersion))) return "invalid_source";
  if (row.quantityKind !== "quantitative") return "unquantified_ingredient";
  if (row.quantityOrigin !== "planned" && row.quantityOrigin !== "reported_actual") return "quantity_origin_unknown";
  if (row.amount === null || !Number.isFinite(row.amount) || row.amount <= 0 || !hasText(row.unit)) return "invalid_quantity";
  if (row.grams === null) return "quantity_conversion_missing";
  if (!Number.isFinite(row.grams) || row.grams <= 0) return "invalid_quantity";
  if (!validGramEvidence(row, row.grams)) return "invalid_grams_evidence";
  const role = confirmedValue(row.role);
  if (inferredMixOnly && row.role.status === "unknown" && row.role.value === null && row.role.evidenceRef === null) return null;
  if (role !== "food" && role !== "cooking_water" && role !== "cooking_oil") return "row_role_unconfirmed";
  return null;
}

type SegmentResult = { grams: number; rule: CookedWeightYieldRule | null } | { failure: ReasonCode };

function mediaMatches(media: AddedMedia, rows: ValidatedRow[]) {
  const water = rows.some(({ row }) => confirmedValue(row.role) === "cooking_water");
  const oil = rows.some(({ row }) => confirmedValue(row.role) === "cooking_oil");
  if (media === "none") return !water && !oil;
  if (media === "water") return water && !oil;
  if (media === "oil") return oil && !water;
  return media === "water_and_oil" && water && oil;
}

function evaluateSegment(segment: CookedWeightSegment, rows: ValidatedRow[], rules: readonly CookedWeightYieldRule[]): SegmentResult {
  let inputMass = 0;
  for (const row of rows) inputMass += row.grams;
  if (!Number.isFinite(inputMass) || inputMass <= 0) return { failure: "invalid_total" };
  const method = confirmedValue(segment.method);
  const boundary = confirmedValue(segment.boundary);
  const media = confirmedValue(segment.addedMedia);
  const transform = segment.transformation;
  const expectedKeys = transform.kind === "known_external_loss" ? 3 : transform.kind === "yield" ? 2 : 1;
  if (Object.keys(transform).length !== expectedKeys) return { failure: "conflicting_transformations" };
  if (transform.kind === "inferred_closed_mix") {
    const facts = [segment.method, segment.boundary, segment.drainage, segment.protocol];
    if (facts.some(fact => fact.status !== "inferred" || !hasText(fact.evidenceRef))) return { failure: "boundary_unconfirmed" };
    if (segment.method.value !== "no_heat" || segment.boundary.value !== "entire_edible" || segment.drainage.value !== "none"
      || segment.protocol.value !== "snapshot-mix-only-v1") return { failure: "boundary_condition_mismatch" };
    return { grams: inputMass, rule: null };
  }
  if (method === null || boundary === null) return { failure: "boundary_unconfirmed" };
  if (transform.kind === "closed_mix") {
    const drainage = confirmedValue(segment.drainage);
    if (drainage === null || media === null) return { failure: "boundary_unconfirmed" };
    if (method !== "no_heat" || boundary !== "entire_edible" || drainage !== "none" || !mediaMatches(media, rows)) return { failure: "boundary_condition_mismatch" };
    return { grams: inputMass, rule: null };
  }
  if (transform.kind === "known_external_loss") {
    if (media === null) return { failure: "boundary_unconfirmed" };
    if (!mediaMatches(media, rows)) return { failure: "boundary_condition_mismatch" };
    const loss = confirmedValue(transform.grams);
    if (loss === null || confirmedValue(transform.coverage) !== "all_external_outflow") return { failure: "external_loss_unconfirmed" };
    if (!Number.isFinite(loss) || loss < 0 || loss >= inputMass) return { failure: "invalid_external_loss" };
    return { grams: inputMass - loss, rule: null };
  }
  const matches = rules.filter(rule => rule.id === transform.ruleId);
  if (matches.length === 0) return { failure: "rule_not_found" };
  if (matches.length !== 1) return { failure: "ambiguous_rule" };
  const rule = matches[0];
  if ((rule.availability !== "reviewed_candidate" && rule.availability !== "test_fixture")
    || (rule.availability === "reviewed_candidate" && rule.rights !== "CC0-1.0")) return { failure: "rule_inactive" };
  if (!Number.isFinite(rule.factor) || rule.factor <= 0 || !hasText(rule.version) || !hasText(rule.sourceUrl)
    || (rule.availability === "reviewed_candidate" && !/^[a-f0-9]{64}$/.test(rule.sourceChecksum ?? ""))
    || (rule.availability === "test_fixture" && rule.rights !== "test_fixture")) return { failure: "invalid_rule" };
  const drainage = confirmedValue(segment.drainage);
  const protocol = confirmedValue(segment.protocol);
  if (drainage === null || media === null || protocol === null) return { failure: "rule_condition_unconfirmed" };
  if (method !== rule.method || boundary !== rule.boundary || drainage !== rule.drainage
    || media !== rule.addedMedia || protocol !== rule.protocol || !mediaMatches(media, rows)) return { failure: "rule_condition_mismatch" };
  let denominator = 0;
  let waterMass = 0;
  for (const { row, grams } of rows) {
    const role = confirmedValue(row.role);
    if (role === "cooking_water" && rule.addedMedia === "water") { waterMass += grams; continue; }
    if (role !== "food") return { failure: "rule_condition_mismatch" };
    const state = confirmedValue(row.preparationState);
    const identity = confirmedValue(row.foodIdentity);
    if (state === null || identity === null) return { failure: "rule_condition_unconfirmed" };
    if (state !== rule.inputState || identity !== rule.foodIdentity) return { failure: "rule_condition_mismatch" };
    denominator += grams;
  }
  if (denominator <= 0 || (rule.addedMedia === "water" && waterMass <= 0)) return { failure: "rule_condition_mismatch" };
  const grams = denominator * rule.factor;
  if (!Number.isFinite(grams) || grams <= 0) return { failure: "invalid_total" };
  // Water represented by the yield is inside this boundary, never added a second time.
  if (grams > inputMass + Number.EPSILON * Math.max(1, inputMass) * 8) return { failure: "mass_exceeds_input" };
  return { grams, rule };
}

/** Pure, bounded candidate evaluator. No IO, clock, nutrient calculation, measurement, or rollout. */
export function predictCookedWeight(input: CookedWeightInput,
  rules: readonly CookedWeightYieldRule[] = [USDA_2014_BEEF_CRUMBLES_RULE]): CookedWeightPrediction {
  if (!hasText(input.recipeSnapshotId) || !Number.isFinite(input.cookingServings) || input.cookingServings <= 0) {
    return result(null, null, [], [reason("invalid_context")]);
  }
  if (input.rows.length > MAX_ROWS || input.segments.length > MAX_ROWS || rules.length > MAX_RULES) {
    return result(null, null, [], [reason("input_limit_exceeded")]);
  }
  const references = input.segments.reduce((sum, segment) => sum + segment.rowKeys.length, 0);
  if (references > MAX_ROWS) {
    return result(null, null, [], [reason("input_limit_exceeded")]);
  }
  const snapshot = copyInput(input);
  if (input.rows.length === 0) return result(snapshot, null, [], [reason("empty_input")]);
  const reasons: PredictionReason[] = [];
  const rowsByKey = new Map<string, ValidatedRow>();
  const inferredMixOnly = input.segments.length === 1 && input.segments[0].transformation.kind === "inferred_closed_mix";
  for (const row of input.rows) {
    if (rowsByKey.has(row.rowKey)) { reasons.push(reason("duplicate_row", row.rowKey)); continue; }
    const invalid = validateRow(row, inferredMixOnly);
    if (invalid !== null) { reasons.push(reason(invalid, row.rowKey)); continue; }
    if (row.grams !== null) rowsByKey.set(row.rowKey, { row, grams: row.grams });
  }
  if (reasons.length) return result(snapshot, null, [], reasons);
  if (!input.segments.length) return result(snapshot, null, [], [reason("missing_segments")]);
  const usedRows = new Set<string>();
  const usedSegments = new Set<string>();
  const appliedRules: CookedWeightYieldRule[] = [];
  let total = 0;
  for (const segment of input.segments) {
    if (!hasText(segment.id) || !segment.rowKeys.length) { reasons.push(reason("invalid_segment", null, segment.id)); continue; }
    if (usedSegments.has(segment.id)) { reasons.push(reason("duplicate_segment", null, segment.id)); continue; }
    usedSegments.add(segment.id);
    const rows: ValidatedRow[] = [];
    let validBoundary = segment.rowKeys.length > 0;
    for (const key of segment.rowKeys) {
      const row = rowsByKey.get(key);
      if (!row) { reasons.push(reason("unknown_row_reference", key, segment.id)); validBoundary = false; continue; }
      if (usedRows.has(key)) { reasons.push(reason("overlapping_boundary", key, segment.id)); validBoundary = false; continue; }
      usedRows.add(key); rows.push(row);
    }
    if (!validBoundary) continue;
    const evaluated = evaluateSegment(segment, rows, rules);
    if ("failure" in evaluated) { reasons.push(reason(evaluated.failure, null, segment.id)); continue; }
    total += evaluated.grams;
    if (evaluated.rule) appliedRules.push(evaluated.rule);
  }
  for (const row of input.rows) if (!usedRows.has(row.rowKey)) reasons.push(reason("uncovered_row", row.rowKey));
  if (!Number.isFinite(total) || total <= 0) reasons.push(reason("invalid_total"));
  return result(snapshot, reasons.length ? null : total, appliedRules, reasons);
}
