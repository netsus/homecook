import { AMOUNT_SOURCE, literalQuantityMatches } from "./literal-quantity-grammar.mjs";

export const SOURCE_QUANTITY_OWNER_HINT_VERSION = "source-quantity-owner-hints-v1";
export const SOURCE_QUANTITY_OWNER_HINT_MAX = 64;
export const SOURCE_QUANTITY_OWNER_LEDGER_MAX = 512;
export const SOURCE_QUANTITY_OWNER_TEXT_MAX = 1000;
const compact = (value) => String(value ?? "").normalize("NFKC").replace(/⁄/gu, "/").replace(/\s+/gu, " ").trim();
const BARE_RE = new RegExp("^(.*?)(" + AMOUNT_SOURCE + ")(?=$|[\\s;!?()]|,(?!\\d)|[.](?!\\d))", "iu");
const UNSAFE_SUFFIX = /^\s*(?:(?:의\s*)?(?:반|절반)(?=$|\s|[(),.;을은는이가만씩으])|[+＋~〜～]|[-–—]\s*\d|보다\s*(?:적|많)|미만|초과|이상|이하|(?:과|와|에|에서|더하기)\s*\d)/u;
const CONDITIONAL = /대체|대신|또는|혹은|\bor\b|선택|옵션|원하(?:면|시면)|있으면|없으면|넣어도|추가해도/iu;
const NEGATED = /말고|제외|생략|필요\s*없|넣지|쓰지|사용하지|추가하지|붓지|뿌리지|아니라/iu;
const APPROXIMATE = /약\s*(?=\d|반)|정도|가량|쯤|about|approximately|roughly/iu;
const RANGE = /\d\s*(?:[~〜～–—]|-(?=\s*\d))\s*\d|이상|이하|미만|초과|between|at least|at most/iu;
const NOISE = /https?:|구독|좋아요|이벤트|쿠폰|할인|구매|협찬|광고/iu;
const cleanEntryText = (text) => compact(text).replace(/^\[(?:[\d:.]+|line\s+\d+)\]\s*/u, "").replace(/^\s*[-*•★]+\s*/u, "");
const cleanName = (text) => compact(text).replace(/^(?:그리고|이제|다음|여기에|then|add|use)\s+/iu, "")
  .replace(/\s*(?:은|는|을|를|이|가)?\s*[:：=\-–—]?\s*$/u, "");
const flagsFor = (entry, text) => { const scope = `${entry.scopeContext ?? ""} ${entry.scopeLabel ?? ""}`;
  return { approximate: APPROXIMATE.test(text), range: RANGE.test(text), conditional: CONDITIONAL.test(text), negated: NEGATED.test(text),
    correction: entry.source_method === "comment" && /정정|수정|오타/u.test(entry.text), noisy: NOISE.test(text) || NOISE.test(scope) }; };

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
