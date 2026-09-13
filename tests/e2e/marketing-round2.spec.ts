import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.skip(process.env.HOMECOOK_ROUND2_PREVIEW_E2E !== "1", "Dedicated R2 non-saving preview server only");
type Topic = "recording" | "homeflow";
type Activity = "example" | "survey" | "lead";
const names = { example: "사용 예시 먼저 보기", survey: "의견만 남기기 · 4문항", lead: "베타 오픈 알림 받기" };
const done = { example: "사용 예시를 확인했어요", survey: "의견을 남겨주셔서 감사해요", lead: "베타 오픈 알림 신청을 접수했어요" };
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 393, height: 852 }, { width: 1280, height: 900 }];

async function ready(page: Page, topic: Topic) {
  const response = await page.goto(`/beta/r2/${topic}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByText("로컬 미리보기 · 저장되지 않아요", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: names.lead, exact: true })).toBeVisible();
  await expect(page.getByText("아직 완료한 활동이 없어요", { exact: true })).toBeVisible();
}
async function open(page: Page, activity: Activity) { await page.getByRole("button", { name: names[activity], exact: true }).first().click(); }
async function submit(page: Page, activity: Activity) {
  if (activity === "example") {
    await page.getByRole("button", { name: "다음 장면", exact: true }).click();
    await page.getByRole("button", { name: "다음 장면", exact: true }).click();
    await page.getByRole("button", { name: "예시 확인 완료", exact: true }).click();
  } else if (activity === "survey") {
    for (let question = 0; question < 4; question++) {
      await page.getByRole("radio").first().check();
      await page.getByRole("button", { name: question === 3 ? "의견 보내기" : "다음 문항", exact: true }).click();
    }
  } else {
    await expect(page.getByRole("textbox", { name: "이메일", exact: true })).toHaveValue("preview@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "베타 오픈 알림 신청하기", exact: true }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: done[activity], exact: true })).toBeVisible();
}
async function menu(page: Page) { await page.getByRole("button", { name: "메뉴로 돌아가기", exact: true }).click(); }
async function checkLayout(page: Page) {
  await expect(page.getByText("로컬 미리보기 · 저장되지 않아요", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const targets = await page.locator("main button, main a, main label:has(input), main input[type=email]").evaluateAll(elements => elements.map(element => ({ label: element.textContent?.trim().slice(0, 50) ?? "email", width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  expect(targets.filter(target => target.width < 44 || target.height < 44)).toEqual([]);
}
async function capture(page: Page, info: TestInfo, name: string) {
  await checkLayout(page);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  await info.attach(`${name}-axe`, { body: JSON.stringify(axe.violations), contentType: "application/json" });
  expect(axe.violations).toEqual([]);
}
function track(page: Page) {
  const evidence = { writes: [] as string[], external: [] as string[], pageErrors: [] as string[], consoleErrors: [] as string[], failedRequests: [] as string[] };
  page.on("request", request => { const url = new URL(request.url()); if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) evidence.external.push(url.origin); if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) evidence.writes.push(`${request.method()} ${url.pathname}`); });
  page.on("pageerror", error => evidence.pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); });
  page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") evidence.failedRequests.push(new URL(request.url()).pathname); });
  return evidence;
}

for (const topic of ["recording", "homeflow"] as const) {
  for (const viewport of viewports) test(`${topic} ${viewport.width}x${viewport.height}: seven states and local form validation evidence`, async ({ page }, info) => {
    await page.setViewportSize(viewport); const network = track(page); await ready(page, topic);
    await capture(page, info, "MENU");
    await open(page, "example"); await capture(page, info, "EXAMPLE"); await submit(page, "example"); await capture(page, info, "EXAMPLE_DONE"); await menu(page);
    await open(page, "survey"); await capture(page, info, "SURVEY"); await submit(page, "survey"); await capture(page, info, "SURVEY_DONE"); await menu(page);
    await open(page, "lead"); await capture(page, info, "LEAD");
    await page.getByRole("button", { name: "베타 오픈 알림 신청하기", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("개인정보 수집·이용에 동의해 주세요.");
    await capture(page, info, "RECOVERY-local-consent-validation-not-server-error");
    await submit(page, "lead"); await capture(page, info, "LEAD_DONE"); await menu(page);
    await expect(page.locator("nav[aria-label='원하는 활동 선택']").getByText("완료", { exact: true })).toHaveCount(3);
    expect(network).toEqual({ writes: [], external: [], pageErrors: [], consoleErrors: [], failedRequests: [] });
    expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, idb: (await indexedDB.databases()).map(db => db.name) }))).toEqual({ local: 0, session: 0, idb: [] });
    await info.attach("network-and-runtime", { body: JSON.stringify(network), contentType: "application/json" });
  });
  for (const activity of ["example", "survey", "lead"] as const) test(`${topic}: ${activity} independently completes without prerequisites`, async ({ page }) => {
    await ready(page, topic); await open(page, activity); await submit(page, activity); await menu(page);
    await expect(page.locator("nav[aria-label='원하는 활동 선택']").getByText("완료", { exact: true })).toHaveCount(1);
    for (const other of ["example", "survey", "lead"] as const) if (other !== activity) await expect(page.getByRole("button", { name: names[other], exact: true })).toBeVisible();
  });
  const orders: Activity[][] = [["example", "survey", "lead"], ["example", "lead", "survey"], ["survey", "example", "lead"], ["survey", "lead", "example"], ["lead", "example", "survey"], ["lead", "survey", "example"]];
  for (const order of orders) test(`${topic}: free order ${order.join("-")}`, async ({ page }) => {
    await ready(page, topic);
    for (const activity of order) { await open(page, activity); await submit(page, activity); await menu(page); }
    await expect(page.locator("nav[aria-label='원하는 활동 선택']").getByText("완료", { exact: true })).toHaveCount(3);
  });
  test(`${topic}: keyboard, reduced motion and actual 200 percent text remain usable`, async ({ page }, info) => {
    await page.setViewportSize(viewports[0]); await page.emulateMedia({ reducedMotion: "reduce" }); await ready(page, topic);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: names.lead, exact: true })).toBeFocused();
    expect(await page.locator(":focus").evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter"); await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    const before = await page.getByRole("heading", { level: 1 }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.getByRole("heading", { level: 1 }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(before * 2);
    await capture(page, info, "LEAD-actual-200-percent-320px");
    await submit(page, "lead"); await capture(page, info, "LEAD_DONE-actual-200-percent-320px");
    await menu(page); await expect(page.getByRole("button", { name: /알림 접수 확인/ })).toBeFocused();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  });
  test(`${topic}: browser Back and Forward preserve independent activity navigation`, async ({ page }) => {
    await ready(page, topic);
    await open(page, "example");
    await page.getByRole("button", {name:"다음 장면",exact:true}).click();
    await open(page, "lead");
    await page.goBack();
    await expect(page.getByText("사용 예시 2/3",{exact:true})).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("textbox",{name:"이메일",exact:true})).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
  });
  for (const width of [320, 390]) for (const completed of [false, true]) {
    test(`R2-AP-001 ${topic} ${width} ${completed ? "completed" : "initial"} MENU keeps 200 percent text inside its strip`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await ready(page, topic);
      if (completed) {
        for (const activity of ["example", "survey", "lead"] as const) {
          await open(page, activity); await submit(page, activity); await menu(page);
        }
      }
      const text = page.getByText(topic === "recording" ? "내 레시피 → 먹은 분량 추정 영양 기록" : "요리 계획 → 장보기 → 남은 요리", { exact: true });
      const measure = () => text.evaluate(element => {
        const strip = element.parentElement!.getBoundingClientRect();
        const span = element.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(element);
        const glyphs = range.getBoundingClientRect();
        return {
          strip: { top: strip.top, bottom: strip.bottom, height: strip.height },
          text: { top: span.top, bottom: span.bottom, height: span.height },
          fontSize: parseFloat(getComputedStyle(element).fontSize),
          clipTop: Math.max(0, strip.top - Math.min(span.top, glyphs.top)),
          clipBottom: Math.max(0, Math.max(span.bottom, glyphs.bottom) - strip.bottom),
        };
      });
      const normal = await measure();
      expect(normal.strip.height).toBe(72);
      expect(normal.clipTop).toBe(0); expect(normal.clipBottom).toBe(0);
      await page.screenshot({ path: info.outputPath("MENU-100percent.png"), fullPage: true });
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const enlarged = await measure();
      await info.attach("strip-geometry", { body: JSON.stringify({ topic, width, completed, normal, enlarged }), contentType: "application/json" });
      await page.screenshot({ path: info.outputPath("MENU-200percent.png"), fullPage: true });
      expect(enlarged.fontSize).toBe(normal.fontSize * 2);
      expect.soft(enlarged.clipTop).toBe(0); expect.soft(enlarged.clipBottom).toBe(0);
      expect.soft(enlarged.strip.height).toBeGreaterThanOrEqual(enlarged.text.height);
      await checkLayout(page);
    });
  }
}

test("SSR menu, canonical slash, encoded aliases and privacy headers", async ({ request }) => {
  const response = await request.get("/beta/r2/recording");
  expect(response.status()).toBe(200); expect(await response.text()).toContain("베타 오픈 알림 받기");
  // Next dev unconditionally writes this header in base-server.js; production private is asserted explicitly.
  if (process.env.HOMECOOK_ROUND2_SERVER_KIND === "production") expect(response.headers()["cache-control"]).toContain("private");
  else expect(response.headers()["cache-control"]).toBe("no-store, must-revalidate");
  expect(response.headers()["cache-control"]).toContain("no-store"); expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  const canonical = await request.get("/beta/r2/recording/", { maxRedirects: 0 }); expect(canonical.status()).toBe(308); expect(canonical.headers().location).toMatch(/\/beta\/r2\/recording$/);
  for (const path of ["/beta/r2/unknown", "/beta/r2/%72ecording", "/beta/%72%32/recording"]) expect((await request.get(path)).status()).toBe(404);
});
