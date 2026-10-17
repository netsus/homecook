import React from "react";

export interface NutritionFactsRow {
  code: string;
  label: string;
  totalText: string;
  perServingText: string;
  status?: string;
}

/** Presentation of existing calculations; unknown nutrients retain their state. */
export function NutritionFactsTable({ rows, totalLabel, perServingLabel = "1인분", label = "영양성분표" }: {
  rows: NutritionFactsRow[];
  totalLabel: string;
  perServingLabel?: string;
  label?: string;
}) {
  return <div className="min-w-0 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-3 sm:px-4">
    <table aria-label={label} className="w-full table-fixed border-collapse text-sm text-[var(--foreground)]">
      <caption className="pb-3 text-left"><strong className="block text-xl font-semibold">영양성분</strong><span className="mt-1 block text-xs font-normal text-[var(--text-2)]">{totalLabel} 기준 · 재료 정보로 계산한 예상값</span></caption>
      <thead className="border-y-2 border-[var(--foreground)]">
        <tr><th className="w-[32%] py-2 text-left font-medium" scope="col">성분</th><th className="w-[34%] py-2 pl-1 text-right font-medium" scope="col">{totalLabel}</th><th className="w-[34%] py-2 pl-2 text-right font-medium" scope="col">{perServingLabel}</th></tr>
      </thead>
      <tbody>{rows.map(row => <tr className="border-b border-[var(--line)] last:border-b-0" key={row.code}>
        <th className="py-3 pr-1 text-left align-top font-medium" scope="row">{row.label}{row.status === "partial" ? <span className="mt-1 block text-[11px] font-normal text-[var(--text-2)]">확인된 일부</span> : null}</th>
        <td className={`break-keep py-3 pl-1 text-right align-top tabular-nums ${row.code === "energy_kcal" ? "font-semibold" : ""}`}>{row.totalText}</td>
        <td className="break-keep py-3 pl-2 text-right align-top tabular-nums text-[var(--text-2)]">{row.perServingText}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
