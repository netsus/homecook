export function normalizeRecipeSectionLabel(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function stripMatchingSectionPrefix(
  value: string | null | undefined,
  componentLabel: string | null | undefined,
) {
  const text = value ?? null;
  const label = normalizeRecipeSectionLabel(componentLabel);

  if (!text || !label) {
    return text;
  }

  const prefix = `[${label}]`;
  return text.startsWith(prefix) ? text.slice(prefix.length).trimStart() : text;
}

export function shouldShowSectionHeading(
  currentLabel: string | null | undefined,
  previousLabel: string | null | undefined,
) {
  const current = normalizeRecipeSectionLabel(currentLabel);
  const previous = normalizeRecipeSectionLabel(previousLabel);

  return Boolean(current && current !== previous);
}
