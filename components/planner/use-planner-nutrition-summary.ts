"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchPlannerNutrition,
  isPlannerNutritionApiError,
} from "@/lib/api/planner-nutrition";
import type { PlannerNutritionData } from "@/types/planner-nutrition";

export type PlannerNutritionRequestStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

export function usePlannerNutritionSummary({
  enabled,
  endDate,
  onUnauthorized,
  startDate,
}: {
  enabled: boolean;
  endDate: string;
  onUnauthorized?: () => void;
  startDate: string;
}) {
  const [data, setData] = useState<PlannerNutritionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState<PlannerNutritionRequestStatus>("idle");
  const [requestRevision, setRequestRevision] = useState(0);
  const hasVisibleDataRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      abortControllerRef.current?.abort();
      setStatus("idle");
      setIsRefreshing(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const hasVisibleData = hasVisibleDataRef.current;

    setError(null);
    setIsRefreshing(hasVisibleData);
    setStatus(hasVisibleData ? "ready" : "loading");

    void fetchPlannerNutrition(startDate, endDate, controller.signal)
      .then((nextData) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        setData(nextData);
        hasVisibleDataRef.current = true;
        setError(null);
        setIsRefreshing(false);
        setStatus(
          nextData.summary.recipe_entry_count +
              nextData.summary.product_entry_count ===
            0
            ? "empty"
            : "ready",
        );
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        if (isPlannerNutritionApiError(nextError) && nextError.status === 401) {
          setIsRefreshing(false);
          onUnauthorized?.();
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "계획 영양을 불러오지 못했어요.",
        );
        setIsRefreshing(false);
        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [enabled, endDate, onUnauthorized, requestRevision, startDate]);

  const retry = useCallback(async () => {
    setRequestRevision((revision) => revision + 1);
  }, []);

  return {
    data,
    error,
    isRefreshing,
    retry,
    status,
  };
}
