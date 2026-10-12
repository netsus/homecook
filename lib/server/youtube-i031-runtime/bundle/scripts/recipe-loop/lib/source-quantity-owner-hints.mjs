import { AMOUNT_SOURCE, literalQuantityMatches } from "./literal-quantity-grammar.mjs";

export const SOURCE_QUANTITY_OWNER_HINT_VERSION = "source-quantity-owner-hints-v1";
export const SOURCE_QUANTITY_BINDING_VERSION = "source-quantity-bindings-v5";
export const SOURCE_QUANTITY_OWNER_HINT_MAX = 64;
export const SOURCE_QUANTITY_OWNER_LEDGER_MAX = 512;
export const SOURCE_QUANTITY_OWNER_TEXT_MAX = 1000;
const compact = (value) => String(value ?? "").normalize("NFKC").replace(/⁄/gu, "/").replace(/\s+/gu, " ").trim();
const BARE_RE = new RegExp("^(.*?)(" + AMOUNT_SOURCE + ")(?=$|[\\s;!?()]|,(?!\\d)|[.](?!\\d))", "iu");
const UNSAFE_SUFFIX = /^\s*(?:(?:의\s*)?(?:반|절반)(?=$|\s|[(),.;을은는이가만씩으])|[+＋~〜～]|[-–—]\s*\d|보다\s*(?:적|많)|미만|초과|이상|이하|(?:과|와|에|에서|더하기)\s*\d)/u;
const CONDITIONAL = /대체|대신|또는|혹은|\b(?:if|unless|or|optional|optionally|alternatively)\b|\brather\s+than\b|선택|옵션|원하(?:면|시면)|있으면|없으면|넣어도|추가해도/iu;
const NEGATED = /말고|제외|생략|필요\s*없|넣지|쓰지|사용하지|추가하지|붓지|뿌리지|아니라|\b(?:not|never|without|cannot|instead(?:\s+of)?|[a-z]+n['’]t)\b/iu;
const APPROXIMATE = /약\s*(?=\d|반)|정도|가량|쯤|\b(?:about|approximately|approx|roughly|around|almost|nearly)\b/iu;
const RANGE = /\d\s*(?:[~〜～–—]|-(?=\s*\d))\s*\d|이상|이하|미만|초과|\b(?:between|at least|at most|more than|less than|up to)\b|\b(?:over|under)\s+half\b/iu;
const NOISE = /https?:|구독|좋아요|이벤트|쿠폰|할인|구매|협찬|광고/iu;
const cleanEntryText = (text) => compact(text).replace(/^\[(?:[\d:.]+|line\s+\d+)\]\s*/u, "").replace(/^\s*[-*•★]+\s*/u, "");
const cleanName = (text) => compact(text).replace(/^(?:그리고|이제|다음|여기에|then|add|use)\s+/iu, "")
  .replace(/\s*(?:은|는|을|를|이|가)?\s*[:：=\-–—]?\s*$/u, "");
const flagsFor = (entry, text) => { const scope = `${entry.scopeContext ?? ""} ${entry.scopeLabel ?? ""}`;
  return { approximate: APPROXIMATE.test(text), range: RANGE.test(text), conditional: CONDITIONAL.test(text), negated: NEGATED.test(text),
    correction: entry.source_method === "comment" && /정정|수정|오타/u.test(entry.text), noisy: NOISE.test(text) || NOISE.test(scope) }; };

const BINDING_CONDITIONAL = /대체|대신|또는|혹은|\b(?:if|unless|or|when|optional|optionally|alternatively)\b|\brather\s+than\b|선택|옵션|가능(?:하면|한\s*경우)?|필요(?:하면|한\s*경우)?|원하(?:면|시면)|있으면|없으면|있다면|없다면|사용\s*시|넣어도|추가해도|(?:때|경우)(?=$|\s)/iu;
const BINDING_NEGATED = /말고|제외|생략|필요\s*없|넣지|쓰지|사용하지|추가하지|붓지|뿌리지|빼(?:고|주세요|지)|아니라|\b(?:not|never|without|cannot|instead(?:\s+of)?|[a-z]+n['’]t)\b/iu;
const BINDING_RANGE = /\d\s*(?:[~〜～–—]|-(?=\s*\d))\s*\d|한두|두세|서너|너댓|대여섯|이상|이하|미만|초과|\b(?:between|at least|at most|more than|less than|up to)\b|\b(?:over|under)\s+half\b/iu;
const BINDING_ACTION_NAME = /(?:을|를)\s*(?:사용|쓰|넣|붓|뿌리|섞|볶|끓|씻|썰|썬|자르|잘라|다지|다져|추가|준비)|^(?:and\s+)?(?:add|use|pour|mix|prepare|slice|chop|cook|wash)\b/iu;
const BINDING_TRAILING_ACTION_NAME = /\s(?:사용해|써서|넣고|넣어|넣을\s*때|붓고|부어|뿌리|섞고|볶고|볶아|끓이고|끓여|씻고|씻어|썰고|썰어|채\s*썰어|썬\s*것|자르고|잘라|자른\s*후|다지고|다져서|갈아(?:서)?|데쳐(?:서)?|데친|삶아(?:서)?|삶은|버무려(?:서)?|버무린|으깨(?:서)?|으깬|굽고|구워|구운|튀겨(?:서)?|익혀(?:서)?|손질해|다듬어|까서|벗겨|추가(?:해|하|한)?|준비(?:해|하|한)?|더)\s*$/iu;
const BINDING_KOREAN_ALTERNATIVE = /(?:[가-힣]+(?:이나|나)[\s,/|·ㆍᆞ-]+[가-힣]+|[가-힣]{2,}(?:이나|나)[가-힣]{2,})/u;
const BINDING_ALTERNATIVE = /또는|혹은|아니면|대신|선택|옵션|중\s*(?:하나|택)|[|/]|\bor\b/iu;
const BINDING_ACTION = /넣|사용|쓰|붓|뿌리|섞|볶|끓|굽|바르|재우|준비|썰|자르|잘라|다지|다져|다진|추가|(?:^|\s)더(?:\s|$)|\b(?:add|use|pour|mix|prepare|slice|chop|cook)\b/iu;
const BINDING_QUALITATIVE = /넉넉|적당(?:량|히)?|조금(?:\s*더)?|듬뿍|많이|소량|약간|크게|가득|수북|평평|취향|기호|\b(?:heaped|heaping|level|generous|generously|scant|rounded|a little|some|to taste|as needed)\b/iu;
const BINDING_PREPARED_NOUN_PHRASE = /^(?:다진|삶은|익힌|구운|볶은|데친|으깬|손질한|채\s*썬)\s+[가-힣][가-힣\s]*$/u;
const BINDING_KOREAN_CLAUSE_NAME = /^[가-힣]+(?:은|는|을|를|이|가|도)\s+[가-힣]/u;
const BINDING_LIST_MARKER = "(?:\\d{1,3}[.)](?!\\d)|[-*•★·ㆍᆞ▶▷◆●■#]{1,4})";
const BINDING_EMOJI_CLUSTER = String.raw`\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*`;
const BINDING_EMOJI_LIST_PREFIX = new RegExp(`^\\s*(?:${BINDING_EMOJI_CLUSTER})+(?=\\s)\\s+`, "u");
const BINDING_TEXT_LIST_PREFIX = new RegExp(`^\\s*${BINDING_LIST_MARKER}(?=\\s|\\p{L})\\s*`, "u");
const COUNT_HALF_CONFIRMATION_VERSION = "count-half-article-caption-v1";
const COUNT_HALF_DESCRIPTOR = "(?:yellow|red|white|purple|large|small|medium|whole|fresh|peeled)";
const escapePattern = (value) => String(value).replace(/[.*+?^$()|[\]{}\\]/gu, "\\$&");
export function stripSourceListPrefix(text) {
  return String(text ?? "").replace(BINDING_EMOJI_LIST_PREFIX, "").replace(BINDING_TEXT_LIST_PREFIX, "");
}
const cleanBindingEntryText = (text) => stripSourceListPrefix(compact(text)
  .replace(/^\[(?:[\d:.]+|line\s+\d+)\]\s*/u, ""));
const cleanBindingName = (text) => compact(text).replace(/^(?:그리고|이제|다음|여기에|then|add|use)\s+/iu, "")
  .replace(/\s*[:：=\-–—]\s*$/u, "").replace(/^(.{2,})(?:은|는|을|를|가)$/u, "$1");

export function sourceQuantityUnboundMentionNeedsReview(text, scope = "") {
  const value = `${compact(text)} ${compact(scope)}`.trim();
  return Boolean(value) && (BINDING_CONDITIONAL.test(value) || BINDING_NEGATED.test(value)
    || APPROXIMATE.test(value) || BINDING_RANGE.test(value) || NOISE.test(value)
    || BINDING_ALTERNATIVE.test(value) || BINDING_KOREAN_ALTERNATIVE.test(value)
    || BINDING_ACTION.test(value) || BINDING_QUALITATIVE.test(value));
}

const bindingJoinedAlternativeName = (value) => BINDING_ALTERNATIVE.test(value) || BINDING_KOREAN_ALTERNATIVE.test(value);
const bindingJoinedIngredientName = (value) => /[+&·ㆍᆞ]|(?:^|\s)(?:and|및)\s*\p{L}|\p{L}\s*및(?:\s|\p{L})|[가-힣]{2,}[과와]\s*[가-힣]{2,}/iu.test(value);
const unsafeBindingName = (namePrefix, sourceName) => !sourceName || sourceName.length > 100 || /^\d/u.test(sourceName)
  || /\d|[|/()（）]/u.test(sourceName) || bindingJoinedAlternativeName(sourceName) || bindingJoinedIngredientName(sourceName)
  || BINDING_ACTION_NAME.test(namePrefix) || BINDING_TRAILING_ACTION_NAME.test(namePrefix)
  || BINDING_KOREAN_CLAUSE_NAME.test(sourceName) && !BINDING_PREPARED_NOUN_PHRASE.test(sourceName)
  || NOISE.test(sourceName);
const BINDING_INGREDIENT_SCOPE = /^(?:양념|sauce|소스|topping|토핑|filling|필링|채소|야채|반죽|밑간|dressing|seasoning|garnish|marinade)$/iu;
const safeBindingIngredientSection = (entry) => entry.scopeKind === "ingredient-section"
  || BINDING_INGREDIENT_SCOPE.test(compact(entry.scopeLabel));

function explicitHints(entry, body, { authoredList = false } = {}) {
  const hints = []; const matches = literalQuantityMatches(body);
  for (const match of matches) {
    if (authoredList && /[+＋\-−–—]\s*$/u.test(body.slice(0, match.index))) continue;
    if (UNSAFE_SUFFIX.test(body.slice(match.index + match.literal.length))) continue;
    const clauseStart = Math.max(body.lastIndexOf(",", match.index), body.lastIndexOf(";", match.index), body.lastIndexOf("|", match.index)) + 1;
    const sourceName = cleanName(body.slice(clauseStart, match.index));
    if (!sourceName || sourceName.length > 100 || /^\d/u.test(sourceName)) continue;
    if (authoredList && /(?:^|\s)(?:크게|가득|수북(?:이|하게)?|평평(?:하게)?|heaped|heaping|level|generous|scant|rounded)\s*$/iu.test(sourceName)) continue;
    const flags = flagsFor(entry, body);
    hints.push({ sourceName, amount: match.amount, unit: match.unit, literal: match.literal, amountOwnerId: entry.id, headerOwnerId: null,
      role: entry.scopeLabel ?? null, flags });
  }
  return hints;
}

function inheritedHeader(entry, byId, ledger) {
  if (!entry.inheritedOriginalUnit || !entry.unitEvidenceId || !compact(entry.source_provider) || !compact(entry.source_method)) return null;
  const header = byId.get(entry.unitEvidenceId); const unit = compact(entry.inheritedOriginalUnit);
  const sameRole = (candidate) => candidate.source_provider === entry.source_provider && candidate.source_method === entry.source_method
    && candidate.scopeLabel === entry.scopeLabel && candidate.scopeContext === entry.scopeContext;
  const isHeader = (candidate) => { const own = compact(candidate?.inheritedOriginalUnit);
    const escaped = own.replace(/[.*+?^$()|[\]{}\\]/gu, "\\$&");
    return candidate?.scopeKind === "explicit-heading" && candidate.id === candidate.unitEvidenceId && own
      && new RegExp(`\\(\\s*${escaped}\\s*\\)`, "u").test(candidate.text); };
  if (!header || !compact(header.source_provider) || !compact(header.source_method) || compact(header.inheritedOriginalUnit) !== unit
    || !sameRole(header) || !isHeader(header) || !Number.isFinite(header.line_index) || !Number.isFinite(entry.line_index)
    || header.line_index >= entry.line_index || ledger.some((candidate) => candidate !== header && sameRole(candidate) && isHeader(candidate)
      && Number.isFinite(candidate.line_index) && candidate.line_index > header.line_index && candidate.line_index < entry.line_index)) return null;
  return { header, unit };
}

function inheritedHints(entry, body, byId, ledger) {
  const linkage = inheritedHeader(entry, byId, ledger); if (!linkage) return [];
  const clauses = body.split(/[,;]/u).map((clause) => compact(clause)).filter(Boolean); const hints = [];
  for (const clause of clauses) {
    const match = clause.match(BARE_RE); if (!match || clauses.length > 1
      && (/[+＋\-−–—]\s*$/u.test(match[1]) || match[0].length !== clause.length)) return [];
    const sourceName = cleanName(match[1]); if (!sourceName || sourceName.length > 100 || /^\d/u.test(sourceName)
      || UNSAFE_SUFFIX.test(clause.slice(match[0].length))) return [];
    hints.push({ sourceName, amount: compact(match[2]), unit: linkage.unit, literal: compact(match[2]),
      amountOwnerId: entry.id, headerOwnerId: linkage.header.id, role: entry.scopeLabel ?? null,
      flags: flagsFor(entry, `${entry.text} ${clause}`) });
  }
  return hints;
}

function closedAuthoredTuple(entry) {
  if (entry.kind !== "text" || entry.source_provider !== "youtube" || entry.source_method !== "description"
    || entry.ingredientSection || /[,;]/u.test(entry.text)) return false;
  const body = cleanEntryText(entry.text); const matches = literalQuantityMatches(body); if (!matches.length) return false;
  if (/[+＋\-−–—]\s*$/u.test(body.slice(0, matches[0].index))) return false;
  const sourceName = cleanName(body.slice(0, matches[0].index));
  if (!sourceName || sourceName.length > 100 || /^\d/u.test(sourceName)
    || NOISE.test(body) || /넣|사용|준비|썰|볶|끓|섞|분량|총량|가격|시간|온도|인분|servings?|minutes?|degrees?/iu.test(sourceName)) return false;
  let remainder = body.slice(matches[0].index);
  for (const match of matches) remainder = remainder.replace(match.literal, "");
  return /^[\s()]*$/u.test(remainder);
}

function closedAuthoredListIds(entries) {
  const shaped = entries.filter(closedAuthoredTuple).sort((a, b) => a.line_index - b.line_index || a.id.localeCompare(b.id));
  const accepted = new Set(); let group = [];
  const flush = () => { if (group.length >= 2) for (const entry of group) accepted.add(entry.id); group = []; };
  for (const entry of shaped) {
    const prior = group.at(-1); const sameList = prior && entry.source_provider === prior.source_provider
      && entry.source_method === prior.source_method && entry.scopeLabel === prior.scopeLabel && entry.scopeContext === prior.scopeContext
      && Number.isFinite(entry.line_index) && entry.line_index === prior.line_index + 1;
    if (!sameList) flush(); group.push(entry);
  }
  flush(); return accepted;
}

function closedSourceQuantityTuple(entry) {
  if (entry.kind !== "text" || entry.source_provider !== "youtube"
    || !["description", "comment"].includes(entry.source_method)
    || entry.ingredientSection || /[,;]/u.test(entry.text)) return false;
  return Boolean(parseClosedSourceQuantityTuple(entry));
}

function sourceQuantityTupleParts(body) {
  const matches = literalQuantityMatches(body);
  if (!matches.length) return null;
  const first = matches[0]; const last = matches.at(-1);
  if (first.index === 0) {
    let openReferenceParens = 0;
    for (let index = 1; index < matches.length; index += 1) {
      const prior = matches[index - 1];
      const separator = body.slice(prior.index + prior.literal.length, matches[index].index);
      if (/^\s*\|\s*$/u.test(separator)) continue;
      if (/^\s*\(\s*$/u.test(separator)) { openReferenceParens += 1; continue; }
      return null;
    }
    let tailStart = last.index + last.literal.length;
    while (openReferenceParens > 0) {
      const closing = body.slice(tailStart).match(/^\s*\)/u);
      if (!closing) return null;
      tailStart += closing[0].length;
      openReferenceParens -= 1;
    }
    const tail = body.slice(tailStart);
    const sourceName = cleanBindingName(tail);
    const offset = tail.indexOf(sourceName);
    if (!sourceName || offset < 0 || !/^\s*$/u.test(tail.slice(offset + sourceName.length))) return null;
    return { matches, sourceName, namePrefix: sourceName, nameStartInBody: tailStart + offset };
  }
  if (/[+＋\-−–—]\s*$/u.test(body.slice(0, first.index))) return null;
  const namePrefix = body.slice(0, first.index);
  const sourceName = cleanBindingName(namePrefix);
  let remainder = body.slice(first.index);
  for (const match of matches) remainder = remainder.replace(match.literal, "");
  if (!/^[\s()]*$/u.test(remainder)) return null;
  return { matches, sourceName, namePrefix, nameStartInBody: body.indexOf(sourceName) };
}

function parseClosedSourceQuantityTuple(entry) {
  const body = cleanBindingEntryText(entry.text);
  const tuple = sourceQuantityTupleParts(body);
  if (!tuple || unsafeBindingName(tuple.namePrefix, tuple.sourceName) || BINDING_QUALITATIVE.test(body)
    || BINDING_CONDITIONAL.test(body) || BINDING_NEGATED.test(body) || BINDING_RANGE.test(body)
    || NOISE.test(body) || tuple.nameStartInBody < 0
    || body.indexOf(tuple.sourceName, tuple.nameStartInBody + tuple.sourceName.length) >= 0) return null;
  return { body, ...tuple };
}

function markedSourceListRow(entry) {
  if (entry.kind !== "text" || entry.source_provider !== "youtube"
    || !["description", "comment"].includes(entry.source_method) || /[,;]/u.test(entry.text)) return false;
  const normalizedText = compact(entry.text);
  if (!BINDING_EMOJI_LIST_PREFIX.test(normalizedText)) return false;
  const body = cleanBindingEntryText(normalizedText);
  return /^[\p{L}]/u.test(body) && body.length <= 160 && !NOISE.test(body)
    && !BINDING_CONDITIONAL.test(body) && !BINDING_NEGATED.test(body) && !BINDING_ACTION.test(body)
    && (BINDING_QUALITATIVE.test(body) || BINDING_RANGE.test(body));
}

function closedSourceQuantityListIds(entries) {
  const shaped = entries.filter((entry) => closedSourceQuantityTuple(entry) || markedSourceListRow(entry)).sort((left, right) =>
    (Number.isInteger(left.source_block_index) ? left.source_block_index : -1)
      - (Number.isInteger(right.source_block_index) ? right.source_block_index : -1)
    || left.line_index - right.line_index || left.id.localeCompare(right.id));
  const accepted = new Set(); let group = [];
  const flush = () => {
    const tuples = group.filter(closedSourceQuantityTuple);
    if (tuples.length >= 2) for (const entry of tuples) accepted.add(entry.id);
    group = [];
  };
  for (const entry of shaped) {
    const prior = group.at(-1); const sameList = prior && entry.source_provider === prior.source_provider
      && entry.source_method === prior.source_method && entry.scopeLabel === prior.scopeLabel
      && entry.scopeContext === prior.scopeContext && entry.source_block_index === prior.source_block_index
      && Number.isFinite(entry.line_index) && entry.line_index === prior.line_index + 1;
    if (!sameList) flush(); group.push(entry);
  }
  flush(); return accepted;
}

function bindingCoordinates(text, literal, from = 0) {
  const start = text.indexOf(literal, from);
  return start < 0 ? null : { start, end: start + literal.length };
}

function closedSourceQuantityBinding(entry, authoredListIds) {
  if (entry.kind !== "text" || entry.source_provider !== "youtube"
    || !["description", "comment"].includes(entry.source_method)
    || !safeBindingIngredientSection(entry) && !authoredListIds.has(entry.id)) return null;
  const normalizedText = compact(entry.text);
  if (!normalizedText || /[,;]/u.test(normalizedText)) return null;
  const tuple = parseClosedSourceQuantityTuple(entry);
  if (!tuple) return null;
  const { body, matches, sourceName, nameStartInBody } = tuple;
  const bodyStart = normalizedText.indexOf(body);
  if (bodyStart < 0 || nameStartInBody < 0
    || body.indexOf(sourceName, nameStartInBody + sourceName.length) >= 0) return null;
  const quantity = bindingCoordinates(normalizedText, matches[0].literal, bodyStart + matches[0].index);
  if (!quantity) return null;
  const references = matches.slice(1).map((match) => {
    const coordinates = bindingCoordinates(normalizedText, match.literal, bodyStart + match.index);
    return coordinates ? {
      amount: match.amount,
      unit: match.unit,
      literal: match.literal,
      normalizedCoordinates: coordinates,
    } : null;
  }).filter(Boolean);
  if (references.length !== matches.length - 1) return null;
  return {
    version: 5,
    sourceName,
    amount: matches[0].amount,
    unit: matches[0].unit,
    literal: matches[0].literal,
    normalizedCoordinates: {
      name: { start: bodyStart + nameStartInBody, end: bodyStart + nameStartInBody + sourceName.length },
      quantity,
    },
    references,
    sourceBlockIndex: Number.isInteger(entry.source_block_index) ? entry.source_block_index : null,
    sourceLineIndex: Number.isInteger(entry.line_index) ? entry.line_index : null,
    sourceMethod: entry.source_method,
    sourceProvider: entry.source_provider,
    ownerId: entry.id,
  };
}

function unitlessHalfTuple(entry) {
  if (entry.kind !== "text" || entry.source_provider !== "youtube"
    || !["description", "comment"].includes(entry.source_method)
    || !safeBindingIngredientSection(entry) || /[,;]/u.test(entry.text)) return null;
  const normalizedText = compact(entry.text);
  const body = cleanBindingEntryText(normalizedText);
  const match = body.match(/^(1\s*\/\s*2)\s+([A-Za-z][A-Za-z' -]{0,99})$/u);
  if (!match) return null;
  const sourceName = cleanBindingName(match[2]);
  if (unsafeBindingName("", sourceName) || BINDING_CONDITIONAL.test(body) || BINDING_NEGATED.test(body)
    || BINDING_RANGE.test(body) || BINDING_QUALITATIVE.test(body) || NOISE.test(body)) return null;
  const bodyStart = normalizedText.indexOf(body);
  const quantityStart = body.indexOf(match[1]);
  const nameStart = body.indexOf(sourceName, quantityStart + match[1].length);
  if (bodyStart < 0 || quantityStart < 0 || nameStart < 0) return null;
  return {
    normalizedText,
    sourceName,
    amount: "1/2",
    literal: match[1],
    normalizedCoordinates: {
      name: { start: bodyStart + nameStart, end: bodyStart + nameStart + sourceName.length },
      quantity: { start: bodyStart + quantityStart, end: bodyStart + quantityStart + match[1].length },
    },
  };
}

function halfCountConfirmation(entry, sourceName) {
  if (entry.kind !== "text" || entry.source_provider !== "youtube" || entry.source_method !== "caption"
    || BINDING_CONDITIONAL.test(entry.text) || BINDING_NEGATED.test(entry.text)
    || BINDING_RANGE.test(entry.text) || APPROXIMATE.test(entry.text)
    || BINDING_ALTERNATIVE.test(entry.text) || BINDING_QUALITATIVE.test(entry.text)) return null;
  const text = compact(entry.text);
  const name = escapePattern(sourceName).replace(/\s+/gu, "\\s+");
  const pattern = new RegExp(`\\bhalf\\s+of\\s+(?:a|an|one)\\s+(?:(?:${COUNT_HALF_DESCRIPTOR})\\s+){0,2}(${name})(?=$|[^\\p{L}\\p{N}])`, "iu");
  const matches = [...text.matchAll(new RegExp(pattern.source, "giu"))];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const nameLiteral = match[1];
  const nameOffset = match[0].lastIndexOf(nameLiteral);
  if (!Number.isInteger(match.index) || nameOffset < 0) return null;
  return {
    version: COUNT_HALF_CONFIRMATION_VERSION,
    evidenceId: entry.id,
    sourceMethod: entry.source_method,
    literal: match[0],
    normalizedCoordinates: {
      quantity: { start: match.index, end: match.index + "half".length },
      name: { start: match.index + nameOffset, end: match.index + nameOffset + nameLiteral.length },
    },
  };
}

function unitlessHalfCountBinding(entry, ledger) {
  const tuple = unitlessHalfTuple(entry);
  if (!tuple) return null;
  const confirmations = ledger.map((candidate) => halfCountConfirmation(candidate, tuple.sourceName)).filter(Boolean);
  if (confirmations.length !== 1) return null;
  return {
    version: 5,
    sourceName: tuple.sourceName,
    amount: tuple.amount,
    unit: "개",
    literal: tuple.literal,
    normalizedCoordinates: tuple.normalizedCoordinates,
    references: [],
    sourceBlockIndex: Number.isInteger(entry.source_block_index) ? entry.source_block_index : null,
    sourceLineIndex: Number.isInteger(entry.line_index) ? entry.line_index : null,
    sourceMethod: entry.source_method,
    sourceProvider: entry.source_provider,
    ownerId: entry.id,
    unitInference: confirmations[0],
  };
}

export function validateSourceCountUnitInference(ledger, binding) {
  const inference = binding?.unitInference;
  if (!Array.isArray(ledger) || !inference || inference.version !== COUNT_HALF_CONFIRMATION_VERSION
    || binding.amount !== "1/2" || binding.unit !== "개" || typeof binding.sourceName !== "string") return false;
  const confirmation = ledger.find((entry) => entry?.id === inference.evidenceId);
  const rebuilt = confirmation ? halfCountConfirmation(confirmation, binding.sourceName) : null;
  return Boolean(rebuilt && JSON.stringify(rebuilt) === JSON.stringify(inference));
}

const sourceNameKey = (value) => compact(value).replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("ko-KR");

export function annotateSourceQuantityBindings(ledger) {
  if (!Array.isArray(ledger)) return ledger;
  const listIds = closedSourceQuantityListIds(ledger);
  const bindings = new Map();
  for (const entry of ledger) {
    const binding = closedSourceQuantityBinding(entry, listIds) ?? unitlessHalfCountBinding(entry, ledger);
    if (binding) bindings.set(entry.id, binding);
  }
  for (const [ownerId, binding] of bindings) {
    const repeatedOwner = ledger.some((entry) => entry.id !== ownerId && entry.kind !== "frame"
      && entry.source_provider === binding.sourceProvider && entry.source_method === binding.sourceMethod
      && (Number.isInteger(binding.sourceBlockIndex) ? entry.source_block_index === binding.sourceBlockIndex : true)
      && sourceNameKey(entry.text).includes(sourceNameKey(binding.sourceName))
      && (literalQuantityMatches(entry.text).length > 0 || unitlessHalfTuple(entry)?.sourceName === binding.sourceName));
    binding.repeatedOwner = repeatedOwner;
  }
  return ledger.map((entry) => {
    const binding = bindings.get(entry.id);
    return binding ? { ...entry, sourceQuantityBindings: [binding] } : entry;
  });
}

export function buildSourceQuantityOwnerHints(ledger, { maxHints = SOURCE_QUANTITY_OWNER_HINT_MAX } = {}) {
  if (!Array.isArray(ledger) || ledger.length > SOURCE_QUANTITY_OWNER_LEDGER_MAX || !Number.isInteger(maxHints) || maxHints < 1 || maxHints > 128
    || ledger.some((entry) => !entry || typeof entry.id !== "string" || entry.id.length > 32
      || entry.kind !== "frame" && (typeof entry.text !== "string" || entry.text.length > SOURCE_QUANTITY_OWNER_TEXT_MAX))) {
    throw new Error("SOURCE_QUANTITY_OWNER_HINT_INPUT_BOUNDS");
  }
  const byId = new Map(ledger.map((entry) => [entry.id, entry]));
  if (byId.size !== ledger.length) throw new Error("SOURCE_QUANTITY_OWNER_HINT_DUPLICATE_ID");
  const ordered = [...ledger].sort((left, right) => (Number.isFinite(left.line_index) ? left.line_index : Number.MAX_SAFE_INTEGER)
    - (Number.isFinite(right.line_index) ? right.line_index : Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
  const authoredListIds = closedAuthoredListIds(ordered);
  const rows = [];
  for (const entry of ordered) {
    if (entry.kind === "frame" || entry.ingredientSection !== true && entry.kind !== "ocr" && !authoredListIds.has(entry.id)) continue;
    const body = cleanEntryText(entry.text); const explicit = explicitHints(entry, body, { authoredList: authoredListIds.has(entry.id) });
    rows.push(...(explicit.length ? explicit : inheritedHints(entry, body, byId, ledger)));
  }
  const unique = rows.filter((row, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(row)) === index);
  const groups = new Map();
  for (const row of unique) { const key = JSON.stringify([row.amountOwnerId, row.sourceName]); const values = groups.get(key) ?? [];
    values.push(row); groups.set(key, values); }
  for (const values of groups.values()) { const pairs = new Set(values.map((row) => `${row.amount}\u0000${row.unit}`));
    const ambiguous = pairs.size > 1 || values.some((row) => Object.values(row.flags).some(Boolean)); for (const row of values) row.ambiguous = ambiguous; }
  const exposed = new Map();
  for (const { sourceName: _private, ambiguous, ...hint } of unique) { const key = JSON.stringify(hint); const prior = exposed.get(key);
    exposed.set(key, { ...hint, ambiguous: Boolean(ambiguous || prior?.ambiguous || prior) }); }
  const hints = [...exposed.values()];
  if (hints.length > maxHints) return { version: SOURCE_QUANTITY_OWNER_HINT_VERSION, status: "omitted-over-cap", maxHints, hints: [] };
  return { version: SOURCE_QUANTITY_OWNER_HINT_VERSION, status: "complete", maxHints, hints };
}

export function appendSourceQuantityOwnerHints(prompt, ledger) {
  const packet = buildSourceQuantityOwnerHints(ledger);
  if (packet.status !== "complete" || !packet.hints.length) return prompt;
  const wire = { v: 1, h: packet.hints.map((hint) => ({ a: hint.amount, u: hint.unit, o: hint.amountOwnerId,
    ...(hint.headerOwnerId ? { h: hint.headerOwnerId } : {}), ...(hint.role ? { r: hint.role } : {}),
    ...(Object.values(hint.flags).some(Boolean) ? { f: Object.entries(hint.flags).filter(([, value]) => value).map(([key]) => key) } : {}),
    ...(hint.ambiguous ? { x: true } : {}) })) };
  const instruction = "SOURCE_QUANTITY_OWNER_HINTS는 원문 후보이며 정답이 아니다. 키 a/u/o/h/r/f/x는 amount/unit/amountOwnerId/headerOwnerId/role/flags/ambiguous다. o 원문에서 재료명과 한 literal a+u를 함께 확인하고 o를 evidence에 쓴다. h가 있으면 두 번째 evidence slot을 h에 예약한다. f/x는 주의할 원문 문맥이다. 약 1g처럼 literal 근사량은 기존 계약이 허용하면 estimated로 보존하고, A 또는 B의 공통 literal 수량은 실제 사용 identity를 임의로 고르지 않는다. 실제 범위나 충돌에서는 대표값을 만들지 않는다. 새 숫자·단위·이름·별칭·환산을 만들지 않는다.";
  const sourceMarker = "\n\nSOURCE_DATA_BEGIN\n\n"; const markerIndex = prompt.lastIndexOf(sourceMarker);
  if (markerIndex < 0 || !prompt.endsWith("\n\nSOURCE_DATA_END")) throw new Error("SOURCE_QUANTITY_OWNER_HINT_SOURCE_PACKET_BOUNDARY");
  const block = `\n\n${instruction}\nSOURCE_QUANTITY_OWNER_HINTS_BEGIN\n${JSON.stringify(wire)}\nSOURCE_QUANTITY_OWNER_HINTS_END`;
  return prompt.slice(0, markerIndex) + block + prompt.slice(markerIndex);
}
