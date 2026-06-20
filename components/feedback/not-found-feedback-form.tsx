"use client";

import React from "react";
import { useMemo, useState } from "react";

import type { ApiResponse } from "@/types/api";

const MAX_FEEDBACK_LENGTH = 600;
const STORAGE_KEY = "homecook:not-found-feedback-anonymous-id";

type SubmitState = "idle" | "submitting" | "success" | "error";

function createAnonymousId() {
  const randomValue = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

  return `anon_${randomValue.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 48)}`;
}

function readAnonymousId() {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing?.startsWith("anon_")) {
      return existing;
    }

    const next = createAnonymousId();
    localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return createAnonymousId();
  }
}

export function NotFoundFeedbackForm() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const trimmedMessage = message.trim();
  const isSubmitting = status === "submitting";
  const helperId = "not-found-feedback-helper";
  const statusId = "not-found-feedback-status";
  const describedBy = useMemo(() => (
    statusMessage ? `${helperId} ${statusId}` : helperId
  ), [statusMessage]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedMessage) {
      setStatus("error");
      setStatusMessage("상황을 한 줄이라도 적어 주세요.");
      return;
    }

    setStatus("submitting");
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/feedback/404", {
        body: JSON.stringify({
          anonymous_id: readAnonymousId(),
          current_url: window.location.href,
          message: trimmedMessage,
          occurred_at: new Date().toISOString(),
          referrer: document.referrer || null,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const json = await response.json().catch(() => null) as ApiResponse<{ received: true }> | null;

      if (!response.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      }

      setMessage("");
      setStatus("success");
      setStatusMessage("보내주셔서 고마워요. 확인 후 개선할게요.");
    } catch (error) {
      setStatus("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "피드백을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  return (
    <section className="not-found-feedback" aria-labelledby="not-found-feedback-title">
      <div className="not-found-feedback-copy">
        <h2 id="not-found-feedback-title">문제 알려주기</h2>
        <p>불편을 드려 죄송해요. 어떤 상황이었는지 알려주시면 확인할게요.</p>
      </div>
      <form className="not-found-feedback-form" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="not-found-feedback-message">
          404 피드백
        </label>
        <textarea
          aria-describedby={describedBy}
          disabled={isSubmitting}
          id="not-found-feedback-message"
          maxLength={MAX_FEEDBACK_LENGTH}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="어떤 버튼이나 링크를 눌렀는지 알려 주세요."
          rows={3}
          value={message}
        />
        <div className="not-found-feedback-meta">
          <p id={helperId}>개인정보는 적지 말아 주세요. 현재 주소와 브라우저 정보는 함께 전달돼요.</p>
          <span>{message.length}/{MAX_FEEDBACK_LENGTH}</span>
        </div>
        {statusMessage ? (
          <p
            aria-live="polite"
            className={`not-found-feedback-status not-found-feedback-status-${status}`}
            id={statusId}
          >
            {statusMessage}
          </p>
        ) : null}
        <button
          className="web-button web-button-primary not-found-feedback-submit"
          disabled={isSubmitting || !trimmedMessage}
          type="submit"
        >
          {isSubmitting ? "보내는 중" : "피드백 보내기"}
        </button>
      </form>
    </section>
  );
}
