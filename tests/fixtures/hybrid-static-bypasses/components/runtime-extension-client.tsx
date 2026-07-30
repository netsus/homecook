"use client";

import "../stores/forbidden-cjs.cjs";
import "../stores/forbidden-cts.cjs";
import "../stores/forbidden-jsx.jsx";
import "../stores/forbidden-mts.mjs";
import "../stores/forbidden-runtime-index";
import "../lib/api/safe-runtime-mts.mjs";
import type { SafeRuntimeType } from "../lib/api/safe-runtime-type.mjs";

export type RuntimeExtensionType = SafeRuntimeType;
