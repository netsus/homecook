import { CANONICAL_COOKING_METHODS, COOKING_METHOD_SYNONYMS, type CanonicalCookingMethodCode } from "@/lib/cooking-method-taxonomy";

// Conservative action forms from the existing extraction rules. Nouns such as
// "다진 마늘", "볶음밥" and appliances mentioned without an action are not steps.
const ACTIONS: Partial<Record<CanonicalCookingMethodCode, RegExp>> = {
  slice: /썰(?:어|고|기|면|다|어요)|잘라(?:요|주세요|줍|준다|서|고)/u,
  mince: /다져|다지(?:기|세요|고|다|면)/u,
  grind: /갈아|갈기/u,
  mash: /으깨/u,
  pre_season: /밑간(?:해|하)|재워|재우기/u,
  thaw: /해동(?:해|하|시켜|시킵)/u,
  pickle: /절여|절이(?:기|세요|고|다)/u,
  boil: /끓여|끓이(?:기|세요|고|다|면)|끓인다|끓입니다/u,
  parboil: /삶아|삶으(?:세요|면)|삶기/u,
  blanch: /데쳐|데치(?:기|세요|고|다)/u,
  steam: /쪄|찌기|찐다|찝니다/u,
  stir_fry: /볶아|볶으(?:세요|면)|볶기|볶는다|볶습니다/u,
  grill: /구워|굽기|굽는다|굽습니다|구우(?:세요|면)/u,
  pan_fry: /부쳐|부치(?:기|세요|고|다)/u,
  deep_fry: /튀겨|튀기(?:기|세요|고|다)/u,
  braise: /조려|조리(?:기|세요)/u,
  reduce: /졸여|졸이(?:기|세요|고|다)/u,
  mix: /섞어|섞으(?:세요|면)|섞기|섞는다|비벼|비비기/u,
  toss: /버무려|버무리(?:기|세요|고|다)|무쳐|무치(?:기|세요|고|다)/u,
};
const NEGATED_OR_AMBIGUOUS = /지\s*(?:않|말|마)|말고|금지|없이|안\s*(?:돼|되)|하지\s*마|(?:^|\s)(?:안|못)\s+|안(?:볶|굽|구워|끓|삶|튀|찌|썰|섞|다지|데치|무치)|또는|혹은|아니면|거나/u;

export function suggestCookingMethod<T extends { code: string }>(instruction: string, methods: readonly T[]): T | null {
  const text = instruction.trim().normalize("NFKC").toLowerCase();
  if (!text || NEGATED_OR_AMBIGUOUS.test(text)) return null;
  const candidates = new Set<CanonicalCookingMethodCode>();
  for (const [code, pattern] of Object.entries(ACTIONS)) {
    if (pattern.test(text)) candidates.add(code as CanonicalCookingMethodCode);
  }
  for (const method of CANONICAL_COOKING_METHODS) {
    if (text === method.label) candidates.add(method.code);
  }
  for (const synonym of COOKING_METHOD_SYNONYMS) {
    // Only action synonyms are useful here; "오븐" or "노릇하게" alone is not
    // enough evidence to choose a cooking method in an editable instruction.
    if (!synonym.is_active || !ACTIONS[synonym.method_code]?.test(synonym.synonym)) continue;
    if (synonym.match_kind === "exact" ? text === synonym.synonym : text.includes(synonym.synonym)) candidates.add(synonym.method_code);
  }
  if (/구워|굽|익혀|익히/u.test(text)) {
    const appliances: CanonicalCookingMethodCode[] = [];
    if (/에어\s*프라이어/u.test(text)) appliances.push("air_fryer");
    if (/오븐/u.test(text)) appliances.push("oven_bake");
    if (/전자\s*(?:레인지|렌지)/u.test(text)) appliances.push("microwave");
    if (appliances.length) {
      candidates.delete("grill");
      for (const appliance of appliances) candidates.add(appliance);
    }
  }
  if (candidates.size !== 1) return null;
  const [code] = candidates;
  return methods.find((method) => method.code.toLowerCase() === code) ?? null;
}
