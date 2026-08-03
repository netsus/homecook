"use client";

import React from "react";
import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import type { SnapshotV2CookModeData } from "@/types/cooking";

export function SnapshotV2CookModeView({ data, cancelling = false, onCancel }: { data: SnapshotV2CookModeData; cancelling?: boolean; onCancel: () => void }) {
  const terminal = data.status !== "in_progress";
  return <div className="cook-mobile-whole-screen relative mx-auto flex min-h-dvh max-w-[430px] flex-col overflow-hidden" data-cook-theme="dark" data-testid="snapshot-v2-cook-mode">
    <header className="px-4 py-4"><h1 className="cook-mobile-whole-title text-xl font-extrabold">{data.recipe.title}</h1><p className="cook-mobile-whole-subtitle">{data.recipe.cooking_servings}인분 · 고정된 레시피</p></header>
    {terminal ? <p className="mx-4 rounded-[16px] bg-white/8 p-4" role="status">{data.status === "completed" ? "완료된 요리 기록이에요. 읽기 전용으로 볼 수 있어요." : "취소된 요리 기록이에요. 읽기 전용으로 볼 수 있어요."}</p> : null}
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24"><CookModeWholeBoard density="mobile" recipe={data.recipe} /></main>
    {!terminal ? <footer className="cook-mobile-whole-bottom-bar fixed inset-x-0 bottom-0 mx-auto max-w-[430px] p-4"><button className="cook-mobile-whole-cancel-button min-h-14 w-full rounded-[16px] border-0 font-bold" disabled={cancelling} onClick={onCancel} type="button">{cancelling ? "취소 중…" : "취소"}</button></footer> : null}
  </div>;
}
