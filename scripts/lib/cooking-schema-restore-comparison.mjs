// Compare pg_dump schema-only snapshots without hiding function bodies or ACL entries.
const arrays = [
  ["cooking_sessions", "cooking_sessions_contract_namespace_check", ["planner", "standalone"]],
  ["cooking_sessions", "cooking_sessions_contract_version_check", ["legacy_v1", "snapshot_v2"]],
  ["meals", "meals_recipe_content_snapshot_origin_check", ["created", "legacy_backfill"]],
  ["nutrition_values", "nutrition_values_check", ["observed", "estimated"]],
  ["nutrition_values", "nutrition_values_value_status_check", ["observed", "estimated", "missing", "trace", "parse_error"]],
];
export function canonicalCookingSchemaDump(text) {
  const header = /^--\n-- Name: (.*?); Type: (.*?); Schema: (.*?); Owner: (.*?)\n--\n/gmu;
  const blocks = [...text.matchAll(header)];
  if (!blocks.length) throw new Error("Expected pg_dump object headers");
  const normalizeHeader = value => value.replace(/^\\(?:un)?restrict .*$/gmu, "")
    .replace(/^-- (?:Dumped from database version|Dumped by pg_dump version|Started on|Completed on).*$/gmu, "");
  const parts = [normalizeHeader(text.slice(0, blocks[0].index))];
  for (const [index, match] of blocks.entries()) {
    const [, name, type, schema] = match;
    let block = text.slice(match.index, blocks[index + 1]?.index);
    if (index === blocks.length - 1) block = block.replace(/\n\\unrestrict [^\n]*\n?$/u, "\n");
    if (type === "FUNCTION" || type === "PROCEDURE") {
      // Supported pg_dump functions have one complete outer dollar-quoted body.
      // A header embedded inside it would truncate this block: reject instead of canonicalizing it.
      const body = /\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)/u.exec(block);
      if (!body || block.indexOf(body[1], body.index + body[0].length) < 0) {
        throw new Error("Unsupported or truncated function dump block");
      }
    } else if (type === "TABLE" && schema === "public") {
      block = block.split("\n").map(line => {
        for (const [table, constraint, terms] of arrays) {
          if (table !== name || !line.trimStart().startsWith(`CONSTRAINT ${constraint} `)) continue;
          const values = terms.map(term => `'${term}'::character varying`);
          // PostgreSQL deparses varchar[] -> text[] as pointwise text casts after restore.
          line = line.replaceAll(`((ARRAY[${values.join(", ")}])::text[])`,
            `(ARRAY[${values.map(value => `(${value})::text`).join(", ")}])`);
        }
        return line;
      }).join("\n");
    } else if (type === "POLICY") {
      block = block.replace(/^(CREATE POLICY .*? TO )([a-z_ ,]+)(?= USING | WITH CHECK |;)/gmu,
        (_all, prefix, roles) => prefix + roles.split(", ").sort().join(", "));
    } else if (type === "ACL" || type === "DEFAULT ACL") {
      // GRANTs are monotonic within one uninterrupted run. Never move one across REVOKE/context changes.
      const lines = block.split("\n"), output = [], grants = [];
      const flush = () => { output.push(...grants.sort()); grants.length = 0; };
      for (const line of lines) {
        if (/^(?:GRANT |ALTER DEFAULT PRIVILEGES .* GRANT )/u.test(line)) grants.push(line);
        else { flush(); output.push(line); }
      }
      flush(); block = output.join("\n");
    }
    parts.push(block);
  }
  return parts.join("").trim();
}
