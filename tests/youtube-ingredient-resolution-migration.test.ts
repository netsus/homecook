import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261009200000_youtube_ingredient_resolution.sql";

describe("YouTube ingredient resolution migration", () => {
  it("uses the same ranked closed size-wrapper policy as TypeScript", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("candidate_rank");
    expect(sql).toContain("큰");
    expect(sql).toContain("작은");
    expect(sql).toContain("사이즈");
    expect(sql).toContain("match_ingredient_name_exact_with_context");
    expect(sql).toContain("v_original_name");
    expect(sql).toContain("spaghetti");
    expect(sql).toContain("^spaghetti[[:space:]]+");
    expect(sql).toContain("(g|그램)$");
    expect(sql).toContain("(kg|킬로그램)$");
    expect(sql).toContain("min(candidate_rank)");
    expect(sql).not.toMatch(/similarity\(|levenshtein\(|limit 1/i);
  });

  it("adds only the reviewed full cooking-wine synonym and preserves catalog ambiguity", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("('맛술', '맛술(미림)')");
    expect(sql).not.toContain("('파스타면', '스파게티')");
    expect(sql).not.toContain("('바질', '바질 잎')");
    expect(sql).not.toContain("('두부', '큰 사이즈 두부')");
    expect(sql).not.toMatch(/update\s+public\.ingredients|delete\s+from\s+public\.ingredients/i);
  });

  it("attests exact helper definitions and authority through the shared dependency contract", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("ingredient_resolution_helpers");
    expect(sql).toContain("public.ingredient_lookup_name_candidates(text,text,text)");
    expect(sql).toContain("public.match_ingredient_name_exact_with_context(text,text,text)");
    expect(sql).toContain("public.match_ingredient_name_exact(text)");
    expect(sql).toContain("definition_sha256");
    expect(sql).toContain("security_definer=");
    expect(sql).toContain("|acl=");
  });
});
