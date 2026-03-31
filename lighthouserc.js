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
      numberOfRuns: 1,
      url: [
        `${LIGHTHOUSE_BASE_URL}/`,
        `${LIGHTHOUSE_BASE_URL}/recipe/mock-kimchi-jjigae`,
      ],
      settings: {
        chromeFlags: "--headless --no-sandbox",
        budgets,
        onlyCategories: ["performance"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.7 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 400 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
