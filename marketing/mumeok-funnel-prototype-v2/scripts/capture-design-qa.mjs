import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const root = new URL("../evidence/design-qa/final/", import.meta.url);
await mkdir(root, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) consoleErrors.push(message.text());
});
await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });

const screen = page.getByTestId("device-screen");
const box = await screen.boundingBox();
if (!box || Math.abs(box.width - 393) > 1 || Math.abs(box.height - 852) > 1) {
  throw new Error(`Expected 393 x 852 device screen, got ${box?.width} x ${box?.height}`);
}

const capturedStates = [];
const capture = async (name) => {
  await page.waitForTimeout(750);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(5, 5);
  await page.getByTestId("mobile-cursor").evaluate((element) => {
    element.setAttribute("data-visible", "false");
  });
  await page.waitForTimeout(200);
  const scroll = page.locator("[data-flow-current='true'] .mobile-scroll");
  const scrollState = await scroll.evaluate((element) => {
    const content = element.querySelector(".mobile-scroll-content");
    const main = element.querySelector("main");
    const flow = element.closest(".flow-screen");
    const device = element.closest("[data-phone-screen]");
    const scrollRect = element.getBoundingClientRect();
    const flowRect = flow?.getBoundingClientRect();
    const deviceRect = device?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    return {
      windowScrollY: window.scrollY,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overscroll: element.getAttribute("data-overscroll"),
      contentTransform: content ? getComputedStyle(content).transform : null,
      mainTop: mainRect?.top,
      mainHeight: mainRect?.height,
      scrollTopEdge: scrollRect.top,
      flowTop: flowRect?.top,
      flowTransform: flow ? getComputedStyle(flow).transform : null,
      deviceTop: deviceRect?.top,
    };
  });
  capturedStates.push({ name, ...scrollState });
  await page.screenshot({ path: new URL(`${name}.png`, root).pathname, clip: box });
};

for (const variant of ["a", "b", "c", "d"]) {
  const variantPage = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
  await variantPage.goto(`http://127.0.0.1:4173/?ad_variant=${variant}`, { waitUntil: "networkidle" });
  await variantPage.getByTestId("device-screen").screenshot({ path: new URL(`00-hero-${variant}.png`, root).pathname });
  await variantPage.close();
}

await capture("01-hero");
await page.getByRole("button", { name: "테스트 시작하기" }).click();
await page.getByTestId("screen-question-1").waitFor();
await capture("02-question-1");

await page.getByTestId("screen-question-1").getByRole("button", { name: "거의 매일" }).click();
await page.getByTestId("screen-question-2").waitFor();
await page.getByTestId("screen-question-2").getByRole("button", { name: "3~5끼" }).click();
await page.getByTestId("screen-question-3").waitFor();
await page.getByTestId("screen-question-3").getByRole("button", { name: "먹은 양을 눈대중으로 기록" }).click();
await page.getByTestId("screen-question-4").waitFor();
await page.getByTestId("screen-question-4").getByRole("button", { name: "재료와 양을 하나씩 입력하는 것" }).click();
await page.getByTestId("screen-result").waitFor();
const resultPage = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
await resultPage.goto("http://127.0.0.1:4173/?result=%EB%88%88%EB%8C%80%EC%A4%91%20%EC%9E%A5%EC%9D%B8", { waitUntil: "networkidle" });
const directResultScreen = resultPage.getByTestId("device-screen");
await resultPage.waitForTimeout(750);
await directResultScreen.screenshot({ path: new URL("03-result-eyeballing.png", root).pathname });
await resultPage.close();
capturedStates.push({ name: "03-result-eyeballing", direct: true });

await page.getByTestId("screen-result").getByRole("button", { name: "무먹으로 20초 체험하기" }).click();
await page.getByTestId("screen-demo-1").waitFor();
await capture("03a-demo-1");
await page.getByTestId("screen-demo-1").getByRole("button", { name: "무먹으로 가져오기" }).click();
await page.getByText("레시피를 가져오는 중…", { exact: true }).waitFor();
await capture("03b-demo-1-loading");
await page.getByTestId("screen-demo-2").waitFor();
await capture("04-demo-2");
await page.getByTestId("screen-demo-2").getByRole("button", { name: "돼지고기 양을 520g으로 바꾸기" }).click();
await page.waitForFunction(() => document.querySelector('[data-testid="pork-amount"]')?.textContent === "520g");
await capture("04b-demo-2-adjusted");
await page.getByTestId("screen-demo-2").getByRole("button", { name: "다음" }).click();
await page.getByTestId("screen-demo-3").waitFor();
await capture("04c-demo-3");
await page.getByTestId("screen-demo-3").getByRole("button", { name: "저울로 재보니 1,180g" }).click();
await page.getByTestId("screen-demo-4").waitFor();
await capture("05-demo-4");
await page.getByTestId("screen-demo-4").getByRole("button", { name: "320g 입력하기" }).click();
await page.getByTestId("screen-demo-5").waitFor();
await capture("06-demo-5");

await page.getByTestId("screen-demo-5").getByRole("button", { name: "식단에 기록하기" }).click();
await page.getByTestId("screen-planner-homecook").waitFor();
await page.getByTestId("screen-planner-homecook").waitFor({ state: "visible" });
await page.waitForTimeout(3900);
await capture("07-planner-homecook");
await page.getByTestId("screen-planner-homecook").getByRole("button", { name: "편의점 음식도 기록해보기" }).click();
await page.getByTestId("screen-packaged-food").waitFor();
await capture("08-packaged-food");
await page.getByTestId("screen-packaged-food").getByRole("button", { name: "더:단백 드링크 초코 + 기록하기" }).click();
await page.getByTestId("screen-planner-complete").waitFor();
await page.waitForTimeout(3800);
await capture("09-planner-complete");

await page.getByTestId("screen-planner-complete").getByRole("button", { name: "무료 베타 먼저 써보기" }).click();
await page.getByTestId("screen-beta").waitFor();
await capture("10-beta");
await page.getByRole("textbox", { name: "이메일" }).fill("hello@example.com");
await page.getByRole("checkbox", { name: /베타 초대용 이메일 수집·이용에 동의/ }).check();
await page.getByTestId("screen-beta").getByRole("button", { name: "무료 베타 초대받기" }).click();
await page.getByTestId("screen-success").waitFor();
await capture("11-success");

await browser.close();
console.log(JSON.stringify({ screen: box, captures: capturedStates, consoleErrors }, null, 2));
