/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const budgets = JSON.parse(
  readFileSync(join(__dirname, "qa", "lighthouse-budget.json"), "utf8"),
);
const LIGHTHOUSE_PORT = 3100;
const LIGHTHOUSE_BASE_URL = `http://127.0.0.1:${LIGHTHOUSE_PORT}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand:
        `corepack pnpm start --hostname 127.0.0.1 --port ${LIGHTHOUSE_PORT}`,
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 120000,
      numberOfRuns: 3,
      settings: {
        budgets,
        chromeFlags: "--headless --no-sandbox",
        formFactor: "mobile",
        onlyCategories: ["performance", "accessibility"],
        throttling: {
          cpuSlowdownMultiplier: 4,
          rttMs: 100,
          throughputKbps: 4096,
        },
        throttlingMethod: "simulate",
      },
      url: [
        `${LIGHTHOUSE_BASE_URL}/beta`,
      ],
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "total-blocking-time": ["error", { maxNumericValue: 900 }],
      },
    },
    upload: {
      outputDir: ".lighthouseci-marketing",
      target: "filesystem",
    },
  },
};
