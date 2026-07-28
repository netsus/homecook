export function normalizeProductionStartArgs(args) {
  return args[0] === "--" ? args.slice(1) : [...args];
}
