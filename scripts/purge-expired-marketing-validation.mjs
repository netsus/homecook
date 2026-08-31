#!/usr/bin/env node

import {
  MarketingValidationOperationError,
  runExpiredMarketingValidationPurge,
} from "./lib/marketing-validation-operations.mjs";

try {
  const summary = await runExpiredMarketingValidationPurge();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  const message = error instanceof MarketingValidationOperationError
    ? error.message
    : "마케팅 retention purge에 실패했어요.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
