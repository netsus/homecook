import { expect, test } from "@playwright/test";
import { captureTrackedEvidenceOnDemand, writeTrackedEvidenceOnDemand } from "./helpers/evidence-capture";

test.describe("@evidence-capture homeflow local linear preview", () => {
  test.skip(process.env.MUMEOK_ROUND2_LOCAL_PREVIEW !== "true", "Requires the explicitly enabled loopback preview server; never submits real participation.");
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 812 }, { width: 320, height: 720 }, { width: 320, height: 568 }]) {
    test(`completes the isolated mobile experience at ${viewport.width}x${viewport.height}`, async ({ page, baseURL }) => {
      test.setTimeout(60_000);
      expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
      await page.setViewportSize(viewport);
      const posts: string[] = [];
      const measurements: Array<Record<string, unknown>> = [];
      page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
      await page.goto("/beta/r2/homeflow");
      await expect(page.getByRole("note")).toHaveText("로컬 미리보기 · 저장되지 않아요");
      async function capture(name: string) {
        if (["02-plan", "06-meal-log"].includes(name)) await expect(page.locator('[data-entry-phase="waiting"], [data-entry-phase="entering"]')).toHaveCount(0);
        measurements.push({screen:name, ...await page.evaluate(() => ({scrollHeight:document.documentElement.scrollHeight, innerHeight:window.innerHeight, scrollWidth:document.documentElement.scrollWidth, innerWidth:window.innerWidth}))});
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await captureTrackedEvidenceOnDemand(page, { path: `.omx/artifacts/homeflow-linear/entry/${viewport.width}x${viewport.height}-${name}.png`, fullPage: true, animations: "disabled" });
        if (viewport.height >= 720 && /^0[1-6]-/.test(name)) { expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1), name).toBe(true); }
      }
      const heroArt = page.getByRole("img", {name:"스마트폰을 들고 오른쪽 테스트 안내를 가리키는 광고 속 무먹 캐릭터"});
      await expect(heroArt.locator("..")).toHaveAttribute("data-art-ready", "true");
      if (viewport.width === 390) {
        await expect.poll(() => heroArt.evaluate(element => element.getAnimations().length)).toBeGreaterThan(0);
        await page.emulateMedia({reducedMotion:"reduce"});
        await expect(heroArt).toHaveCSS("animation-name", "none");
        await expect(heroArt.locator("..").locator("li").first()).toHaveCSS("opacity", "1");
        await page.emulateMedia({reducedMotion:"no-preference"});
      }
      await capture("hero");
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
      await page.getByRole("button", { name: "4문항 테스트하기" }).click();
      for (const [index, option] of ["3~4일", "2~3회", "계획 없이 그때그때 정함", "집에 있는 재료 빼고 장보기 목록 만들기"].entries()) {
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.getByRole("button", { name: option, exact: true })).toBeVisible();
        await capture(`quiz-${index + 1}`);
        await page.getByRole("button", { name: option, exact: true }).click();
      }
      await expect(page.getByRole("heading", { name: "오늘의 감각형" })).toBeVisible();
      await capture("result");
      await page.getByRole("button", { name: "무먹 체험하러 가기" }).click();
      await expect(page.getByRole("heading", { name: "유튜브에서 레시피를 가져왔어요" })).toBeVisible();
      await capture("01-recipe");
      await page.getByRole("button", { name: "외 4가지 재료" }).click();
      await expect(page.getByText("계란후라이", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "재료 접기" }).click();
      await page.getByRole("button", { name: "요리 계획에 추가하기" }).click();
      await expect(page.getByRole("heading", { name: "요리계획" })).toBeVisible();
      await expect(page.getByText("두부조림", { exact: true })).toBeVisible();
      const plannedEntry = page.locator('[data-entry-phase]').filter({has: page.getByRole("img", {name:"김치볶음밥", exact:true})});
      if (viewport.width === 390) {
        await expect(plannedEntry).toHaveAttribute("data-entry-phase", "waiting");
        await captureTrackedEvidenceOnDemand(page, {path:`.omx/artifacts/homeflow-linear/entry/${viewport.width}x${viewport.height}-02-plan-waiting.png`, fullPage:true, animations:"allow"});
        await page.emulateMedia({reducedMotion:"reduce"});
        await expect(plannedEntry.getByRole("img")).toHaveCSS("opacity", "1");
        await page.emulateMedia({reducedMotion:"no-preference"});
      }
      await expect(plannedEntry).toHaveAttribute("data-entry-phase", "entering");
      await captureTrackedEvidenceOnDemand(page, {path:`.omx/artifacts/homeflow-linear/entry/${viewport.width}x${viewport.height}-02-plan-entering.png`, fullPage:true, animations:"allow"});
      await capture("02-plan");
      await page.getByRole("button", { name: "토요일 저녁 요리 추가" }).click();
      await expect(page.getByRole("dialog")).toContainText("이번 체험은 준비된 김치볶음밥으로 이어져요.");
      await page.getByRole("button", { name: "체험 계속하기" }).click();
      await page.getByRole("button", { name: "장보기 목록 만들기" }).click();
      await expect(page.getByRole("heading", { name: "장보기 목록" })).toHaveCount(1);
      await expect(page.getByRole("checkbox")).toHaveCount(6);
      await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(5);
      await expect(page.getByRole("checkbox", {name:"계란 구매"})).not.toBeChecked();
      await capture("03-shopping");
      await page.getByRole("checkbox", { name: "삼겹살 구매" }).check();
      await page.getByRole("button", { name: "삼겹살 집에 있어요" }).click();
      await expect(page.getByRole("checkbox", { name: "삼겹살 구매" })).toHaveCount(0);
      await page.getByRole("button", { name: "삼겹살 구매 목록으로 이동" }).click();
      await expect(page.getByRole("checkbox", { name: "삼겹살 구매" })).not.toBeChecked();
      for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
      await page.getByRole("button", { name: "체크하고 장보기 완료하기" }).click();
      await expect(page.getByRole("status")).toContainText("구매한 재료를 팬트리에 추가했어요");
      await expect(page.getByText("토요일 · 9/12", {exact: true})).toBeVisible();
      if (viewport.width === 390) {
        const readyMeal = page.locator('[data-entry-phase]').filter({has: page.getByRole("img", {name:"김치볶음밥", exact:true})});
        const cookButton = page.getByRole("button", {name:"김치볶음밥 요리하기", exact:true});
        await expect(page.getByRole("status")).not.toBeVisible();
        await expect.poll(() => readyMeal.evaluate(element => element.getAnimations().some(animation => {
          const progress = animation.effect?.getComputedTiming().progress;
          return typeof progress === "number" && progress > .05;
        }))).toBe(true);
        await expect.poll(() => cookButton.evaluate(element => element.getAnimations().some(animation => {
          const progress = animation.effect?.getComputedTiming().progress;
          return typeof progress === "number" && progress > .3;
        }))).toBe(true);
        await captureTrackedEvidenceOnDemand(page, {path:".omx/artifacts/homeflow-linear/cooking-ready/390-emphasis.png", fullPage:true, animations:"allow"});
        await page.emulateMedia({reducedMotion:"reduce"});
        await expect(readyMeal).toHaveCSS("animation-name", "none");
        await expect(cookButton).toHaveCSS("animation-name", "none");
        await page.emulateMedia({reducedMotion:"no-preference"});
      }
      await capture("04-pantry");
      await page.getByRole("button", { name: "이전 화면" }).click();
      await expect(page.getByRole("checkbox", { name: "삼겹살 구매" })).toBeDisabled();
      await page.getByRole("button", { name: "팬트리 확인하기" }).click();
      await page.getByRole("button", { name: "김치볶음밥 요리하기", exact: true }).click();
      await expect(page.getByRole("heading", { name: "김치볶음밥", exact: true })).toBeVisible();
      await expect(page.getByRole("img")).toHaveCount(1);
      await capture("05-cooking");
      await page.getByRole("button", { name: "요리완료! 식단기록하기" }).click();
      await expect(page.getByRole("heading", { name: "이번주 식단" })).toBeVisible();
      await expect(page.getByText("250g · 420 kcal", { exact: true })).toBeVisible();
      await expect(page.getByText("400g · 700 kcal", { exact: true })).toBeVisible();
      await expect(page.getByText("300g · 608 kcal", { exact: true })).toBeVisible();
      await expect(page.getByText("영양정보 · 체험 예시", { exact: true })).toBeVisible();
      await expect(page.getByText(/남은 음식|절반 보관|6 \/ 5/)).toHaveCount(0);
      const recordEntry = page.locator('[data-entry-phase]').filter({has: page.getByRole("img", {name:"김치볶음밥", exact:true})});
      await expect(recordEntry).toHaveAttribute("data-entry-phase", "entering");
      await captureTrackedEvidenceOnDemand(page, {path:`.omx/artifacts/homeflow-linear/entry/${viewport.width}x${viewport.height}-06-meal-entering.png`, fullPage:true, animations:"allow"});
      if (viewport.width === 390) {
        const nutritionValue = page.getByLabel("칼로리 1,728 kcal", {exact:true}).locator("b");
        await expect.poll(async () => Number((await nutritionValue.innerText()).replace(",", ""))).toBeGreaterThan(1120);
        expect(Number((await nutritionValue.innerText()).replace(",", ""))).toBeLessThan(1728);
        const scale = await recordEntry.getByRole("img").evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a);
        expect(scale).toBeGreaterThan(.35);
        expect(scale).toBeLessThan(1);
      }
      await expect(page.getByText("1,728", {exact:true})).toBeVisible();
      for (const value of ["202", "97", "70"]) await expect(page.getByText(value, {exact:true})).toBeVisible();
      if (viewport.width === 390) {
        await page.emulateMedia({reducedMotion:"reduce"});
        await expect(page.locator('[data-counting]')).toHaveAttribute("data-counting", "false");
        await expect(recordEntry.getByRole("img")).toHaveCSS("animation-name", "none");
        await page.emulateMedia({reducedMotion:"no-preference"});
      }
      await capture("06-meal-log");
      const calorieCard = page.getByText("칼로리", {exact:true}).locator("..");
      const calorieBox = await calorieCard.boundingBox();
      const calorieValue = await calorieCard.locator("strong").boundingBox();
      expect(calorieValue!.width).toBeLessThanOrEqual(calorieBox!.width - 2);
      await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
      await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveValue("preview@example.com");
      await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveAttribute("readonly", "");
      await page.getByRole("checkbox").check();
      await capture("beta-form");
      await page.getByRole("button", { name: "베타오픈 신청하기", exact: true }).click();
      await expect(page.getByRole("heading", { name: "신청이 완료됐어요!" })).toBeVisible();
      // Inspect live reduced motion before screenshot suspension restores infinite animations.
      if (viewport.width === 390) {
        await page.emulateMedia({reducedMotion:"reduce"});
        await expect.poll(() => page.locator('[data-homeflow-main]').evaluate(element => element.getAnimations({subtree:true}).filter(animation => animation.playState === "running").length)).toBe(0);
      }
      await capture("done");
      expect(posts).toEqual([]);
      await writeTrackedEvidenceOnDemand(`.omx/artifacts/homeflow-linear/entry/${viewport.width}x${viewport.height}-measurements.json`, JSON.stringify(measurements, null, 2));
    });
  }
});
