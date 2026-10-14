// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeightImprovementParticipationProvider } from "@/components/weight-improvement/participation-provider";
import { WeightImprovementParticipationSetting } from "@/components/weight-improvement/participation-setting";
import { fetchWeightImprovementParticipation, mutateWeightImprovementParticipation } from "@/lib/api/weight-improvement-participation";
import { useAuthGateStore } from "@/stores/ui-store";
import { readPendingAction, savePendingAction } from "@/lib/auth/pending-action";
import type { WeightImprovementMutation, WeightImprovementParticipation } from "@/types/weight-improvement-participation";
import { PARTICIPATION_DOCUMENT, PARTICIPATION_OTHER_OWNER, participationStatus } from "./fixtures/weight-improvement-participation";
const locationState = vi.hoisted(() => ({ path: "/settings" }));
vi.mock("next/navigation", () => ({ usePathname: () => locationState.path }));
vi.mock("@/lib/api/weight-improvement-participation", async (original) => ({
  ...await original<typeof import("@/lib/api/weight-improvement-participation")>(), fetchWeightImprovementParticipation: vi.fn(), mutateWeightImprovementParticipation: vi.fn(),
}));
let current: WeightImprovementParticipation;
function mobile(enabled: boolean, standalone = false) {
  Object.defineProperty(navigator,"maxTouchPoints",{configurable:true,value:enabled?1:0});
  Object.defineProperty(window,"matchMedia",{configurable:true,value:vi.fn((query:string)=>({matches:(query==="(pointer: coarse)"||query==="(max-width: 1023px)")?enabled:query==="(display-mode: standalone)"&&standalone,addEventListener:vi.fn(),removeEventListener:vi.fn()}))});
}
function acceptMutation(input: WeightImprovementMutation) {
  if (input.action === "notice_seen") current={...current,revision:current.revision+1,notice_seen_at:"2026-10-13T02:00:00Z",notice_version_seen:PARTICIPATION_DOCUMENT.notice_version};
  if (input.action === "decline") current={...current,revision:current.revision+1,decision:"declined",notice_seen_at:"2026-10-13T02:00:00Z"};
  if (input.action === "opt_in") current={...current,revision:current.revision+1,decision:"opted_in",opted_in_at:"2026-10-13T02:00:00Z",
    consent_document_version:input.document_version,consent_document_hash:input.document_hash};
  if (input.action === "withdraw") current={...current,revision:current.revision+1,decision:"withdrawn",withdrawn_at:"2026-10-13T03:00:00Z",cleanup_status:"pending"};
  return structuredClone(current);
}
function view(onPersonalAction=vi.fn()) {
  return render(<WeightImprovementParticipationProvider><button onClick={onPersonalAction}>개인 실측 저장</button>
    <WeightImprovementParticipationSetting surface="settings_desktop" /></WeightImprovementParticipationProvider>);
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES","1");
  vi.clearAllMocks(); localStorage.clear();sessionStorage.clear(); mobile(false); locationState.path="/settings";
  useAuthGateStore.setState({isOpen:false,action:null});
  current=participationStatus();
  vi.mocked(fetchWeightImprovementParticipation).mockImplementation(async()=>structuredClone(current));
  vi.mocked(mutateWeightImprovementParticipation).mockImplementation(async(input)=>acceptMutation(input));
});
afterEach(()=>{cleanup();vi.unstubAllEnvs();});

