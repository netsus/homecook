#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { inventoryHybridAuthorityPaths } from "./lib/hybrid-authority-inventory.mjs";

const root = process.cwd();
const servicePath = resolve(
  root,
  "docs/workpacks/hybrid-auth-local-data-production/hybrid-service-role-inventory.json",
);
const storagePath = resolve(
  root,
  "docs/workpacks/hybrid-auth-local-data-production/hybrid-browser-storage-direct-inventory.json",
);
const check = process.argv.includes("--check");
const inventory = inventoryHybridAuthorityPaths(root);
const serviceContent = `${JSON.stringify({
  generated_from: "scripts/lib/hybrid-authority-inventory.mjs",
  user_service_role_violation_count:
    inventory.userServiceRoleViolations.length,
  user_direct_service_role_count:
    inventory.userDirectServiceRoleEntries.length,
  remote_compatibility_entries: inventory.remoteCompatibilityEntries,
  public_allowlist_files: inventory.publicAllowlistFiles,
  admin_allowlist_files: inventory.adminAllowlistFiles,
  internal_allowlist_files: inventory.internalAllowlistFiles,
  service_role_entries: inventory.serviceRoleEntries,
  service_role_fallback_entries: inventory.serviceRoleFallbackEntries,
}, null, 2)}\n`;
const storageContent = `${JSON.stringify({
  stage: 2,
  removal_stage: 4,
  generated_from: "scripts/lib/hybrid-authority-inventory.mjs",
  browser_direct_storage_paths: inventory.browserDirectStoragePaths,
}, null, 2)}\n`;

if (check) {
  if (
    readFileSync(servicePath, "utf8") !== serviceContent
    || readFileSync(storagePath, "utf8") !== storageContent
  ) {
    throw new Error("Hybrid authority inventory artifacts are stale");
  }
} else {
  writeFileSync(servicePath, serviceContent);
  writeFileSync(storagePath, storageContent);
}
