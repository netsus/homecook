"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { resolveReturnHref } from "@/lib/navigation/return-context";

export function useAppReturn({ fallback }: { fallback: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const href = useMemo(
    () => resolveReturnHref(searchParams, fallback),
    [fallback, searchParams],
  );
  const goBack = useCallback(() => {
    router.replace(href);
  }, [href, router]);

  return useMemo(() => ({ goBack, href }), [goBack, href]);
}
