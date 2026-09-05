#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runMarketingProductionReadinessCli } from "./lib/marketing-validation-production-readiness.mjs";

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  runMarketingProductionReadinessCli();
}

export { runMarketingProductionReadinessCli };
