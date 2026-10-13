import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { installAccountLibraryVisualRoutes } from "./helpers/mock-routes";
import { PARTICIPATION_DOCUMENT, participationStatus } from "../fixtures/weight-improvement-participation";
import type { WeightImprovementMutation } from "../../types/weight-improvement-participation";

// QA inventory: mobile/PWA one-time notice, desktop auto-popup=0, close/decline;
// explicit unchecked consent, authoritative ON after success, revision conflict;
// foreground cross-device refresh, withdrawal pending/error, accessible focus,
// no login/return-action interception; period/document and collection remain OFF outside fixtures.
const evidence = process.env.HOMECOOK_PARTICIPATION_EVIDENCE_DIR ?? "/tmp/mumeok-c05-participation-evidence";
async function capture(page: Page,name: string) {
  await mkdir(evidence,{recursive:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({path:join(evidence,`${name}.png`),fullPage:false,scale:"css"});
}
async function showSetting(page: Page) {
  const setting = page.getByTestId("weight-participation-setting");
  await setting.scrollIntoViewIfNeeded();
  const topInset = (page.viewportSize()?.width ?? 1440) < 1024 ? 68 : 88;
  const rect = await setting.boundingBox();
  if (rect && rect.y < topInset) await page.mouse.wheel(0, rect.y - topInset);
  await expect.poll(async () => {
    const box = await setting.boundingBox();
    return Boolean(box && box.y >= topInset - 1 && box.y + box.height <= (page.viewportSize()?.height ?? 900));
  }).toBe(true);
}
async function fixture(page: Page,origin: string) {
  const state={current:participationStatus(),mutations:[] as WeightImprovementMutation[],keys:[] as string[],failOn:false,failWithdraw:false,blocked:[] as string[],pageErrors:[] as string[]};
  page.on("pageerror",error=>state.pageErrors.push(error.message));
  await page.context().addCookies([{name:"homecook.e2e-auth-override",value:"authenticated",url:origin,sameSite:"Lax"}]);
  await page.addInitScript(()=>localStorage.setItem("homecook.e2e-auth-override","authenticated"));
  await page.route("**/api/**",route=>route.fulfill({json:{success:true,data:{items:[],themes:[],has_next:false,next_cursor:null,unread_count:0},error:null}}));
  await installAccountLibraryVisualRoutes(page);
  await page.route("**/api/v1/users/me/weight-improvement-participation",async route=>{
    if(route.request().method()==="PATCH") {
      const input=route.request().postDataJSON() as WeightImprovementMutation;
      state.mutations.push(input);state.keys.push(route.request().headers()["idempotency-key"]);
      if(input.action==="opt_in"&&state.failOn) {
        state.current={...state.current,decision:"withdrawn",revision:state.current.revision+2,withdrawn_at:new Date().toISOString(),cleanup_status:"pending"};
        return route.fulfill({status:409,json:{success:false,data:null,error:{code:"PARTICIPATION_REVISION_CONFLICT",message:"다른 화면에서 선택이 바뀌었어요. 최신 상태를 확인해 주세요.",fields:[]}}});
      }
      if(input.action==="withdraw"&&state.failWithdraw)return route.fulfill({status:503,json:{success:false,data:null,error:{code:"INTERNAL_ERROR",message:"철회 선택을 저장하지 못했어요. 다시 시도해 주세요.",fields:[]}}});
      expect(input.expected_revision).toBe(state.current.revision);
      state.current={...state.current,revision:state.current.revision+1};
      if(input.action==="notice_seen")state.current={...state.current,notice_seen_at:new Date().toISOString(),notice_version_seen:PARTICIPATION_DOCUMENT.notice_version};
      if(input.action==="decline")state.current={...state.current,decision:"declined",notice_seen_at:new Date().toISOString()};
      if(input.action==="opt_in")state.current={...state.current,decision:"opted_in",opted_in_at:new Date().toISOString(),consent_document_version:input.document_version,consent_document_hash:input.document_hash};
      if(input.action==="withdraw")state.current={...state.current,decision:"withdrawn",withdrawn_at:new Date().toISOString(),cleanup_status:"pending"};
    }
    await route.fulfill({json:{success:true,data:state.current,error:null}});
  });
  await page.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){state.blocked.push(url.origin);return route.abort();}
    if(url.pathname==="/_next/image"&&url.searchParams.get("url")&&new URL(url.searchParams.get("url")!,origin).origin!==origin)return route.abort();
    if(url.pathname.startsWith("/api/"))return route.fallback();
    return route.continue();
  });
  return state;
}

