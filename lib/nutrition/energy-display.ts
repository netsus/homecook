/** Presentation only: retain precise energy values for sums, storage and charts. */
export function formatEnergyKcal(
  amount: number | null | undefined,
  { partial = false, unavailableText = "정보 준비 중" }: { partial?: boolean; unavailableText?: string } = {},
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return unavailableText;
  if (amount > 0 && amount < 5) return `${partial ? "확인된 열량 " : ""}5 kcal 미만`;
  return `${partial && amount === 0 ? "확인된 열량 " : ""}${Math.round(amount).toLocaleString("ko-KR")} kcal`;
}

export const SMALL_ENERGY_DISPLAY_NOTICE = "0보다 크고 5kcal 미만인 열량은 ‘5kcal 미만’으로 표시해요. 합계에는 실제 값을 반영해요.";
