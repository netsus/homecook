import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const projectRoot = new URL("../", import.meta.url);
const assetUrl = new URL("public/assets/funnel/", projectRoot);
const outputUrl = new URL("share/og-share.png", assetUrl);
await mkdir(new URL("share/", assetUrl), { recursive: true });

const toDataUrl = async (url) => {
  const bytes = await readFile(url);
  return `data:image/png;base64,${bytes.toString("base64")}`;
};

const logo = await toDataUrl(new URL("brand/mumeok-logo-horizontal.png", assetUrl));
const character = await toDataUrl(new URL("characters/eyeballing-master.png", assetUrl));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

await page.setContent(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f4fbff;color:#2f3438;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;overflow:hidden}
main{position:relative;width:100%;height:100%;padding:54px 70px;display:grid;grid-template-columns:58% 42%;align-items:center}
.logo{width:172px;height:auto}.kicker{margin:46px 0 12px;color:#0072bd;font-size:27px;font-weight:800}.title{margin:0;font-size:66px;line-height:1.08;letter-spacing:-.055em}.title em{color:#00a1ff;font-style:normal}.copy{margin:26px 0 0;color:#5e6973;font-size:27px;line-height:1.42;font-weight:650}.character{width:440px;height:500px;object-fit:contain;justify-self:center}.badge{position:absolute;right:64px;bottom:43px;padding:13px 22px;border-radius:999px;background:#00a1ff;color:white;font-size:22px;font-weight:800}
</style></head><body><main><section><img class="logo" src="${logo}" alt=""><p class="kicker">30초 집밥 기록 테스트</p><h1 class="title">나의 집밥 기록 타입은<br><em>무엇일까요?</em></h1><p class="copy">결과를 확인하고 무먹의<br>집밥 기록 흐름을 직접 체험해보세요.</p></section><img class="character" src="${character}" alt=""><span class="badge">무먹 · 무엇을 먹든</span></main></body></html>`);
await page.screenshot({ path: outputUrl.pathname });
await browser.close();
console.log(outputUrl.pathname);
