#!/usr/bin/env node
/**
 * wave1-port-foundation — primitive evidence capture
 *
 * Captures the HOME screen which uses shared primitives (Button, Chip, Card,
 * BottomTabs, AppHeader) at 390px and 320px viewports for authority evidence.
 *
 * Usage:
 *   pnpm dev:qa-fixtures   (in another terminal)
 *   node scripts/capture-wave1-foundation-evidence.mjs
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const EVIDENCE_DIR = path.join(
  ROOT,
  "ui/designs/evidence/wave1-port-foundation",
);
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const VIEWPORTS = [
  { width: 390, height: 844, label: "mobile" },
  { width: 320, height: 568, label: "mobile-narrow" },
];

async function hideNextDevOverlay(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-dev-tools-button],
      [data-nextjs-dev-tools-indicator],
      [data-nextjs-dialog],
      [data-nextjs-dialog-overlay],
      [data-nextjs-toast],
      [data-nextjs-terminal],
      [data-nextjs-build-error] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `,
  });
}

async function capture() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();

    // Capture HOME which uses AppShell, BottomTabs, Chip, Card primitives
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await hideNextDevOverlay(page);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `primitives-${vp.label}.png`),
      fullPage: false,
    });

    // Capture planner which uses AppShell, AppHeader, BottomTabs, SelectionChipRail
    await page.goto(`${BASE_URL}/planner`, { waitUntil: "networkidle" });
    await hideNextDevOverlay(page);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `planner-primitives-${vp.label}.png`),
      fullPage: false,
    });

    await ctx.close();
  }

  await browser.close();
  process.stdout.write(`Evidence captured to ${EVIDENCE_DIR}\n`);
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
