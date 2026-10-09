import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateRecipeDraftNutrition,
  RecipeDraftNutritionValidationError,
  type RecipeDraft,
} from "@/lib/server/recipe-content-snapshot-future-propagation";

// An offline export from the isolated DB: this test never connects to a database.
const fixturePath = process.env.HOMECOOK_PIECE_DRAFT_PARITY_FIXTURE;
type Row = Record<string, unknown>;
type Fixture = {
  schema: string;
  tables: Record<string, Row[]>;
  cases: Array<{ id: string; draft: RecipeDraft; expected: unknown; expectedDuplicateRejection: boolean }>;
};

describe.skipIf(!fixturePath)("piece evidence SQL/JS draft parity", () => {
  it("preserves the SQL-selected piece evidence through the actual draft calculation", async () => {
    const fixture = JSON.parse(readFileSync(fixturePath!, "utf8")) as Fixture;
    expect(fixture.schema).toBe("homecook.piece-unit-draft-parity.v1");
    expect(fixture.cases.length).toBeGreaterThan(0);
    const client = {
      from(table: string) {
        let rows = [...(fixture.tables[table] ?? [])];
        const query = {
          select: () => query,
          in(key: string, values: string[]) { rows = rows.filter(row => values.includes(String(row[key]))); return query; },
          eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
          order(key: string) { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return query; },
          async range(from: number, to: number) { return { data: rows.slice(from, to + 1), error: null }; },
        };
        return query;
      },
    };
    for (const row of fixture.cases) {
      const calculation = calculateRecipeDraftNutrition(client, {
        recipeId: row.id, baseRecipeRevision: 1, draft: row.draft,
      });
      if (row.expectedDuplicateRejection) {
        await expect(calculation).rejects.toBeInstanceOf(RecipeDraftNutritionValidationError);
        continue;
      }
      const result = await calculation;
      expect(result.predecessorGuard, row.id).toEqual(row.expected);
    }
  });
});
