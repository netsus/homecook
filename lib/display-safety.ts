const KNOWN_UNSAFE_DISPLAY_VALUES = new Set([
  "토블론",
  "ㄴㅇㄹㅇ",
  "ㅏ;ㅣ;",
]);

const HANGUL_JAMO_PATTERN = /[\u3131-\u318e]/g;
const READABLE_TEXT_PATTERN = /[0-9A-Za-z가-힣]/;
const PUNCTUATION_ONLY_PATTERN = /^[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/;

export function normalizeDisplayText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isSafeDisplayText(value: string | null | undefined) {
  const normalized = normalizeDisplayText(value);
  const compact = normalized.replace(/\s+/g, "");

  if (!compact) {
    return false;
  }

  if (KNOWN_UNSAFE_DISPLAY_VALUES.has(compact)) {
    return false;
  }

  if (PUNCTUATION_ONLY_PATTERN.test(compact)) {
    return false;
  }

  const jamoCount = compact.match(HANGUL_JAMO_PATTERN)?.length ?? 0;
  if (jamoCount > 0) {
    const jamoRatio = jamoCount / compact.length;
    if (!READABLE_TEXT_PATTERN.test(compact) || jamoRatio >= 0.5) {
      return false;
    }
  }

  return true;
}

export function getSafeDisplayText(value: string | null | undefined, fallback: string) {
  const normalized = normalizeDisplayText(value);
  return isSafeDisplayText(normalized) ? normalized : fallback;
}

export function filterSafeDisplayItems<T>(
  items: T[],
  getLabel: (item: T) => string | null | undefined,
) {
  return items.filter((item) => isSafeDisplayText(getLabel(item)));
}
