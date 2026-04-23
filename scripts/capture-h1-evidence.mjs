#!/usr/bin/env node
/**
 * H1 home-first-impression — evidence capture script
 * Captures E1~E7 screenshots for authority review.
 *
 * Usage:
 *   pnpm dev   (in another terminal)
 *   node scripts/capture-h1-evidence.mjs [--before]
 *
 * --before  captures E1 (before) only, using current baseline
 * (default) captures E2~E7 (after)
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EVIDENCE_DIR = path.resolve(
  fileURLToPath(import.meta.url),
  "../../ui/designs/evidence/h1-home-first-impression",
);
const BASE_URL = "http://localhost:3000";

const isBefore = process.argv.includes("--before");

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function waitForHomeReady(page) {
  // wait for at least recipe list or empty state
  await page.waitForFunction(() => {
    const headings = Array.from(document.querySelectorAll("h2"));
    return headings.some(
      (h) =>
        h.textContent?.includes("모든 레시피") ||
        h.textContent?.includes("검색 결과") ||
        h.textContent?.includes("다른 조합"),
    );
  }, { timeout: 10000 });
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    if (isBefore) {
      await captureBeforeMobile(browser);
      log("✅ E1 before mobile saved");
      return;
    }

    await captureAfterMobile(browser);
    log("✅ E2 after mobile 390px saved");

    await captureAfterNarrow(browser);
    log("✅ E3 after narrow 320px saved");

    await captureAfterScrolled(browser);
    log("✅ E4 after scrolled saved");

    await captureFilterActive(browser);
    log("✅ E5 filter active saved");

    await captureSortActive(browser);
    log("✅ E6 sort active saved");

    await captureCarouselStrip(browser);
    log("✅ E7 carousel strip saved");

    log(`\nAll evidence captured at: ${EVIDENCE_DIR}`);
  } finally {
    await browser.close();
  }
}

async function captureBeforeMobile(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHomeReady(page);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, "HOME-before-mobile.png"),
    fullPage: false,
  });
  await page.close();
}

async function captureAfterMobile(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHomeReady(page);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, "HOME-after-mobile.png"),
    fullPage: false,
  });
  await page.close();
}

async function captureAfterNarrow(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHomeReady(page);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, "HOME-after-narrow.png"),
    fullPage: false,
  });
  await page.close();
}

async function captureAfterScrolled(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHomeReady(page);
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, "HOME-after-scrolled.png"),
    fullPage: false,
  });
  await page.close();
}

async function captureFilterActive(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHomeReady(page);

  // open ingredient filter modal
  await page.getByRole("button", { name: /재료로 검색/ }).click();
  await page.getByRole("dialog", { name: "재료로 검색" }).waitFor();

  // try to check first visible checkbox (only if ingredients loaded)
  const checkboxes = page.getByRole("checkbox");
  const checkboxCount = await checkboxes.count();
  if (checkboxCount > 0) {
    const firstCheckbox = checkboxes.first();
    if (await firstCheckbox.isEnabled()) {
      await firstCheckbox.click();
      // apply button may now be enabled
      const applyBtn = page.getByRole("button", { name: /적용/ });
      if (await applyBtn.isEnabled()) {
        await applyBtn.click();
        await page.waitForTimeout(300);
      }
    }
  } else {
    // no ingredients loaded — close modal and screenshot discovery panel
    await page.getByRole("button", { name: "닫기" }).click();
    await page.waitForTimeout(200);
  }

  await page.screenshot({
    path: path.join(EVIDENCE_DIR, "HOME-filter-active.png"),
    fullPage: false,
  });
  await page.close();
}

async function captureSortActive(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHomeReady(page);
  await page.getByRole("button", { name: /정렬 기준/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, "HOME-sort-active.png"),
    fullPage: false,
  });
  await page.close();
}

async function captureCarouselStrip(browser) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForHomeReady(page);
  // Focus on the carousel strip area
  const carousel = page.locator('[data-testid="theme-carousel"]').first();
  if (await carousel.isVisible()) {
    await carousel.scrollIntoViewIfNeeded();
  }
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, "HOME-carousel-strip.png"),
    fullPage: false,
  });
  await page.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
