const HEAT_LEVEL_LABELS = new Map<string, string>([
  ["high", "강불"],
  ["strong", "강불"],
  ["강", "강불"],
  ["mediumhigh", "중강불"],
  ["medium-high", "중강불"],
  ["medium_high", "중강불"],
  ["중강", "중강불"],
  ["medium", "중불"],
  ["mid", "중불"],
  ["middle", "중불"],
  ["중", "중불"],
  ["mediumlow", "중약불"],
  ["medium-low", "중약불"],
  ["medium_low", "중약불"],
  ["중약", "중약불"],
  ["low", "약불"],
  ["weak", "약불"],
  ["약", "약불"],
]);

export function formatHeatLevelLabel(
  heatLevel: string | null | undefined,
): string | null {
  const value = heatLevel?.trim();

  if (!value) {
    return null;
  }

  const compactValue = value.replace(/\s+/g, "");
  const normalized = compactValue.toLowerCase();

  return (
    HEAT_LEVEL_LABELS.get(normalized) ??
    HEAT_LEVEL_LABELS.get(value.toLowerCase()) ??
    value
  );
}
