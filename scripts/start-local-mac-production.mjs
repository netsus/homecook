import { startLocalMacProductionRuntime } from "./lib/local-mac-production.mjs";
import { relayChildLifecycle } from "./lib/process-signal-relay.mjs";

try {
  const child = await startLocalMacProductionRuntime({
    args: process.argv.slice(2),
  });

  relayChildLifecycle(child, {
    errorMessage: "Unable to start the local Mac production process.",
    nullExitCode: 1,
  });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Local Mac production startup failed."}\n`,
  );
  process.exit(1);
}
