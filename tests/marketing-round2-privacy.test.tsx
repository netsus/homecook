import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { MARKETING_VALIDATION_RETENTION_DAYS } from "@/lib/marketing/demand-validation";

test("states the shorter round2 retention without changing the existing campaign period", () => {
  const text = renderToStaticMarkup(<PrivacyPage />).replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
  expect(text).toContain(`${MARKETING_VALIDATION_RETENTION_DAYS}일까지 보관한 뒤 삭제합니다.`);
  expect(text).toContain("2차 수요조사 및 베타 알림 신청 정보는 2026년 11월 30일까지 보관");
  expect(text).toContain("철회를 요청하면 해당 정보를 삭제합니다.");
});
