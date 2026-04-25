/**
 * @typedef {{
 *   kind: "command",
 *   command: string,
 *   args: string[],
 *   label: string,
 * } | {
 *   kind: "message",
 *   label: string,
 * } | {
 *   kind: "start-app",
 *   args: string[],
 *   label: string,
 * }} DevDemoPlanStep
 */

/**
 * @param {{
 *   reset: boolean,
 *   seed: boolean,
 *   isReady: boolean,
 *   seedArgs?: string[],
 *   nextArgs?: string[],
 * }} options
 * @returns {DevDemoPlanStep[]}
 */
export function buildDevDemoPlan({
  reset,
  seed,
  isReady,
  seedArgs = [],
  nextArgs = [],
}) {
  if (reset) {
    return [
      {
        kind: "command",
        command: "node",
        args: ["scripts/local-reset-demo-data.mjs", ...seedArgs],
        label: "1/2 local demo dataset reset",
      },
      {
        kind: "start-app",
        args: [...nextArgs],
        label: "2/2 local app server start",
      },
    ];
  }

  const plan = [
    {
      kind: "command",
      command: "pnpm",
      args: ["dlx", "supabase", "start"],
      label: "1/4 local Supabase 시작",
    },
    {
      kind: "command",
      command: "pnpm",
      args: ["dlx", "supabase", "migration", "up"],
      label: "2/4 local Supabase migrations apply",
    },
  ];

  if (seed) {
    plan.push({
      kind: "command",
      command: "node",
      args: ["scripts/local-seed-demo-data.mjs", ...seedArgs],
      label: "3/4 local demo dataset seed",
    });
  } else if (isReady) {
    plan.push({
      kind: "message",
      label: "3/4 local demo dataset already ready",
    });
  } else {
    plan.push({
      kind: "command",
      command: "node",
      args: ["scripts/local-seed-demo-data.mjs", ...seedArgs],
      label: "3/4 local demo dataset seed",
    });
  }

  plan.push({
    kind: "start-app",
    args: [...nextArgs],
    label: "4/4 local app server start",
  });

  return plan;
}
