"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRecipeQuantityContexts } from "@/lib/api/recipe-quantity-context";
import { isApiFetchError } from "@/lib/api/fetch-json";
import { fetchUserProfile } from "@/lib/api/mypage";
import type { RecipeIngredientQuantityContext, RecipeQuantitySource } from "@/types/recipe";

class ContextSubjectError extends Error {}

/** Only an explicit button invokes this read; login/mount never sends a POST. */
export function useRecipeQuantityContext({ sources, subject, onResolved, onError, onUnauthorized }: {
  sources: RecipeQuantitySource[];
  subject: () => { owner: string | null; generation: number | null };
  onResolved: (rowKey: string, context: RecipeIngredientQuantityContext) => void;
  onError: (message: string) => void;
  onUnauthorized?: (rowKey: string) => string | void;
}) {
  const latest = useRef({ sources, subject, onResolved, onError, onUnauthorized });
  latest.current = { sources, subject, onResolved, onError, onUnauthorized };
  const pending = useRef<{ controller: AbortController; source: RecipeQuantitySource } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  useEffect(() => () => pending.current?.controller.abort(), []);
  async function request(rowKey: string) {
    const source = latest.current.sources.find(row => row.row_key === rowKey);
    if (!source) return;
    pending.current?.controller.abort();
    const controller = new AbortController(); pending.current = { controller, source }; setLoadingKey(rowKey);
    const expected = { ...latest.current.subject() };
    try {
      if (!expected.owner || expected.generation === null) throw new ContextSubjectError("초안을 작성한 계정 정보를 확인하지 못했어요. 원입력을 유지한 채 로그인 상태를 확인해 주세요.");
      const before = await fetchUserProfile();
      if (controller.signal.aborted) return;
      if (before.id !== expected.owner || before.account_generation !== expected.generation) throw new ContextSubjectError("계정 상태가 바뀌어 수량 정보를 연결하지 않았어요. 원입력은 유지돼요.");
      const data = await fetchRecipeQuantityContexts([source], controller.signal);
      const after = await fetchUserProfile();
      if (controller.signal.aborted) return;
      const current = latest.current.sources.find(row => row.row_key === rowKey);
      if (JSON.stringify(current) !== JSON.stringify(source)) return;
      const currentSubject = latest.current.subject();
      if (currentSubject.owner !== expected.owner || currentSubject.generation !== expected.generation) return;
      if (data.subject.owner_uuid !== expected.owner || data.subject.account_generation !== expected.generation
        || after.id !== expected.owner || after.account_generation !== expected.generation) {
        throw new ContextSubjectError("계정 상태가 바뀌어 수량 정보를 연결하지 않았어요. 원입력은 유지돼요.");
      }
      latest.current.onResolved(rowKey, data.items[0].context);
      if (!data.items[0].context.ready) latest.current.onError("지금은 새 수량 입력을 사용할 수 없어요. 원입력과 기존 분량은 유지돼요.");
    } catch (error) {
      const currentSubject = latest.current.subject();
      if (controller.signal.aborted || currentSubject.owner !== expected.owner || currentSubject.generation !== expected.generation
        || JSON.stringify(latest.current.sources.find(row => row.row_key === rowKey)) !== JSON.stringify(source)) return;
      if (isApiFetchError(error) && error.status === 401 && latest.current.onUnauthorized) {
        const message = latest.current.onUnauthorized(rowKey);
        if (message) latest.current.onError(message);
      } else latest.current.onError(error instanceof ContextSubjectError ? error.message : "수량 정보를 확인하지 못했어요. 원입력과 분량은 유지돼요.");
    } finally { if (!controller.signal.aborted) { setLoadingKey(null); pending.current = null; } }
  }
  return { loadingKey, request };
}
