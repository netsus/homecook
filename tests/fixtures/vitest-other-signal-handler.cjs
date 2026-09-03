"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- NODE_OPTIONS fixture must remain CommonJS. */

const { writeFileSync } = require("node:fs");
const { isMainThread } = require("node:worker_threads");

const signal = process.env.HOMECOOK_VITEST_TEARDOWN_SIGNAL;
const marker = process.env.HOMECOOK_VITEST_TEARDOWN_OTHER_HANDLER_MARKER;
if (isMainThread && signal && marker) {
  const otherHandler = () => {
    const survived = process.listeners(signal).includes(otherHandler);
    process.removeListener(signal, otherHandler);
    writeFileSync(marker, `${signal}:${survived}\n`, { flag: "wx", mode: 0o600 });
  };
  process.on(signal, otherHandler);
}
