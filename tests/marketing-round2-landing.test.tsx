// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Round2Landing } from "@/components/marketing/round2/round2-landing";
vi.mock("@/components/marketing/round2/round2.module.css",()=>({default:{}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("completes an explicit example alone in preview without any persistence requests",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  render(<Round2Landing topic="recording" pageContext="" attribution={{first_channel:"direct",utm_source:null,utm_medium:null,utm_campaign:null,utm_content:null}} preview leadReady turnstileSiteKey=""/>);
  fireEvent.click(screen.getByRole("button",{name:"사용 예시 먼저 보기"}));
  fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));
  fireEvent.click(screen.getByRole("button",{name:"다음 장면"}));
  await screen.findByText("487 kcal");
  await vi.waitFor(()=>expect((screen.getByRole("button",{name:"예시 확인 완료"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button",{name:"예시 확인 완료"}));
  expect(await screen.findByRole("heading",{name:"사용 예시를 확인했어요"})).toBeTruthy();
  expect(screen.getByText("로컬 미리보기 · 저장되지 않아요")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"메뉴로 돌아가기"}));
  expect(screen.getByRole("button",{name:/사용 예시 다시 보기/})).toBeTruthy();
  expect(screen.getByRole("button",{name:"베타 오픈 알림 받기"})).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
