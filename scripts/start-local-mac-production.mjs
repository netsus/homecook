import { startLocalMacProductionRuntime } from "./lib/local-mac-production.mjs";

try {
  const child = await startLocalMacProductionRuntime({
    args: process.argv.slice(2),
  });

  child.on("error", () => {
    process.stderr.write("Unable to start the local Mac production process.\n");
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Local Mac production startup failed."}\n`,
  );
  process.exit(1);
}