for(const width of [320,375,1440]) {
  test.describe(`optional participation ${width}px`,()=>{
    test.beforeEach(({},info)=>test.skip(info.project.name!=="desktop-chrome","Exact touch/desktop contexts are set by this spec."));
    async function openPage(browser: Browser,baseURL: string) {
      const context=await browser.newContext({baseURL,viewport:{width,height:width===320?568:width===375?812:900},isMobile:width<1024,hasTouch:width<1024});
      const page=await context.newPage();const state=await fixture(page,new URL(baseURL).origin);return {context,page,state};
    }
    test("mobile notice is one-time; desktop never auto-opens; ordinary settings stay available",async({browser,baseURL})=>{
      const {context,page,state}=await openPage(browser,baseURL!);
      await page.goto("/");
      if(width<1024) {
        const dialog=page.getByRole("dialog",{name:"추정 개선 참여 (선택)"});await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("checkbox")).not.toBeChecked();await expect(dialog.getByRole("button",{name:"동의하고 참여"})).toBeDisabled();
        await expect(dialog.getByRole("button",{name:"닫기"})).toBeFocused();await capture(page,`first-notice-${width}`);
        await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
        await expect.poll(()=>state.current.notice_seen_at).not.toBeNull();expect(state.current.decision).toBe("unanswered");
        await page.reload();await expect(page.getByRole("dialog",{name:"추정 개선 참여 (선택)"})).toHaveCount(0);
      } else { await expect(page.getByRole("dialog",{name:"추정 개선 참여 (선택)"})).toHaveCount(0);expect(state.mutations).toHaveLength(0); }
      await page.goto("/settings");await expect(page.getByRole("switch",{name:"무게 추정 개선 참여"})).toHaveAttribute("aria-checked","false");
      await showSetting(page);
      await capture(page,`settings-off-${width}`);expect(state.blocked).toEqual([]);expect(state.pageErrors).toEqual([]);await context.close();
    });
    test("explicit opt-in uses document/hash/revision and withdrawal error never falsely displays OFF/completed",async({browser,baseURL})=>{
      const {context,page,state}=await openPage(browser,baseURL!);await page.goto("/settings");
      const toggle=page.getByRole("switch",{name:"무게 추정 개선 참여"});await toggle.click();
      const dialog=page.getByRole("dialog",{name:"추정 개선 참여 (선택)"});await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("checkbox")).not.toBeChecked();await capture(page,`settings-consent-${width}`);
      await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"동의하고 참여"}).click();
      await expect(dialog).toHaveCount(0);await expect(toggle).toHaveAttribute("aria-checked","true");
      expect(state.mutations.find(input=>input.action==="opt_in")).toMatchObject({consent_checked:true,document_version:PARTICIPATION_DOCUMENT.version,document_hash:PARTICIPATION_DOCUMENT.hash});
      await showSetting(page);
      await expect(page.getByText(/동의한 설명: fixture-consent-v1/)).toBeVisible();
      expect(state.current.collection_enabled).toBe(false);await capture(page,`settings-on-${width}`);
      state.failWithdraw=true;await toggle.click();await page.getByRole("button",{name:"참여 철회",exact:true}).click();
      const alert=page.getByRole("alert").filter({hasText:"철회 선택을 저장하지 못했어요."});await expect(alert).toBeFocused();await expect(toggle).toHaveAttribute("aria-checked","true");
      await capture(page,`withdraw-failed-${width}`);state.failWithdraw=false;await toggle.click();await page.getByRole("button",{name:"참여 철회",exact:true}).click();
      await expect(toggle).toHaveAttribute("aria-checked","false");await expect(page.getByText(/개선용 자료 정리 상태는 아직 확인 중/)).toBeVisible();
      await showSetting(page);
      await expect(page.getByText(/정리 완료/)).toHaveCount(0);await capture(page,`withdraw-pending-${width}`);
      expect(state.keys.every(key=>/^[0-9a-f-]{36}$/.test(key))).toBe(true);expect(state.blocked).toEqual([]);expect(state.pageErrors).toEqual([]);await context.close();
    });
    test("stale ON is rejected and foreground obtains the other-device choice",async({browser,baseURL})=>{
      const {context,page,state}=await openPage(browser,baseURL!);await page.goto("/settings");
      await page.getByRole("switch",{name:"무게 추정 개선 참여"}).click();state.failOn=true;
      const dialog=page.getByRole("dialog",{name:"추정 개선 참여 (선택)"});await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"동의하고 참여"}).click();
      await expect(dialog.getByRole("alert")).toContainText("다른 화면에서 선택");await expect(dialog.getByRole("alert")).toBeFocused();
      await expect(dialog.getByRole("checkbox")).not.toBeChecked();await expect(dialog.getByRole("button",{name:"동의하고 참여"})).toBeDisabled();
      await capture(page,`stale-on-${width}`);await dialog.getByRole("button",{name:"닫기"}).click();
      await expect(page.getByRole("switch",{name:"무게 추정 개선 참여"})).toHaveAttribute("aria-checked","false");
      state.current=participationStatus({decision:"declined",revision:state.current.revision+1,notice_seen_at:new Date().toISOString()});
      await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByText("미참여",{exact:true})).toBeVisible();
      expect(state.blocked).toEqual([]);expect(state.pageErrors).toEqual([]);await context.close();
    });
  });
}