describe("weight participation independent optional UI",()=>{
  it("stays completely dark in production preparation and keeps personal actions available",async()=>{
    vi.stubEnv("NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES","0");
    const personal=vi.fn();view(personal);await userEvent.click(screen.getByRole("button",{name:"개인 실측 저장"}));
    expect(personal).toHaveBeenCalledOnce();expect(fetchWeightImprovementParticipation).not.toHaveBeenCalled();
    expect(screen.queryByRole("switch")).toBeNull();expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not publish a null/OFF policy even in QA preview",async()=>{
    current=participationStatus({participation_enabled:false,document:null});mobile(true);locationState.path="/";view();
    await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();expect(screen.queryByText(/선별 자료 보유기간/)).toBeNull();
    expect(mutateWeightImprovementParticipation).not.toHaveBeenCalled();
  });
  it("does not auto-open on desktop, and opening settings never implies consent",async()=>{
    locationState.path="/";const user=userEvent.setup();view();
    const toggle=await screen.findByRole("switch",{name:"무게 추정 개선 참여"});expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(toggle);
    const dialog=await screen.findByRole("dialog",{name:"추정 개선 참여 (선택)"});
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    expect(within(dialog).getByRole<HTMLButtonElement>("button",{name:"동의하고 참여"}).disabled).toBe(true);
    await waitFor(()=>expect(mutateWeightImprovementParticipation).toHaveBeenCalledWith(expect.objectContaining({action:"notice_seen"}),expect.any(String)));
    expect(vi.mocked(mutateWeightImprovementParticipation).mock.calls.some(([input])=>input.action==="opt_in")).toBe(false);
  });
  it("shows mobile notice once, closes without consent and never repeats after reinstall-like local-state loss",async()=>{
    mobile(true);locationState.path="/";const user=userEvent.setup();const first=view();
    const dialog=await screen.findByRole("dialog",{name:"추정 개선 참여 (선택)"});
    await user.click(within(dialog).getByRole("button",{name:"닫기"}));
    await waitFor(()=>expect(current.notice_seen_at).not.toBeNull());
    expect(current.decision).toBe("unanswered");first.unmount();sessionStorage.clear();localStorage.clear();view();
    await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();expect(current.decision).toBe("unanswered");
  });
  it("records mobile PWA as a display surface while desktop PWA still never auto-prompts",async()=>{
    mobile(true,true);locationState.path="/";const first=view();await screen.findByRole("dialog");
    await waitFor(()=>expect(mutateWeightImprovementParticipation).toHaveBeenCalledWith(expect.objectContaining({action:"notice_seen",surface:"mobile_pwa"}),expect.any(String)));
    first.unmount();current=participationStatus();sessionStorage.clear();mobile(false,true);view();
    await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledTimes(2));expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("continues after decline without blocking the personal feature",async()=>{
    mobile(true);locationState.path="/";const user=userEvent.setup();const personal=vi.fn();view(personal);
    const dialog=await screen.findByRole("dialog");await user.click(within(dialog).getByRole("button",{name:"참여 안 함"}));
    await waitFor(()=>expect(current.decision).toBe("declined"));
    await user.click(screen.getByRole("button",{name:"개인 실측 저장"}));expect(personal).toHaveBeenCalledOnce();
    fireEvent(window,new Event("focus"));await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("suppresses failed notice recording in the same session and retries on foreground without pretending consent",async()=>{
    mobile(true);locationState.path="/";const user=userEvent.setup();
    vi.mocked(mutateWeightImprovementParticipation).mockRejectedValueOnce(new Error("offline"));view();
    const dialog=await screen.findByRole("dialog");await waitFor(()=>expect(within(dialog).getByRole("alert")).toBeTruthy());
    await user.click(within(dialog).getByRole("button",{name:"닫기"}));expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent(window,new Event("focus"));await waitFor(()=>expect(current.notice_seen_at).not.toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();expect(current.decision).toBe("unanswered");
    const calls=vi.mocked(mutateWeightImprovementParticipation).mock.calls;expect(calls[1][1]).toBe(calls[0][1]);
  });
  it("defers automatic notice during return actions, existing dialogs and auth gate",async()=>{
    mobile(true);locationState.path="/cooking/sessions/session/cook-mode";view();
    await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledOnce());expect(screen.queryByRole("dialog")).toBeNull();cleanup();
    locationState.path="/";useAuthGateStore.setState({isOpen:true});view();
    await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledTimes(2));expect(screen.queryByRole("dialog")).toBeNull();cleanup();
    useAuthGateStore.setState({isOpen:false});
    render(<WeightImprovementParticipationProvider><div role="dialog" aria-label="진행 중인 작업">진행 중</div></WeightImprovementParticipationProvider>);
    await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledTimes(3));expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(mutateWeightImprovementParticipation).not.toHaveBeenCalled();
  });
  it("leaves a real pending planner return action and servings untouched",async()=>{
    mobile(true);locationState.path="/";
    savePendingAction({type:"planner",recipeId:"550e8400-e29b-41d4-a716-446655440091",redirectTo:"/recipe/550e8400-e29b-41d4-a716-446655440091",createdAt:Date.now(),plannedServings:3});
    const pending=readPendingAction();view();await waitFor(()=>expect(fetchWeightImprovementParticipation).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();expect(mutateWeightImprovementParticipation).not.toHaveBeenCalled();expect(readPendingAction()).toEqual(pending);
  });
  it("keeps OFF while explicit opt-in is pending, then uses only the successful server state",async()=>{
    const user=userEvent.setup();let resolveOn!:(value:WeightImprovementParticipation)=>void;
    vi.mocked(mutateWeightImprovementParticipation).mockImplementation((input)=>input.action==="opt_in"?new Promise((resolve)=>{resolveOn=resolve;}):Promise.resolve(acceptMutation(input)));
    view();const toggle=await screen.findByRole("switch");await user.click(toggle);
    await user.click(screen.getByRole("checkbox"));await user.click(screen.getByRole("button",{name:"동의하고 참여"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"선택 저장 중…"})).toBeTruthy());expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async()=>resolveOn(participationStatus({decision:"opted_in",revision:2,notice_seen_at:"2026-10-13T02:00:00Z",opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:PARTICIPATION_DOCUMENT.version,consent_document_hash:PARTICIPATION_DOCUMENT.hash})));
    await waitFor(()=>expect(toggle.getAttribute("aria-checked")).toBe("true"));expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("rejects stale ON, refreshes withdrawn state, clears the checkbox and focuses the error",async()=>{
    const user=userEvent.setup();view();const toggle=await screen.findByRole("switch");await user.click(toggle);
    vi.mocked(mutateWeightImprovementParticipation).mockImplementation(async(input)=>{
      if(input.action!=="opt_in")return acceptMutation(input);
      current=participationStatus({decision:"withdrawn",revision:4,notice_seen_at:"2026-10-13T02:00:00Z",cleanup_status:"pending"});
      throw Object.assign(new Error("다른 화면에서 선택이 바뀌었어요."),{code:"PARTICIPATION_REVISION_CONFLICT",status:409});
    });
    await user.click(screen.getByRole("checkbox"));await user.click(screen.getByRole("button",{name:"동의하고 참여"}));
    const dialog=screen.getByRole("dialog");await waitFor(()=>expect(within(dialog).getByRole("alert").textContent).toContain("다른 화면"));
    expect(within(dialog).getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    expect(document.activeElement).toBe(within(dialog).getByRole("alert"));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
  it("preserves ON after failed withdrawal and shows pending cleanup only after server success",async()=>{
    current=participationStatus({decision:"opted_in",revision:1,notice_seen_at:"2026-10-13T02:00:00Z",opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:PARTICIPATION_DOCUMENT.version,consent_document_hash:PARTICIPATION_DOCUMENT.hash});
    const user=userEvent.setup();view();const toggle=await screen.findByRole("switch");await user.click(toggle);
    vi.mocked(mutateWeightImprovementParticipation).mockRejectedValueOnce(new Error("offline"));await user.click(screen.getByRole("button",{name:"참여 철회"}));
    await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);await user.click(screen.getByRole("button",{name:"참여 철회"}));
    await waitFor(()=>expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByText(/개선용 자료 정리 상태는 아직 확인 중/)).toBeTruthy();expect(screen.queryByText(/정리 완료/)).toBeNull();
  });
  it("refreshes foreground choice changed on another device without resetting personal data",async()=>{
    const personal=vi.fn();view(personal);await screen.findByRole("switch");
    current=participationStatus({decision:"withdrawn",revision:5,cleanup_status:"pending",notice_seen_at:"2026-10-13T02:00:00Z",withdrawn_at:"2026-10-13T03:00:00Z"});
    fireEvent(window,new Event("focus"));await screen.findByText("철회됨");expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    await userEvent.click(screen.getByRole("button",{name:"개인 실측 저장"}));expect(personal).toHaveBeenCalledOnce();
  });
  it("does not reuse an old document consent for a new version and requires a fresh unchecked choice",async()=>{
    current=participationStatus({decision:"opted_in",opted_in_at:"2026-10-13T02:00:00Z",consent_document_version:"old-document",consent_document_hash:"b".repeat(64)});
    const user=userEvent.setup();view();const toggle=await screen.findByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");expect(screen.getByText("새 설명 확인 필요")).toBeTruthy();
    await user.click(toggle);expect(screen.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    await user.click(screen.getByRole("checkbox"));await user.click(screen.getByRole("button",{name:"동의하고 참여"}));
    await waitFor(()=>expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(vi.mocked(mutateWeightImprovementParticipation).mock.calls.find(([input])=>input.action==="opt_in")?.[0]).toMatchObject({document_version:PARTICIPATION_DOCUMENT.version,document_hash:PARTICIPATION_DOCUMENT.hash});
  });
  it("ignores a delayed foreground read after successful opt-in and releases the loading lock",async()=>{
    const user=userEvent.setup();view();await screen.findByRole("switch");
    let resolveRead!:(value:WeightImprovementParticipation)=>void;
    vi.mocked(fetchWeightImprovementParticipation).mockImplementationOnce(()=>new Promise((resolve)=>{resolveRead=resolve;}));
    fireEvent(window,new Event("focus"));await user.click(screen.getByRole("button",{name:"참여 설명 보기"}));
    await user.click(screen.getByRole("checkbox"));await user.click(screen.getByRole("button",{name:"동의하고 참여"}));
    await waitFor(()=>expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"));
    await act(async()=>resolveRead(participationStatus()));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");expect(screen.getByRole<HTMLButtonElement>("switch").disabled).toBe(false);
  });
  it("closes the old account consent and ignores its delayed ON response after account/generation change",async()=>{
    const user=userEvent.setup();let resolveOn!:(value:WeightImprovementParticipation)=>void;
    vi.mocked(mutateWeightImprovementParticipation).mockImplementation((input)=>input.action==="opt_in"?new Promise((resolve)=>{resolveOn=resolve;}):Promise.resolve(acceptMutation(input)));
    view();await user.click(await screen.findByRole("switch"));await user.click(screen.getByRole("checkbox"));await user.click(screen.getByRole("button",{name:"동의하고 참여"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"선택 저장 중…"})).toBeTruthy());
    current=participationStatus({subject:{owner_uuid:PARTICIPATION_OTHER_OWNER,account_generation:4}});
    fireEvent(window,new Event("focus"));await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
    await act(async()=>resolveOn(participationStatus({decision:"opted_in",revision:2,opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:PARTICIPATION_DOCUMENT.version,consent_document_hash:PARTICIPATION_DOCUMENT.hash})));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });
  it.each([
    { participation_enabled:false,document:null },
    { participation_enabled:false,document:PARTICIPATION_DOCUMENT },
    { participation_enabled:true,document:null },
  ])("keeps existing consent withdrawable when new participation is unavailable: %j",async(policy)=>{
    current=participationStatus({decision:"opted_in",revision:3,notice_seen_at:"2026-10-13T02:00:00Z",opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:PARTICIPATION_DOCUMENT.version,consent_document_hash:PARTICIPATION_DOCUMENT.hash,...policy});
    const user=userEvent.setup();view();
    await user.click(await screen.findByRole("button",{name:"기존 참여 철회"}));
    await user.click(screen.getByRole("button",{name:/^참여 철회$/}));
    await screen.findByText("철회됨");
    expect(mutateWeightImprovementParticipation).toHaveBeenCalledWith({action:"withdraw",expected_subject:participationStatus().subject,expected_revision:3,surface:"settings_desktop"},expect.any(String));
    expect(screen.getByText(/개선용 자료 정리 상태는 아직 확인 중/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();expect(screen.queryByText(/정리 완료/)).toBeNull();
    expect(vi.mocked(mutateWeightImprovementParticipation).mock.calls.some(([input])=>input.action==="opt_in")).toBe(false);
  });
  it("allows withdrawal of an older document without consenting to its replacement",async()=>{
    current=participationStatus({decision:"opted_in",revision:3,notice_seen_at:"2026-10-13T02:00:00Z",opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:"old-document",consent_document_hash:"b".repeat(64)});
    const user=userEvent.setup();view();
    await user.click(await screen.findByRole("button",{name:"기존 참여 철회"}));
    await user.click(screen.getByRole("button",{name:/^참여 철회$/}));
    await screen.findByText("철회됨");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(mutateWeightImprovementParticipation).mock.calls.map(([input])=>input.action)).toEqual(["withdraw"]);
  });
  it("clears invalidated subject state after mutation 401 without claiming successful withdrawal",async()=>{
    current=participationStatus({decision:"opted_in",revision:3,notice_seen_at:"2026-10-13T02:00:00Z",opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:PARTICIPATION_DOCUMENT.version,consent_document_hash:PARTICIPATION_DOCUMENT.hash});
    const user=userEvent.setup();view();await user.click(await screen.findByRole("switch"));
    vi.mocked(mutateWeightImprovementParticipation).mockRejectedValueOnce(Object.assign(new Error("다시 로그인한 뒤 참여 상태를 확인해 주세요."),{status:401,code:"UNAUTHORIZED"}));
    await user.click(screen.getByRole("button",{name:/^참여 철회$/}));
    await screen.findByRole("alert");
    expect(screen.queryByRole("switch")).toBeNull();expect(screen.queryByText(/참여 선택:/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();expect(screen.queryByText("철회됨")).toBeNull();
    expect(current.decision).toBe("opted_in");
    await user.click(screen.getByRole("button",{name:"참여 정보 다시 확인"}));
    expect((await screen.findByRole("switch")).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("switch"));await user.click(screen.getByRole("button",{name:/^참여 철회$/}));
    await screen.findByText("철회됨");
    const calls=vi.mocked(mutateWeightImprovementParticipation).mock.calls;expect(calls[1][1]).not.toBe(calls[0][1]);
  });
  it("ignores an older account mutation 401 after another verified subject has loaded",async()=>{
    current=participationStatus({decision:"opted_in",revision:3,notice_seen_at:"2026-10-13T02:00:00Z",opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:PARTICIPATION_DOCUMENT.version,consent_document_hash:PARTICIPATION_DOCUMENT.hash});
    let rejectOld!:(reason:Error)=>void;
    vi.mocked(mutateWeightImprovementParticipation).mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject;}));
    const user=userEvent.setup();view();await user.click(await screen.findByRole("switch"));await user.click(screen.getByRole("button",{name:/^참여 철회$/}));
    current=participationStatus({subject:{owner_uuid:PARTICIPATION_OTHER_OWNER,account_generation:4}});
    fireEvent(window,new Event("focus"));await waitFor(()=>expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"));
    await act(async()=>rejectOld(Object.assign(new Error("이전 계정 인증 만료"),{status:401,code:"UNAUTHORIZED"})));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("이전 계정 인증 만료")).toBeNull();
  });
  it("discards a withdrawal confirmation when the verified subject changes",async()=>{
    const original=participationStatus({decision:"opted_in",revision:3,notice_seen_at:"2026-10-13T02:00:00Z",opted_in_at:"2026-10-13T02:00:00Z",
      consent_document_version:PARTICIPATION_DOCUMENT.version,consent_document_hash:PARTICIPATION_DOCUMENT.hash});
    current=original;const user=userEvent.setup();view();await user.click(await screen.findByRole("switch"));
    expect(screen.getByRole("button",{name:/^참여 철회$/})).toBeTruthy();
    current=participationStatus({subject:{owner_uuid:PARTICIPATION_OTHER_OWNER,account_generation:4}});
    fireEvent(window,new Event("focus"));await waitFor(()=>expect(screen.queryByRole("button",{name:/^참여 철회$/})).toBeNull());
    current=original;fireEvent(window,new Event("focus"));
    await waitFor(()=>expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"));
    expect(screen.queryByRole("button",{name:/^참여 철회$/})).toBeNull();expect(mutateWeightImprovementParticipation).not.toHaveBeenCalled();
  });
  it("does not rebind consent waiting for notice acknowledgement to a newly loaded account",async()=>{
    let resolveSeen!:(value:WeightImprovementParticipation)=>void;
    vi.mocked(mutateWeightImprovementParticipation).mockImplementationOnce(()=>new Promise((resolve)=>{resolveSeen=resolve;}));
    const user=userEvent.setup();view();await user.click(await screen.findByRole("switch"));
    await user.click(screen.getByRole("checkbox"));await user.click(screen.getByRole("button",{name:"동의하고 참여"}));
    current=participationStatus({subject:{owner_uuid:PARTICIPATION_OTHER_OWNER,account_generation:4}});
    fireEvent(window,new Event("focus"));await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
    await act(async()=>resolveSeen(participationStatus({revision:1,notice_seen_at:"2026-10-13T02:00:00Z"})));
    expect(vi.mocked(mutateWeightImprovementParticipation).mock.calls.map(([input])=>input.action)).toEqual(["notice_seen"]);
    expect(vi.mocked(mutateWeightImprovementParticipation).mock.calls[0][0].expected_subject).toEqual(participationStatus().subject);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

});
