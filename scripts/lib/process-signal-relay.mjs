const RELAY_SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"];

/**
 * @typedef {{
 *   kill: (signal: string) => unknown,
 *   on: (event: string, listener: (...args: any[]) => void) => unknown,
 * }} RelayChild
 * @typedef {{
 *   pid: number,
 *   stderr: { write: (message: string) => unknown },
 *   once: (event: string, listener: () => void) => unknown,
 *   kill: (pid: number, signal: string) => unknown,
 *   exit: (code: number) => unknown,
 * }} RelayProcess
 */

/**
 * @param {RelayChild} child
 * @param {{
 *   processRef?: RelayProcess,
 *   errorMessage: string,
 *   nullExitCode: number,
 * }} options
 */
export function relayChildLifecycle(child, {
  processRef = process,
  errorMessage,
  nullExitCode,
}) {
  for (const signal of RELAY_SIGNALS) {
    processRef.once(signal, () => {
      child.kill(signal);
    });
  }

  child.on("error", () => {
    processRef.stderr.write(`${errorMessage}\n`);
    processRef.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      processRef.kill(processRef.pid, signal);
      return;
    }

    processRef.exit(code ?? nullExitCode);
  });
}
