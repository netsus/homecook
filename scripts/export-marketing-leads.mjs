#!/usr/bin/env node

import {
  MarketingValidationOperationError,
  runMarketingLeadExport,
} from "./lib/marketing-validation-operations.mjs";

try {
  const summary = await runMarketingLeadExport();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  const message = error instanceof MarketingValidationOperationError
    ? error.message
    : "마케팅 lead export에 실패했어요.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
