import React from "react";

import type {
  YoutubeExtractionJobData,
  YoutubeExtractionProgressStage,
} from "@/types/youtube-extraction";

const PROGRESS_STAGE_ORDER = [
  "queued",
  "source_fetch",
  "video_download",
  "frame_extraction",
  "model_analysis",
  "finalizing",
] as const satisfies readonly YoutubeExtractionProgressStage[];

const PROGRESS_COPY: Record<YoutubeExtractionProgressStage, {
  current: string;
  short: string;
}> = {
  queued: { current: "작업 대기 중", short: "대기" },
  source_fetch: { current: "영상 정보와 자막 확인 중", short: "정보 확인" },
  video_download: { current: "분석할 영상을 준비하는 중", short: "영상 준비" },
  frame_extraction: { current: "주요 장면을 찾는 중", short: "장면 찾기" },
  model_analysis: { current: "장면에서 레시피를 분석하는 중", short: "레시피 분석" },
  finalizing: { current: "추출 결과를 정리하는 중", short: "결과 정리" },
};

type ProgressSegmentState = "done" | "active" | "pending" | "indeterminate";

function formatEtaRange(lowSeconds: number, highSeconds: number) {
  const lowMinutes = Math.max(1, Math.floor(lowSeconds / 60));
  const highMinutes = Math.max(lowMinutes, Math.ceil(highSeconds / 60));
  return `약 ${lowMinutes}~${highMinutes}분 남음`;
}

function getEtaCopy(progress: YoutubeExtractionJobData["progress"]) {
  if (!progress) return "예상 시간 계산 중";
  if (progress.delayed) {
    return "예상보다 오래 걸리고 있어요. 추출은 계속 진행 중이에요.";
  }
  if (
    typeof progress.remaining_seconds_low === "number"
    && typeof progress.remaining_seconds_high === "number"
    && progress.estimate_confidence
  ) {
    return formatEtaRange(
      progress.remaining_seconds_low,
      progress.remaining_seconds_high,
    );
  }
  return "예상 시간 계산 중";
}

function getProgressPresentation(job: YoutubeExtractionJobData | null) {
  const progress = job?.progress ?? null;
  const etaCopy = getEtaCopy(progress);

  if (!job || job.status === "queued") {
    const current = PROGRESS_COPY.queued;
    return {
      currentCopy: current.current,
      currentShortLabel: current.short,
      attemptCopy: null,
      etaCopy,
      ariaValueNow: 0,
      ariaValueText: `${current.current} · ${etaCopy}`,
      segments: PROGRESS_STAGE_ORDER.map((stage) => ({
        label: PROGRESS_COPY[stage].short,
        state: stage === "queued" ? "active" : "pending",
      } satisfies { label: string; state: ProgressSegmentState })),
    };
  }

  if (job.status === "processing" && progress) {
    const current = PROGRESS_COPY[progress.stage];
    const activeIndex = PROGRESS_STAGE_ORDER.indexOf(progress.stage);
    return {
      currentCopy: current.current,
      currentShortLabel: current.short,
      attemptCopy: progress.attempt > 1 ? `다시 분석 중 (${progress.attempt}/3)` : null,
      etaCopy,
      ariaValueNow: Math.min(progress.confirmed_percent, 95),
      ariaValueText: `${current.current} · ${etaCopy}`,
      segments: PROGRESS_STAGE_ORDER.map((stage, index) => ({
        label: PROGRESS_COPY[stage].short,
        state: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
      } satisfies { label: string; state: ProgressSegmentState })),
    };
  }

  return {
    currentCopy: "진행 상황 확인 중",
    currentShortLabel: "진행 확인",
    attemptCopy: null,
    etaCopy,
    ariaValueNow: null,
    ariaValueText: `진행 상황 확인 중 · ${etaCopy}`,
    segments: PROGRESS_STAGE_ORDER.map((stage) => ({
      label: PROGRESS_COPY[stage].short,
      state: "indeterminate",
    } satisfies { label: string; state: ProgressSegmentState })),
  };
}

function formatElapsed(elapsedMs: number) {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return elapsedSeconds < 60
    ? `${elapsedSeconds}초 경과`
    : `${Math.floor(elapsedSeconds / 60)}분 ${String(elapsedSeconds % 60).padStart(2, "0")}초 경과`;
}

interface YoutubeExtractionProgressCardProps {
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  elapsedMs: number;
  job: YoutubeExtractionJobData | null;
}

export function YoutubeExtractionProgressCard({
  ariaLabel = "유튜브 레시피 추출 진행 상태",
  className = "",
  compact = false,
  elapsedMs,
  job,
}: YoutubeExtractionProgressCardProps) {
  const presentation = getProgressPresentation(job);

  return (
    <div
      className={[
        "w-full rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] text-left",
        compact ? "p-3" : "p-4",
        className,
      ].join(" ")}
      data-youtube-progress-surface={compact ? "notification" : "screen"}
    >
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--brand)] motion-safe:animate-pulse" />
        <div className="min-w-0">
          {presentation.attemptCopy ? (
            <p className="text-xs font-semibold text-[var(--brand-deep)]">
              {presentation.attemptCopy}
            </p>
          ) : null}
          <p className="break-keep text-sm font-semibold text-[var(--foreground)]" data-youtube-progress-current-copy>
            {presentation.currentCopy}
          </p>
        </div>
      </div>
      <div
        aria-label={ariaLabel}
        aria-valuemax={presentation.ariaValueNow !== null ? 100 : undefined}
        aria-valuemin={presentation.ariaValueNow !== null ? 0 : undefined}
        aria-valuenow={presentation.ariaValueNow ?? undefined}
        aria-valuetext={presentation.ariaValueText}
        className={`${compact ? "mt-3" : "mt-4"} grid h-2 grid-cols-6 gap-1`}
        role="progressbar"
      >
        {presentation.segments.map((stage) => (
          <span
            data-youtube-progress-segment={stage.label}
            className={[
              "rounded-full",
              stage.state === "done"
                ? "bg-[var(--brand)]"
                : stage.state === "active"
                  ? "bg-[var(--brand)] motion-safe:animate-pulse"
                  : stage.state === "indeterminate"
                    ? "bg-[var(--line-strong)] motion-safe:animate-pulse"
                    : "bg-[var(--line-strong)]",
            ].join(" ")}
            key={stage.label}
          >
            <span className="sr-only">{stage.label}</span>
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-[var(--foreground)]" data-youtube-progress-current-label>
        {presentation.currentShortLabel}
      </p>
      <div
        aria-live="off"
        className={[
          "mt-3 flex gap-1 text-xs text-[var(--text-2)]",
          compact ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between",
        ].join(" ")}
      >
        <span aria-live="off">{formatElapsed(elapsedMs)}</span>
        <span>{presentation.etaCopy}</span>
      </div>
    </div>
  );
}
