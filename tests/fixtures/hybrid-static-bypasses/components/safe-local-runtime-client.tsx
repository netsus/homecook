/* eslint-disable @typescript-eslint/no-require-imports -- safe CommonJS import-gate fixture */
"use client";

export const safeCommonJs = require("../lib/api/safe-commonjs");
export const loadSafeEsm = () => import("../lib/api/safe-commonjs");
